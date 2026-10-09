"use client";

import { Fragment, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { motion } from "framer-motion";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import { ease, springs } from "@/components/bjork-ui/_core/motion";
import {
  AI_CARD,
  FOCUS_RING,
  PRESS,
  useAiTone,
  useControllable,
  useReduceMotion,
  type BjorkTone,
} from "@/components/bjork-ui/ai/_shared";
import { StrokeMorphIcon } from "@/components/bjork-ui/utilities/stroke-morph-icon";
import { cn } from "@/lib/utils";

export type HunkDecision = "accepted" | "rejected";
/** Keyed by hunk id ("h0", "h1", ...). Missing keys are pending. */
export type DiffDecisions = Record<string, HunkDecision>;

export interface DiffReviewProps {
  original: string;
  suggestion: string;
  /** Path shown in the header. */
  filename?: string;
  decisions?: DiffDecisions;
  defaultDecisions?: DiffDecisions;
  onDecisionsChange?: (decisions: DiffDecisions) => void;
  /** Fires when the last hunk is resolved, with the merged text. */
  onComplete?: (resultText: string, decisions: DiffDecisions) => void;
  /** Unchanged lines kept around each change. Default 2. */
  context?: number;
  /** Index of the hunk marked current on first render. Useful for posed previews. */
  defaultFocusedHunk?: number;
  tone?: BjorkTone;
  className?: string;
}

export const SAMPLE_DIFF = {
  filename: "src/billing/plan-label.ts",
  original: `import { formatPrice } from "./format";
import type { Plan } from "./types";

export function planLabel(plan: Plan) {
  if (plan.interval == "year") {
    return plan.name + " (yearly)";
  }
  return plan.name;
}

export function monthlyPrice(plan: Plan): number {
  // TODO: handle yearly plans
  return plan.price;
}

export function priceLine(plan: Plan, locale: string) {
  const amount = monthlyPrice(plan);
  return formatPrice(amount, "USD") + " / month";
}

export function isFree(plan: Plan) {
  return plan.price === 0;
}`,
  suggestion: `import { formatPrice } from "./format";
import type { Plan } from "./types";

export function planLabel(plan: Plan) {
  if (plan.interval === "year") {
    return \`\${plan.name} (billed yearly)\`;
  }
  return plan.name;
}

export function monthlyPrice(plan: Plan): number {
  return plan.interval === "year" ? plan.price / 12 : plan.price;
}

export function priceLine(plan: Plan, locale: string) {
  const amount = monthlyPrice(plan);
  return \`\${formatPrice(amount, plan.currency, locale)} / month\`;
}

export function isFree(plan: Plan) {
  return plan.price === 0;
}`,
};

// ---------------------------------------------------------------------------------------------------------------
// Diff

interface Line {
  kind: "eq" | "del" | "add";
  text: string;
  /** 1-based line number in the original. */
  a?: number;
  /** 1-based line number in the suggestion. */
  b?: number;
}

interface Hunk {
  kind: "hunk";
  id: string;
  index: number;
  dels: Line[];
  adds: Line[];
}

interface Same {
  kind: "eq";
  lines: Line[];
}

type Block = Hunk | Same;

/** LCS over two sequences after trimming the shared prefix and suffix. Returns keep/delete/insert ops. */
function lcsOps<T>(a: T[], b: T[]): ("eq" | "del" | "add")[] {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let ta = a.length;
  let tb = b.length;
  while (ta > head && tb > head && a[ta - 1] === b[tb - 1]) {
    ta--;
    tb--;
  }
  const n = ta - head;
  const m = tb - head;
  const w = m + 1;
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] =
        a[head + i] === b[head + j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  const ops: ("eq" | "del" | "add")[] = Array<"eq">(head).fill("eq");
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[head + i] === b[head + j]) {
      ops.push("eq");
      i++;
      j++;
    } else if (j >= m || (i < n && dp[(i + 1) * w + j] >= dp[i * w + j + 1])) {
      ops.push("del");
      i++;
    } else {
      ops.push("add");
      j++;
    }
  }
  for (let k = ta; k < a.length; k++) ops.push("eq");
  return ops;
}

