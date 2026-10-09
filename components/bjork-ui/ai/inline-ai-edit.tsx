"use client";

import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import {
  FOCUS_RING,
  PRESS,
  SHIMMER_TEXT_CSS,
  useAiTone,
  useControllable,
  useReduceMotion,
  type BjorkTone,
} from "@/components/bjork-ui/ai/_shared";
import { StrokeMorphIcon } from "@/components/bjork-ui/utilities/stroke-morph-icon";
import { cn } from "@/lib/utils";

export type RewriteResult = AsyncIterable<string> | Promise<string>;

export interface InlineAiEditPose {
  /** String offsets of the rewritten range in `value`. */
  start: number;
  end: number;
  /** The proposed replacement, shown as finished. */
  proposal: string;
  /** Label for the instruction, e.g. "Shorter". */
  label?: string;
}

export interface InlineAiEditProps {
  /** Paragraphs separated by blank lines. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Rewrites the selected text. Return an async iterable of chunks to stream, or a promise of the full text. */
  onRewrite?: (selectedText: string, instruction: string) => RewriteResult;
  /** Accessible name for the document. Default "Document". */
  label?: string;
  /** Demo/preview only: render a finished proposal without a real selection. */
  pose?: InlineAiEditPose;
  tone?: BjorkTone;
  className?: string;
}

export const SAMPLE_DOCUMENT = `Fieldnotes 4.2 is the biggest update to the editor since we launched. Drafts now sync in the background, so you can close the lid in the middle of a sentence and pick it up on your phone a few seconds later.

We also rebuilt search from scratch. It is a lot more faster then before and it actually understands what you mean, even when you only remember one word from a note you wrote three months ago in a hurry on the train.

Shared libraries are rolling out to every Studio workspace this week. If you run a team, you can now keep one set of templates, tags and snippets that everyone pulls from, instead of copying them between notebooks.`;

const QUICK = [
  { label: "Improve", instruction: "Improve the writing. Keep the meaning." },
  { label: "Shorter", instruction: "Make it shorter." },
  { label: "Longer", instruction: "Make it longer with one concrete detail." },
  { label: "Fix grammar", instruction: "Fix spelling and grammar only." },
] as const;

const TONES = ["Friendly", "Confident", "Formal", "Casual"] as const;

// ---------------------------------------------------------------------------------------------------------------
// Mock model

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function rewriteLocally(text: string, instruction: string): string {
  const i = instruction.toLowerCase();
  const fixed = text
    .replace(/\ba lot more faster\b/gi, "much faster")
    .replace(/\bmore faster\b/gi, "faster")
    .replace(/\bthen before\b/gi, "than before")
    .replace(/\s{2,}/g, " ");
  if (i.includes("grammar")) return fixed;
  if (i.includes("shorter")) {
    const first = fixed.split(/(?<=[.!?])\s/)[0] ?? fixed;
    return first
      .replace(/,? even when [^.]*/i, "")
      .replace(/\b(actually|really|just|now|also)\s/gi, "")
      .replace(/\s+([.,])/g, "$1");
  }
  if (i.includes("longer")) {
    return `${fixed.replace(/[.!?]?$/, "")}, and results now appear as you type, ranked by how recently you opened each note.`;
  }
  if (i.includes("friendly")) return `Good news: ${fixed.charAt(0).toLowerCase()}${fixed.slice(1)}`;
  if (i.includes("formal")) return fixed.replace(/\bIt is\b/g, "It is now").replace(/\bactually\b/gi, "reliably");
  if (i.includes("confident")) return fixed.replace(/\bactually\b/gi, "reliably").replace(/\ba lot\b/gi, "far");
  if (i.includes("casual")) return fixed.replace(/\bIt is\b/g, "It's").replace(/\bdo not\b/g, "don't");
  return fixed
    .replace(/\bIt is much faster than before and it actually understands what you mean\b/i, "It is much faster, and it understands what you mean")
    .replace(/\bin a hurry on the train\b/i, "on a rushed train ride");
}