function buildBlocks(original: string, suggestion: string): Block[] {
  const a = original.split("\n");
  const b = suggestion.split("\n");
  const blocks: Block[] = [];
  let ia = 0;
  let ib = 0;
  let hunks = 0;
  for (const op of lcsOps(a, b)) {
    const last = blocks[blocks.length - 1];
    if (op === "eq") {
      const line: Line = { kind: "eq", text: a[ia], a: ++ia, b: ++ib };
      if (last?.kind === "eq") last.lines.push(line);
      else blocks.push({ kind: "eq", lines: [line] });
      continue;
    }
    let hunk = last?.kind === "hunk" ? last : null;
    if (!hunk) {
      hunk = { kind: "hunk", id: `h${hunks}`, index: hunks++, dels: [], adds: [] };
      blocks.push(hunk);
    }
    if (op === "del") hunk.dels.push({ kind: "del", text: a[ia], a: ++ia });
    else hunk.adds.push({ kind: "add", text: b[ib], b: ++ib });
  }
  return blocks;
}

function resultOf(blocks: Block[], decisions: DiffDecisions): string {
  const out: string[] = [];
  for (const block of blocks) {
    if (block.kind === "eq") out.push(...block.lines.map((l) => l.text));
    else out.push(...(decisions[block.id] === "accepted" ? block.adds : block.dels).map((l) => l.text));
  }
  return out.join("\n");
}

const WORD_RE = /\w+|\s+|[^\w\s]/g;

interface Piece {
  text: string;
  changed: boolean;
}

/** Word-level highlight for a removed/added line pair. */
function wordDiff(before: string, after: string): [Piece[], Piece[]] {
  const x = before.match(WORD_RE) ?? [];
  const y = after.match(WORD_RE) ?? [];
  const ops = lcsOps(x, y);
  const left: Piece[] = [];
  const right: Piece[] = [];
  const push = (list: Piece[], text: string, changed: boolean) => {
    const prev = list[list.length - 1];
    if (prev && prev.changed === changed) prev.text += text;
    else list.push({ text, changed });
  };
  let i = 0;
  let j = 0;
  for (const op of ops) {
    if (op === "eq") {
      push(left, x[i++], false);
      push(right, y[j++], false);
    } else if (op === "del") push(left, x[i++], true);
    else push(right, y[j++], true);
  }
  return [left, right];
}

// ---------------------------------------------------------------------------------------------------------------
// Component

const TINT = {
  del: "color-mix(in srgb, var(--bjork-error) 9%, transparent)",
  add: "color-mix(in srgb, var(--bjork-success) 10%, transparent)",
  delWord: "color-mix(in srgb, var(--bjork-error) 26%, transparent)",
  addWord: "color-mix(in srgb, var(--bjork-success) 28%, transparent)",
};

const GRID =
  "grid grid-cols-[3ch_3ch_1.5ch_minmax(0,1fr)] gap-x-1.5 px-3 @[460px]:grid-cols-[3.5ch_3.5ch_1.5ch_minmax(0,1fr)]";

const MINI_BTN =
  "inline-flex h-7 cursor-pointer items-center justify-center gap-1 rounded-[7px] px-2 font-bjork-alpha text-[12px] font-medium leading-4 transition-colors duration-150";

/** Review an AI suggestion hunk by hunk: accept or reject each change, then hand back the merged text. */
export function DiffReview({
  original,
  suggestion,
  filename,
  decisions,
  defaultDecisions = {},
  onDecisionsChange,
  onComplete,
  context = 2,
  defaultFocusedHunk = 0,
  tone: toneProp,
  className,
}: DiffReviewProps) {
  const { style } = useAiTone(toneProp);
  const titleId = useId();
  const blocks = useMemo(() => buildBlocks(original, suggestion), [original, suggestion]);
  const hunks = useMemo(() => blocks.filter((b): b is Hunk => b.kind === "hunk"), [blocks]);
  const [chosen, setChosen] = useControllable(decisions, defaultDecisions, onDecisionsChange);
  const [focus, setFocus] = useState(Math.min(defaultFocusedHunk, Math.max(0, hunks.length - 1)));
  const [opened, setOpened] = useState<ReadonlySet<number>>(() => new Set());
  const [message, setMessage] = useState("");
  const hunkEls = useRef(new Map<number, HTMLDivElement>());

  const added = hunks.reduce((n, h) => n + h.adds.length, 0);
  const removed = hunks.reduce((n, h) => n + h.dels.length, 0);
  const resolved = hunks.filter((h) => chosen[h.id]).length;
  const done = hunks.length > 0 && resolved === hunks.length;

  const commit = (next: DiffDecisions, note: string) => {
    setChosen(next);
    const all = hunks.every((h) => next[h.id]);
    setMessage(all ? `${note}. All changes resolved` : note);
    if (all) onComplete?.(resultOf(blocks, next), next);
  };

  const moveTo = (i: number) => {
    const next = Math.max(0, Math.min(hunks.length - 1, i));
    setFocus(next);
    const el = hunkEls.current.get(next);
    el?.focus();
    el?.scrollIntoView({ block: "nearest" });
  };

  const decide = (h: Hunk, d: HunkDecision | null, advance = false) => {
    const next = { ...chosen };
    if (d) next[h.id] = d;
    else delete next[h.id];
    commit(next, `Change ${h.index + 1} ${d ?? "restored"}`);
    if (advance) {
      const after = hunks.find((x) => x.index > h.index && !next[x.id]) ?? hunks.find((x) => !next[x.id]);
      if (after) moveTo(after.index);
    }
  };

  const decideAll = (d: HunkDecision) => {
    const next: DiffDecisions = {};
    for (const h of hunks) next[h.id] = d;
    commit(next, d === "accepted" ? "Accepted all changes" : "Rejected all changes");
  };

  const onHunkKey = (e: ReactKeyboardEvent<HTMLDivElement>, h: Hunk) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key;
    if (key === "j" || key === "ArrowDown") moveTo(h.index + 1);
    else if (key === "k" || key === "ArrowUp") moveTo(h.index - 1);
    else if (key === "Home") moveTo(0);
    else if (key === "End") moveTo(hunks.length - 1);
    else if (key === "a") decide(h, "accepted", true);
    else if (key === "r") decide(h, "rejected", true);
    else if (key === "u" || key === "z") decide(h, null);
    else return;
    e.preventDefault();
  };

  // Long unchanged runs collapse to a quiet "N unchanged lines" row.
  const renderSame = (block: Same, bi: number) => {
    const first = bi === 0;
    const last = bi === blocks.length - 1;
    const lines = block.lines;
    const keepHead = first ? 0 : context;
    const keepTail = last ? 0 : context;
    if (opened.has(bi) || lines.length <= keepHead + keepTail + 1) {
      return lines.map((l) => <CodeLine key={`${l.a}`} line={l} />);
    }
    const hidden = lines.length - keepHead - keepTail;
    return (
      <Fragment key={bi}>
        {lines.slice(0, keepHead).map((l) => (
          <CodeLine key={`${l.a}`} line={l} />
        ))}
        <button
          type="button"
          onClick={() => setOpened((s) => new Set(s).add(bi))}
          className={cn(
            "flex h-7 w-full cursor-pointer items-center gap-2 bg-[color:color-mix(in_srgb,var(--bjork-text)_3%,transparent)] px-3 text-left font-mono text-[11px] text-[color:var(--bjork-text-faint)] transition-colors hover:text-[color:var(--bjork-text-muted)]",
            FOCUS_RING,
            "focus-visible:ring-inset focus-visible:ring-offset-0",
          )}
        >
          <StrokeMorphIcon name="ellipsis" size={12} strokeWidth={1.75} color="currentColor" />
          {hidden} unchanged {hidden === 1 ? "line" : "lines"}
        </button>
        {lines.slice(lines.length - keepTail).map((l) => (
          <CodeLine key={`${l.a}`} line={l} />
        ))}
      </Fragment>
    );
  };

  return (
    <section
      aria-labelledby={titleId}
      style={style}
      className={cn("@container w-full min-w-0 max-w-[720px] font-bjork-alpha text-[color:var(--bjork-text)]", className)}
    >
      <div className={cn(AI_CARD, "overflow-hidden")}>
        <header className="flex flex-col gap-1 border-b border-[color:var(--bjork-border)] px-3 py-2 @[480px]:flex-row @[480px]:items-center @[480px]:justify-between @[480px]:gap-3">
          <div className="flex min-w-0 flex-1 items-baseline gap-2.5">
            <h3 id={titleId} className="min-w-0 truncate font-mono text-[12px] leading-5 text-[color:var(--bjork-text)]">
              {filename ?? "Suggested edit"}
            </h3>
            <span className="shrink-0 font-mono text-[11px] leading-5 tabular-nums">
              <span className="text-[color:var(--bjork-success)]">+{added}</span>{" "}
              <span className="text-[color:var(--bjork-error)]">−{removed}</span>
            </span>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-1.5">
            <span className="mr-auto min-w-[11ch] @[480px]:mr-1 @[480px]:text-right font-mono text-[11px] leading-5 tabular-nums text-[color:var(--bjork-text-muted)]">
              {resolved} of {hunks.length} resolved
            </span>
            <button
              type="button"
              disabled={done}
              onClick={() => decideAll("rejected")}
              className={cn(MINI_BTN, "text-[color:var(--bjork-text-muted)] hover:bg-[color:var(--bjork-surface-active)] hover:text-[color:var(--bjork-text)] disabled:cursor-default disabled:opacity-40", FOCUS_RING, PRESS)}
            >
              Reject all
            </button>
            <button
              type="button"
              disabled={done}
              onClick={() => decideAll("accepted")}
              className={cn(MINI_BTN, "bg-[color:var(--bjork-accent-fill)] px-2.5 text-[color:var(--bjork-accent-foreground)] hover:brightness-110 disabled:cursor-default disabled:opacity-40", FOCUS_RING, PRESS)}
            >
              Accept all
            </button>
          </div>
        </header>

        <div className="py-1 font-mono text-[12px] leading-5">
          {blocks.map((block, bi) =>
            block.kind === "eq" ? (
              <Fragment key={`eq-${bi}`}>{renderSame(block, bi)}</Fragment>
            ) : (
              <HunkView
                key={block.id}
                hunk={block}
                total={hunks.length}
                decision={chosen[block.id]}
                current={focus === block.index}
                refCallback={(el) => {
                  if (el) hunkEls.current.set(block.index, el);
                  else hunkEls.current.delete(block.index);
                }}
                onFocus={() => setFocus(block.index)}
                onKeyDown={(e) => onHunkKey(e, block)}
                onDecide={(d) => decide(block, d, d !== null)}
              />
            ),
          )}
        </div>

        <footer className="flex min-h-8 items-center justify-between gap-3 border-t border-[color:var(--bjork-border)] px-3 font-mono text-[10px] uppercase leading-4 tracking-[0.08em] text-[color:var(--bjork-text-faint)]">
          <span>{done ? "All changes resolved" : `${hunks.length - resolved} left`}</span>
          <span className="hidden normal-case tracking-normal @[460px]:inline">
            <Kbd>j</Kbd> <Kbd>k</Kbd> move · <Kbd>a</Kbd> accept · <Kbd>r</Kbd> reject · <Kbd>u</Kbd> undo
          </span>
        </footer>
      </div>
      <LiveRegion message={message} />
    </section>
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-grid h-4 min-w-4 place-items-center rounded-[4px] border border-[color:var(--bjork-border)] px-1 font-mono text-[10px] text-[color:var(--bjork-text-muted)]">
      {children}
    </kbd>
  );
}