/** A local stand-in for a model: rewrites deterministically and streams the result a word at a time. */
export async function* mockRewrite(selectedText: string, instruction: string): AsyncGenerator<string> {
  const out = rewriteLocally(selectedText, instruction);
  await wait(320);
  for (const word of out.match(/\S+\s*/g) ?? []) {
    await wait(34 + (word.length % 5) * 9);
    yield word;
  }
}

function isAsyncIterable(x: unknown): x is AsyncIterable<string> {
  return typeof x === "object" && x !== null && Symbol.asyncIterator in x;
}

// ---------------------------------------------------------------------------------------------------------------
// Geometry

interface Anchor {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

const GAP = 8;

/** Places a floating box near an anchor: preferred side first, flipped when cramped, clamped inside the box. */
function place(el: HTMLElement, anchor: Anchor, boxWidth: number, prefer: "above" | "below") {
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const above = anchor.top - h - GAP;
  const below = anchor.bottom + GAP;
  const top = prefer === "above" ? (above >= -4 ? above : below) : below;
  const left = Math.max(0, Math.min(boxWidth - w, anchor.left + anchor.width / 2 - w / 2));
  el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

function relativeAnchor(rect: DOMRect, box: DOMRect): Anchor {
  return { top: rect.top - box.top, bottom: rect.bottom - box.top, left: rect.left - box.left, width: rect.width };
}

/** String offset in `value` for a DOM point inside a paragraph, or null when the point is outside one. */
function offsetOf(root: HTMLElement, node: Node, offset: number): number | null {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  const para = el?.closest<HTMLElement>("[data-para-offset]");
  if (!para || !root.contains(para)) return null;
  const r = document.createRange();
  r.selectNodeContents(para);
  try {
    r.setEnd(node, offset);
  } catch {
    return null;
  }
  return Number(para.dataset.paraOffset) + r.toString().length;
}

// ---------------------------------------------------------------------------------------------------------------
// Component

interface Selection {
  start: number;
  end: number;
  anchor: Anchor;
}

interface Proposal {
  start: number;
  end: number;
  original: string;
  text: string;
  instruction: string;
  label: string;
  status: "streaming" | "done" | "error";
}

/** Select text, ask AI, and review the rewrite inline before it replaces anything. */
export function InlineAiEdit({
  value,
  defaultValue = SAMPLE_DOCUMENT,
  onValueChange,
  onRewrite = mockRewrite,
  label = "Document",
  pose,
  tone: toneProp,
  className,
}: InlineAiEditProps) {
  const { style } = useAiTone(toneProp);
  const reduce = useReduceMotion();
  const [doc, setDoc] = useControllable(value, defaultValue, onValueChange);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [frozen, setFrozen] = useState(false);
  const [proposalState, setProposal] = useState<Proposal | null>(null);
  const [ask, setAsk] = useState("");
  const [toneOpen, setToneOpen] = useState(false);
  const [message, setMessage] = useState("");
  const inputId = useId();

  const rootRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const acceptRef = useRef<HTMLButtonElement>(null);
  const insRef = useRef<HTMLModElement>(null);
  const lastPara = useRef(0);
  const runId = useRef(0);

  const proposal: Proposal | null = pose
    ? {
        start: pose.start,
        end: pose.end,
        original: doc.slice(pose.start, pose.end),
        text: pose.proposal,
        instruction: pose.label ?? "Improve",
        label: pose.label ?? "Improve",
        status: "done",
      }
    : proposalState;

  // Paragraphs and their offsets in the string.
  const paras = doc.split("\n\n").reduce<{ text: string; start: number }[]>((acc, text, i) => {
    const start = i === 0 ? 0 : acc[i - 1].start + acc[i - 1].text.length + 2;
    return [...acc, { text, start }];
  }, []);

  // ----- Selection tracking.
  const latest = useRef({ proposal, selection, frozen });
  useLayoutEffect(() => {
    latest.current = { proposal, selection, frozen };
  });

  useEffect(() => {
    if (pose) return;
    const onChange = () => {
      const root = docRef.current;
      if (!root || latest.current.proposal) return;
      // Focus moved into the toolbar: keep the selection the toolbar was opened for.
      if (toolbarRef.current?.contains(document.activeElement)) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) {
        setSelection(null);
        return;
      }
      let start = offsetOf(root, range.startContainer, range.startOffset);
      let end = offsetOf(root, range.endContainer, range.endOffset);
      if (start === null || end === null) return;
      const text = root.dataset.value ?? "";
      while (start < end && /\s/.test(text[start])) start++;
      while (end > start && /\s/.test(text[end - 1])) end--;
      if (end <= start) {
        setSelection(null);
        return;
      }
      const box = root.getBoundingClientRect();
      setSelection({ start, end, anchor: relativeAnchor(range.getBoundingClientRect(), box) });
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, [pose]);

  // Cmd/Ctrl+K opens the AI input for the current selection, or the paragraph last clicked.
  useEffect(() => {
    if (pose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      const root = docRef.current;
      if (!root || latest.current.proposal) return;
      const active = document.activeElement;
      const inside = rootRef.current?.contains(active) || active === document.body;
      if (!latest.current.selection && !inside) return;
      e.preventDefault();
      if (!latest.current.selection) {
        const para = root.querySelectorAll<HTMLElement>("[data-para-offset]")[lastPara.current];
        if (!para) return;
        const start = Number(para.dataset.paraOffset);
        const box = root.getBoundingClientRect();
        setSelection({
          start,
          end: start + (para.textContent ?? "").length,
          anchor: relativeAnchor(para.getBoundingClientRect(), box),
        });
      }
      setFrozen(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pose]);

  // ----- Floating placement, written straight to the DOM after layout.
  useLayoutEffect(() => {
    const root = docRef.current;
    if (!root) return;
    const width = root.clientWidth;
    if (toolbarRef.current && selection && !proposal) place(toolbarRef.current, selection.anchor, width, "above");
    if (barRef.current && insRef.current && proposal) {
      const rects = insRef.current.getClientRects();
      const last = rects[rects.length - 1] ?? insRef.current.getBoundingClientRect();
      place(barRef.current, relativeAnchor(last, root.getBoundingClientRect()), width, "below");
    }
  });

  // Focus Accept once the proposal is complete.
  const proposalDone = proposalState?.status === "done";
  useEffect(() => {
    if (proposalDone) acceptRef.current?.focus();
  }, [proposalDone]);

  const close = () => {
    setSelection(null);
    setFrozen(false);
    setToneOpen(false);
    setAsk("");
  };

  const run = async (instruction: string, labelText: string, range?: { start: number; end: number }) => {
    const target = range ?? selection;
    if (!target) return;
    const id = ++runId.current;
    const original = doc.slice(target.start, target.end);
    setProposal({ start: target.start, end: target.end, original, text: "", instruction, label: labelText, status: "streaming" });
    close();
    window.getSelection()?.removeAllRanges();
    requestAnimationFrame(() => barRef.current?.focus());
    setMessage(`Rewriting: ${labelText}`);
    try {
      const result = onRewrite(original, instruction);
      if (isAsyncIterable(result)) {
        let acc = "";
        for await (const chunk of result) {
          if (runId.current !== id) return;
          acc += chunk;
          const next = acc;
          setProposal((p) => (p ? { ...p, text: next } : p));
        }
      } else {
        const full = await result;
        if (runId.current !== id) return;
        setProposal((p) => (p ? { ...p, text: full } : p));
      }
      if (runId.current !== id) return;
      setProposal((p) => (p ? { ...p, text: p.text.trimEnd(), status: "done" } : p));
      setMessage("Suggestion ready. Enter to accept, Escape to discard.");
    } catch {
      if (runId.current !== id) return;
      setProposal((p) => (p ? { ...p, status: "error" } : p));
      setMessage("The rewrite failed.");
    }
  };

  const accept = () => {
    if (!proposalState || proposalState.status !== "done") return;
    runId.current++;
    setDoc(doc.slice(0, proposalState.start) + proposalState.text + doc.slice(proposalState.end));
    setProposal(null);
    setMessage("Rewrite accepted");
    docRef.current?.focus();
  };

  const discard = () => {
    if (!proposalState) return;
    runId.current++;
    setProposal(null);
    setMessage("Rewrite discarded");
    docRef.current?.focus();
  };

  const retry = () => {
    if (!proposalState) return;
    void run(proposalState.instruction, proposalState.label, proposalState);
  };

  const onRootKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (proposalState) {
      const onControl = (e.target as HTMLElement).closest("button,input");
      if (e.key === "Escape") {
        e.preventDefault();
        discard();
      } else if (e.key === "Enter" && !onControl) {
        e.preventDefault();
        accept();
      }
      return;
    }
    if (e.key === "Escape" && selection) {
      e.preventDefault();
      close();
      window.getSelection()?.removeAllRanges();
      docRef.current?.focus();
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = ask.trim();
    if (text) void run(text, text.length > 28 ? `${text.slice(0, 26)}…` : text);
  };

  // ----- Paragraph rendering with an inline proposal or a held selection.
  const mark = proposal
    ? { start: proposal.start, end: proposal.end, kind: "proposal" as const }
    : selection && frozen
      ? { start: selection.start, end: selection.end, kind: "held" as const }
      : null;

  const lastOverlap = mark ? paras.findLastIndex((p) => p.start <= mark.end && p.start + p.text.length >= mark.start) : -1;

  const renderPara = (p: { text: string; start: number }, i: number): ReactNode => {
    if (!mark) return p.text;
    const end = p.start + p.text.length;
    const os = Math.max(mark.start, p.start);
    const oe = Math.min(mark.end, end);
    if (os > oe || (os === oe && i !== lastOverlap)) return p.text;
    const before = p.text.slice(0, os - p.start);
    const inside = p.text.slice(os - p.start, oe - p.start);
    const after = p.text.slice(oe - p.start);
    if (mark.kind === "held") {
      return (
        <>
          {before}
          <span className="rounded-[2px] bg-[color:var(--bjork-accent-muted)] text-[color:var(--bjork-text)]">{inside}</span>
          {after}
        </>
      );
    }
    return (
      <>
        {before}
        {inside && (
          <del className="text-[color:var(--bjork-text-faint)] decoration-[color:var(--bjork-text-faint)] decoration-1">
            <span className="sr-only">Original: </span>
            {inside}
          </del>
        )}
        {i === lastOverlap && proposal && (
          <>
            {inside ? " " : null}
            <ins
              ref={insRef}
              className="rounded-[3px] bg-[color:var(--bjork-accent-soft)] px-0.5 text-[color:var(--bjork-text)] no-underline shadow-[inset_0_-1px_0_var(--bjork-accent-muted)] [box-decoration-break:clone]"
            >
              <span className="sr-only">Suggested: </span>
              {proposal.text}
              {proposal.status === "streaming" && (
                <span
                  aria-hidden="true"
                  className="ml-px inline-block h-[1em] w-[2px] translate-y-[3px] bg-[color:var(--bjork-accent)] motion-safe:animate-pulse"
                />
              )}
            </ins>
          </>
        )}
        {after}
      </>
    );
  };

  return (
    <div
      ref={rootRef}
      style={style}
      onKeyDown={onRootKey}
      className={cn("@container relative w-full min-w-0 max-w-[640px] font-bjork-alpha text-[color:var(--bjork-text)]", className)}
    >
      <style href="bjork-ai-shimmer" precedence="default">
        {SHIMMER_TEXT_CSS}
      </style>
      <style href="bjork-inline-ai-pop" precedence="default">
        {"@keyframes bjork-inline-ai-pop{from{opacity:0;scale:0.96}to{opacity:1;scale:1}}"}
      </style>

      <div
        ref={docRef}
        role="document"
        aria-label={label}
        aria-describedby={`${inputId}-hint`}
        tabIndex={0}
        data-value={doc}
        onPointerDown={(e) => {
          const para = (e.target as HTMLElement).closest<HTMLElement>("[data-para-index]");
          if (para) lastPara.current = Number(para.dataset.paraIndex);
        }}
        className={cn(
          "relative flex flex-col gap-3.5 rounded-[10px] text-[15px] leading-[26px] text-[color:var(--bjork-text-medium)] selection:bg-[color:var(--bjork-accent-muted)] selection:text-[color:var(--bjork-text)]",
          FOCUS_RING,
        )}
      >
        {paras.map((p, i) => (
          <p key={i} data-para-offset={p.start} data-para-index={i} className="whitespace-pre-wrap">
            {renderPara(p, i)}
          </p>
        ))}

        {selection && !proposal && (
          <div
            ref={toolbarRef}
            role="group"
            aria-label="Ask AI about the selection"
            onFocus={() => setFrozen(true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setFrozen(false);
                setToneOpen(false);
                if (!docRef.current?.contains(e.relatedTarget as Node | null)) setSelection(null);
              }
            }}
            onPointerDown={(e) => {
              // Buttons keep the document selection alive. The input takes focus normally.
              if (!(e.target as HTMLElement).closest("input")) e.preventDefault();
            }}
            className="absolute left-0 top-0 z-20 w-[min(372px,100%)] select-none text-[13px] leading-5"
          >
            <div
              className="rounded-[12px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-menu)] p-1.5 shadow-[var(--bjork-shadow-menu)] backdrop-blur-md"
              style={{ animation: reduce ? "none" : "bjork-inline-ai-pop 160ms cubic-bezier(0.23,1,0.32,1)" }}
            >
              <form onSubmit={onSubmit} className="flex h-8 items-center gap-2 pl-2">
                <Sparkles size={14} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-[color:var(--bjork-accent-ink)]" />
                <label htmlFor={inputId} className="sr-only">
                  Ask AI to edit the selection
                </label>
                <input
                  id={inputId}
                  ref={inputRef}
                  value={ask}
                  onChange={(e) => setAsk(e.target.value)}
                  placeholder="Ask AI to edit…"
                  autoComplete="off"
                  className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-[color:var(--bjork-text)] outline-none placeholder:text-[color:var(--bjork-text-faint)]"
                />
                <span className="hidden shrink-0 font-mono text-[10px] text-[color:var(--bjork-text-faint)] @[420px]:inline">⌘K</span>
                <button
                  type="submit"
                  aria-label="Run"
                  disabled={!ask.trim()}
                  className={cn(
                    "grid size-7 shrink-0 cursor-pointer place-items-center rounded-[8px] bg-[color:var(--bjork-accent-fill)] text-[color:var(--bjork-accent-foreground)] disabled:cursor-default disabled:bg-[color:var(--bjork-surface-active)] disabled:text-[color:var(--bjork-text-faint)]",
                    FOCUS_RING,
                    PRESS,
                  )}
                >
                  <ArrowUp size={14} strokeWidth={2} />
                </button>
              </form>
              <div className="mt-1 flex flex-wrap gap-0.5 border-t border-[color:var(--bjork-border)] pt-1">
                {QUICK.map((q) => (
                  <ChipButton key={q.label} onClick={() => void run(q.instruction, q.label)}>
                    {q.label}
                  </ChipButton>
                ))}
                <ChipButton
                  aria-haspopup="menu"
                  aria-expanded={toneOpen}
                  onClick={() => setToneOpen((v) => !v)}
                  className={toneOpen ? "bg-[color:var(--bjork-surface-active)] text-[color:var(--bjork-text)]" : undefined}
                >
                  Tone
                  <StrokeMorphIcon name={toneOpen ? "chevron-down" : "chevron-right"} size={10} strokeWidth={2} color="currentColor" />
                </ChipButton>
              </div>
              {toneOpen && (
                <ToneMenu
                  onPick={(t) => void run(`Rewrite in a ${t.toLowerCase()} tone.`, t)}
                  onClose={() => setToneOpen(false)}
                />
              )}
            </div>
          </div>
        )}

        {proposal && (
          <div
            ref={barRef}
            role="group"
            aria-label="AI suggestion"
            tabIndex={-1}
            className="absolute left-0 top-0 z-20 outline-none"
          >
            <div
              className="flex items-center gap-1 rounded-[11px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-menu)] p-1 pl-2.5 text-[12px] shadow-[var(--bjork-shadow-menu)] backdrop-blur-md"
              style={{ animation: reduce || pose ? "none" : "bjork-inline-ai-pop 160ms cubic-bezier(0.23,1,0.32,1)" }}
            >
              <span className="mr-1 flex min-w-0 items-center gap-1.5">
                <Sparkles size={12} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-[color:var(--bjork-accent-ink)]" />
                {proposal.status === "streaming" ? (
                  <span className="bjork-ai-shimmer whitespace-nowrap font-mono text-[11px]">Rewriting…</span>
                ) : proposal.status === "error" ? (
                  <span className="whitespace-nowrap font-mono text-[11px] text-[color:var(--bjork-error)]">Failed</span>
                ) : (
                  <span className="max-w-[12ch] truncate font-mono text-[11px] text-[color:var(--bjork-text-muted)]">{proposal.label}</span>
                )}
              </span>
              <ChipButton onClick={discard} aria-keyshortcuts="Escape">
                Discard
                <Key>esc</Key>
              </ChipButton>
              <ChipButton onClick={retry} disabled={proposal.status === "streaming"}>
                Retry
              </ChipButton>
              <button
                ref={acceptRef}
                type="button"
                aria-keyshortcuts="Enter"
                disabled={proposal.status !== "done"}
                onClick={accept}
                className={cn(
                  "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[8px] bg-[color:var(--bjork-accent-fill)] px-2.5 text-[12px] font-medium text-[color:var(--bjork-accent-foreground)] disabled:cursor-default disabled:opacity-45",
                  FOCUS_RING,
                  PRESS,
                )}
              >
                Accept
                <span aria-hidden="true" className="font-mono text-[10px] opacity-70">
                  ↵
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      <p id={`${inputId}-hint`} className="sr-only">
        Select text, then press Command or Control K to ask AI to rewrite it.
      </p>
      <LiveRegion message={message} />
    </div>
  );
}

function Key({ children }: { children: string }) {
  return (
    <span aria-hidden="true" className="font-mono text-[10px] text-[color:var(--bjork-text-faint)]">
      {children}
    </span>
  );
}

function ChipButton({
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "inline-flex h-7 cursor-pointer items-center gap-1 rounded-[8px] px-2 text-[12px] font-medium text-[color:var(--bjork-text-medium)] transition-colors duration-150 hover:bg-[color:var(--bjork-surface-active)] hover:text-[color:var(--bjork-text)] disabled:cursor-default disabled:opacity-40",
        FOCUS_RING,
        PRESS,
        className,
      )}
    >
      {children}
    </button>
  );
}

function ToneMenu({ onPick, onClose }: { onPick: (tone: string) => void; onClose: () => void }) {
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    items.current[0]?.focus();
  }, []);
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const i = items.current.findIndex((el) => el === document.activeElement);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % TONES.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + TONES.length) % TONES.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TONES.length - 1;
    else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    } else return;
    e.preventDefault();
    items.current[next]?.focus();
  };
  return (
    <div
      role="menu"
      aria-label="Tone"
      aria-orientation="horizontal"
      onKeyDown={onKey}
      className="mt-1 flex flex-wrap gap-0.5 border-t border-[color:var(--bjork-border)] pt-1"
    >
      {TONES.map((t, i) => (
        <Fragment key={t}>
          <button
            ref={(el) => {
              items.current[i] = el;
            }}
            type="button"
            role="menuitem"
            tabIndex={i === 0 ? 0 : -1}
            onClick={() => onPick(t)}
            className={cn(
              "inline-flex h-7 cursor-pointer items-center rounded-[8px] px-2 text-[12px] text-[color:var(--bjork-text-muted)] transition-colors hover:bg-[color:var(--bjork-surface-active)] hover:text-[color:var(--bjork-text)] focus-visible:bg-[color:var(--bjork-surface-active)]",
              FOCUS_RING,
            )}
          >
            {t}
          </button>
        </Fragment>
      ))}
    </div>
  );
}