function CodeLine({
  line,
  pieces,
  dim = false,
}: {
  line: Line;
  pieces?: Piece[];
  dim?: boolean;
}) {
  const sign = line.kind === "del" ? "−" : line.kind === "add" ? "+" : " ";
  const word = line.kind === "del" ? TINT.delWord : TINT.addWord;
  return (
    <div
      className={GRID}
      style={{ background: line.kind === "del" ? TINT.del : line.kind === "add" ? TINT.add : undefined }}
    >
      <span aria-hidden="true" className="select-none text-right text-[11px] tabular-nums text-[color:var(--bjork-text-faint)]">
        {line.a ?? ""}
      </span>
      <span aria-hidden="true" className="select-none text-right text-[11px] tabular-nums text-[color:var(--bjork-text-faint)]">
        {line.b ?? ""}
      </span>
      <span
        aria-hidden="true"
        className="select-none text-center"
        style={{
          color:
            line.kind === "del" ? "var(--bjork-error)" : line.kind === "add" ? "var(--bjork-success)" : "transparent",
        }}
      >
        {sign}
      </span>
      <span
        className={cn(
          "min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]",
          dim ? "text-[color:var(--bjork-text-muted)]" : "text-[color:var(--bjork-text-medium)]",
          line.kind !== "eq" && "text-[color:var(--bjork-text)]",
        )}
      >
        {line.kind === "del" && <span className="sr-only">Removed: </span>}
        {line.kind === "add" && <span className="sr-only">Added: </span>}
        {pieces
          ? pieces.map((p, i) =>
              p.changed && p.text.trim() !== "" ? (
                <mark key={i} className="rounded-[3px] text-inherit" style={{ background: word }}>
                  {p.text}
                </mark>
              ) : (
                <Fragment key={i}>{p.text}</Fragment>
              ),
            )
          : line.text || "​"}
      </span>
    </div>
  );
}

interface HunkViewProps {
  hunk: Hunk;
  total: number;
  decision?: HunkDecision;
  current: boolean;
  refCallback: (el: HTMLDivElement | null) => void;
  onFocus: () => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  onDecide: (d: HunkDecision | null) => void;
}

function HunkView({ hunk, total, decision, current, refCallback, onFocus, onKeyDown, onDecide }: HunkViewProps) {
  const reduce = useReduceMotion();
  const pairs = useMemo(() => {
    const n = Math.min(hunk.dels.length, hunk.adds.length);
    return Array.from({ length: n }, (_, i) => wordDiff(hunk.dels[i].text, hunk.adds[i].text));
  }, [hunk]);

  const counts = [hunk.dels.length && `−${hunk.dels.length}`, hunk.adds.length && `+${hunk.adds.length}`]
    .filter(Boolean)
    .join(" ");
  const state = decision ?? "pending";
  const kept = decision === "accepted" ? hunk.adds : hunk.dels;

  return (
    <div
      ref={refCallback}
      role="group"
      tabIndex={current ? 0 : -1}
      aria-label={`Change ${hunk.index + 1} of ${total}: ${hunk.dels.length} removed, ${hunk.adds.length} added. ${state}`}
      onFocus={(e) => {
        if (e.target === e.currentTarget) onFocus();
      }}
      onKeyDown={onKeyDown}
      className={cn(
        "relative my-1 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--bjork-accent)]",
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[2px] transition-opacity duration-150"
        style={{ background: "var(--bjork-accent)", opacity: current && !decision ? 1 : 0 }}
      />
      <div className="flex min-h-8 items-center justify-between gap-2 px-3">
        <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--bjork-text-faint)]">
          {decision ? (
            <span className="inline-flex items-center gap-1.5 normal-case tracking-normal text-[11px] text-[color:var(--bjork-text-muted)]">
              <StrokeMorphIcon
                name={decision === "accepted" ? "check" : "close"}
                size={12}
                strokeWidth={1.75}
                color={decision === "accepted" ? "var(--bjork-success)" : "var(--bjork-text-muted)"}
              />
              {decision === "accepted" ? "Accepted" : "Rejected"} · change {hunk.index + 1}
            </span>
          ) : (
            <>
              Change {hunk.index + 1}
              <span className="ml-2 tracking-normal tabular-nums">{counts}</span>
            </>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {decision ? (
            <button
              type="button"
              tabIndex={current ? 0 : -1}
              onClick={() => onDecide(null)}
              className={cn(MINI_BTN, "text-[color:var(--bjork-text-muted)] hover:bg-[color:var(--bjork-surface-active)] hover:text-[color:var(--bjork-text)]", FOCUS_RING, PRESS)}
            >
              Undo
            </button>
          ) : (
            <>
              <button
                type="button"
                tabIndex={current ? 0 : -1}
                aria-keyshortcuts="r"
                onClick={() => onDecide("rejected")}
                className={cn(MINI_BTN, "text-[color:var(--bjork-text-muted)] hover:bg-[color:var(--bjork-surface-active)] hover:text-[color:var(--bjork-text)]", FOCUS_RING, PRESS)}
              >
                Reject
              </button>
              <button
                type="button"
                tabIndex={current ? 0 : -1}
                aria-keyshortcuts="a"
                onClick={() => onDecide("accepted")}
                className={cn(
                  MINI_BTN,
                  "border border-[color:var(--bjork-accent-muted)] bg-[color:var(--bjork-accent-soft)] text-[color:var(--bjork-accent-ink)] hover:bg-[color:var(--bjork-accent-muted)]",
                  FOCUS_RING,
                  PRESS,
                )}
              >
                Accept
              </button>
            </>
          )}
        </span>
      </div>

      <motion.div
        key={state}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(3px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={reduce ? { duration: 0.12, ease: ease.out } : springs.blurIn}
      >
        {decision
          ? kept.map((l) => <CodeLine key={`${l.kind}-${l.a ?? l.b}`} line={{ ...l, kind: "eq" }} dim />)
          : (
            <>
              {hunk.dels.map((l, i) => (
                <CodeLine key={`d${l.a}`} line={l} pieces={pairs[i]?.[0]} />
              ))}
              {hunk.adds.map((l, i) => (
                <CodeLine key={`a${l.b}`} line={l} pieces={pairs[i]?.[1]} />
              ))}
            </>
          )}
        {decision && kept.length === 0 && (
          <div className={cn(GRID, "text-[11px] text-[color:var(--bjork-text-faint)]")}>
            <span className="col-start-4">Lines removed</span>
          </div>
        )}
      </motion.div>
    </div>
  );
}
