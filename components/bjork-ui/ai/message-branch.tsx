"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, Copy, PencilLine, RefreshCw } from "lucide-react";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import { easeCss } from "@/components/bjork-ui/_core/motion";
import {
  FOCUS_RING,
  PRESS,
  SHIMMER_TEXT_CSS,
  useAiTone,
  useHydrated,
  useReduceMotion,
  type BjorkTone,
} from "@/components/bjork-ui/ai/_shared";
import { StrokeMorphIcon } from "@/components/bjork-ui/utilities/stroke-morph-icon";
import { cn } from "@/lib/utils";

export type MessageBranchRole = "user" | "assistant";

export interface MessageVersion {
  id: string;
  /** Plain text. Blank lines split paragraphs. Use `renderContent` for markdown. */
  content: string;
  /** Model name shown in the meta line, such as "Halcyon 3 Pro". */
  model?: string;
  /** When the version was created. Epoch milliseconds, ISO string or Date. Formatted on the client. */
  createdAt?: number | string | Date;
  /** True while this version is still being written. */
  streaming?: boolean;
}

export interface MessageBranchProps {
  versions: MessageVersion[];
  role?: MessageBranchRole;
  /** Controlled version index. */
  index?: number;
  /** Uncontrolled start. Defaults to the newest version. Uncontrolled branches jump to a new version when one is added. */
  defaultIndex?: number;
  onIndexChange?: (index: number) => void;
  /** Assistant only. Shows Regenerate; a placeholder version streams until a new version arrives in `versions`. */
  onRegenerate?: () => void;
  /** User only. Shows Edit; "Save & submit" calls this with the new text so a new branch can be added. */
  onEdit?: (content: string) => void;
  /** Called after a version is copied. */
  onCopy?: (content: string) => void;
  /** Custom rendering for a version's content, for example a StreamingMessage. */
  renderContent?: (version: MessageVersion) => ReactNode;
  tone?: BjorkTone;
  className?: string;
}

const HOUR = 3_600_000;
const BASE = Date.UTC(2026, 9, 8, 14, 12);

export const SAMPLE_USER_VERSIONS: MessageVersion[] = [
  {
    id: "u1",
    content: "Write a one-line release note for the new offline drafts feature in Fieldnotes.",
    createdAt: BASE,
  },
];

export const SAMPLE_ASSISTANT_VERSIONS: MessageVersion[] = [
  {
    id: "a1",
    content: "Drafts now save on your device first, so a dropped connection never costs you a sentence.",
    model: "Halcyon 3 Pro",
    createdAt: BASE + 20_000,
  },
  {
    id: "a2",
    content:
      "Fieldnotes now keeps every draft on your device and syncs it when you're back online. Write on a plane, in a tunnel or in a café with bad Wi-Fi, and nothing is lost.",
    model: "Halcyon 3 Pro",
    createdAt: BASE + 0.05 * HOUR,
  },
  {
    id: "a3",
    content: "Offline drafts: write anywhere, sync when you're back.",
    model: "Kestrel Mini",
    createdAt: BASE + 0.1 * HOUR,
  },
];

function toDate(value: MessageVersion["createdAt"]): Date | null {
  if (value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const iconButton = cn(
  "relative grid size-7 cursor-pointer place-items-center rounded-[7px] text-[color:var(--bjork-text-faint)] transition-colors hover:bg-[var(--bjork-surface-active)] hover:text-[color:var(--bjork-text)] disabled:pointer-events-none disabled:opacity-40 aria-disabled:cursor-default aria-disabled:bg-transparent aria-disabled:opacity-40",
  FOCUS_RING,
  PRESS,
);

/**
 * A chat message with versions. Step between branches with the switcher or the arrow keys, copy, regenerate an
 * answer or edit a prompt into a new branch. Versions crossfade in place, so switching never moves the thread.
 */
export function MessageBranch({
  versions,
  role = "assistant",
  index,
  defaultIndex,
  onIndexChange,
  onRegenerate,
  onEdit,
  onCopy,
  renderContent,
  tone: toneProp,
  className,
}: MessageBranchProps) {
  const { pal, style } = useAiTone(toneProp);
  const reduce = useReduceMotion();
  const hydrated = useHydrated();
  const isUser = role === "user";
  const total = versions.length;
  const textareaId = useId();

  // Uncontrolled index. A new version arriving clears the regenerate placeholder and, uncontrolled, selects it.
  const [inner, setInner] = useState({
    index: defaultIndex ?? Math.max(0, total - 1),
    count: total,
    pending: false,
  });
  if (inner.count !== total) {
    setInner({
      index: total > inner.count ? total - 1 : Math.min(inner.index, Math.max(0, total - 1)),
      count: total,
      pending: false,
    });
  }
  const controlled = index !== undefined;
  const current = Math.min(Math.max(0, controlled ? index : inner.index), Math.max(0, total - 1));
  const pending = inner.pending;
  const shown = pending ? total : current; // the placeholder sits after the last version
  const count = pending ? total + 1 : total;

  const select = (next: number) => {
    const clamped = Math.min(Math.max(0, next), total - 1);
    if (clamped === current && !pending) return;
    setInner((s) => ({ ...s, index: clamped, pending: false }));
    onIndexChange?.(clamped);
  };

  const step = (delta: number) => {
    if (pending) {
      if (delta < 0) select(total - 1);
      return;
    }
    select(current + delta);
  };

  const onSwitcherKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    }
  };

  // Copy, with a short "Copied" state.
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);
  const version = versions[current];
  const copy = async () => {
    if (!version) return;
    try {
      await navigator.clipboard.writeText(version.content);
    } catch {
      return;
    }
    onCopy?.(version.content);
    setCopied(true);
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
  };

  const regenerate = () => {
    setInner((s) => ({ ...s, pending: true }));
    onRegenerate?.();
  };

  // Inline edit for user messages.
  const [draft, setDraft] = useState<string | null>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const editing = draft !== null;
  const closeEdit = () => {
    setDraft(null);
    requestAnimationFrame(() => editButtonRef.current?.focus());
  };
  const submitEdit = () => {
    const text = draft?.trim();
    if (!text) return;
    onEdit?.(text);
    closeEdit();
  };

  const [announce, setAnnounce] = useState({ shown, message: "" });
  if (announce.shown !== shown) {
    setAnnounce({ shown, message: pending ? "Regenerating response" : `Version ${shown + 1} of ${count}` });
  }
  const liveMessage = copied ? "Copied" : announce.message;

  const meta = (() => {
    if (pending) return "Regenerating…";
    if (!version) return "";
    const date = hydrated ? toDate(version.createdAt) : null;
    const time = date ? date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null;
    return [version.model, time].filter(Boolean).join(" · ");
  })();

  const body = (v: MessageVersion) => {
    if (v.streaming && v.content === "") return <Placeholder />;
    if (renderContent) return renderContent(v);
    return v.content
      .split(/\n{2,}/)
      .map((p, i) => (
        <p key={i} className="mb-3 whitespace-pre-wrap last:mb-0">
          {p}
        </p>
      ));
  };

  const fade = reduce ? "none" : `opacity 220ms ${easeCss.out}, filter 220ms ${easeCss.out}`;

  return (
    <div
      className={cn(
        "@container flex w-full max-w-[600px] flex-col font-bjork-alpha text-[14px] leading-[22px] text-[color:var(--bjork-text-medium)]",
        isUser && "items-end",
        className,
      )}
      style={style}
      aria-label={isUser ? "Your message" : "Assistant message"}
      role="group"
    >
      <style href="bjork-ai-shimmer" precedence="default">
        {SHIMMER_TEXT_CSS}
      </style>

      {editing ? (
        <div className="w-full max-w-[min(100%,480px)] rounded-[14px] border border-[color:var(--bjork-border-strong)] bg-[var(--bjork-field)] p-2 shadow-[var(--bjork-shadow-surface)]">
          <label htmlFor={textareaId} className="sr-only">
            Edit message
          </label>
          <textarea
            id={textareaId}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                closeEdit();
              } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submitEdit();
              }
            }}
            rows={2}
            className="block max-h-48 min-h-[44px] w-full resize-none rounded-[8px] bg-transparent px-1.5 py-1 text-[14px] leading-[22px] text-[color:var(--bjork-text)] outline-none [field-sizing:content] placeholder:text-[color:var(--bjork-text-faint)]"
          />
          <div className="mt-1.5 flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={closeEdit}
              className={cn(
                "h-8 cursor-pointer rounded-[9px] px-3 text-[13px] font-medium text-[color:var(--bjork-text-muted)] transition-colors hover:bg-[var(--bjork-surface-active)] hover:text-[color:var(--bjork-text)]",
                FOCUS_RING,
                PRESS,
              )}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitEdit}
              disabled={!draft?.trim()}
              className={cn(
                "h-8 cursor-pointer rounded-[9px] bg-[color:var(--bjork-accent)] px-3 text-[13px] font-medium text-[color:var(--bjork-accent-foreground)] transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-40",
                FOCUS_RING,
                PRESS,
              )}
            >
              Save & submit
            </button>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "grid min-w-0",
            isUser
              ? "max-w-[85%] rounded-[16px] rounded-br-[6px] bg-[var(--bjork-raised)] px-3.5 py-2.5 text-[color:var(--bjork-text)]"
              : "w-full",
          )}
        >
          {/* Every version shares one grid cell, so the box is as tall as the tallest and switching never jumps. */}
          {versions.map((v, i) => {
            const active = !pending && i === current;
            return (
              <div
                key={v.id}
                aria-hidden={!active || undefined}
                inert={!active}
                className={cn("col-start-1 row-start-1 min-w-0", !active && "pointer-events-none select-none")}
                style={{
                  opacity: active ? 1 : 0,
                  filter: active || reduce ? "blur(0px)" : "blur(2px)",
                  visibility: active ? "visible" : "hidden",
                  transition: reduce ? "none" : `${fade}, visibility 0s linear ${active ? "0s" : "220ms"}`,
                }}
              >
                {body(v)}
              </div>
            );
          })}
          {pending && (
            <div className="col-start-1 row-start-1 min-w-0">
              <Placeholder />
            </div>
          )}
        </div>
      )}

      {!editing && (
        <div className={cn("mt-1.5 flex min-h-8 w-full items-center gap-1", isUser && "justify-end")}>
          {isUser && meta && <MetaLine text={meta} className="mr-1 hidden @[380px]:block" />}

          {count > 1 && (
            <div
              role="group"
              aria-label={`Version ${shown + 1} of ${count}`}
              onKeyDown={onSwitcherKey}
              className="-ml-1 flex items-center"
            >
              <button
                type="button"
                aria-label="Previous version"
                aria-disabled={!pending && current === 0}
                onClick={() => step(-1)}
                className={iconButton}
              >
                <StrokeMorphIcon name="chevron-left" size={14} strokeWidth={1.75} color={pal.textMuted} />
              </button>
              <span
                aria-hidden="true"
                className="min-w-[4.5ch] text-center font-mono text-[11px] tabular-nums text-[color:var(--bjork-text-muted)]"
              >
                {shown + 1} / {count}
              </span>
              <button
                type="button"
                aria-label="Next version"
                aria-disabled={pending || current >= total - 1}
                onClick={() => step(1)}
                className={iconButton}
              >
                <StrokeMorphIcon name="chevron-right" size={14} strokeWidth={1.75} color={pal.textMuted} />
              </button>
            </div>
          )}

          <button
            type="button"
            aria-label={copied ? "Copied" : "Copy message"}
            title="Copy"
            disabled={pending || !version}
            onClick={copy}
            className={iconButton}
          >
            <Copy
              size={14}
              strokeWidth={1.75}
              className={cn("absolute transition-all duration-150", copied ? "scale-50 opacity-0" : "opacity-100")}
            />
            <Check
              size={14}
              strokeWidth={2}
              className={cn(
                "absolute text-[color:var(--bjork-accent-ink)] transition-all duration-150",
                copied ? "opacity-100" : "scale-50 opacity-0",
              )}
            />
          </button>

          {!isUser && onRegenerate && (
            <button
              type="button"
              aria-label="Regenerate response"
              title="Regenerate"
              disabled={pending || version?.streaming}
              onClick={regenerate}
              className={iconButton}
            >
              <RefreshCw
                size={14}
                strokeWidth={1.75}
                className={cn(pending && !reduce && "animate-spin [animation-duration:1.1s]")}
              />
            </button>
          )}

          {isUser && onEdit && (
            <button
              ref={editButtonRef}
              type="button"
              aria-label="Edit message"
              title="Edit"
              disabled={!version}
              onClick={() => setDraft(version?.content ?? "")}
              className={iconButton}
            >
              <PencilLine size={14} strokeWidth={1.75} />
            </button>
          )}

          {!isUser && meta && <MetaLine text={meta} className="ml-auto pl-2" />}
        </div>
      )}

      <LiveRegion message={liveMessage} />
    </div>
  );
}

function MetaLine({ text, className }: { text: string; className?: string }) {
  return (
    <span
      className={cn(
        "min-w-0 truncate font-mono text-[11px] leading-5 tabular-nums text-[color:var(--bjork-text-faint)]",
        className,
      )}
    >
      {text}
    </span>
  );
}

/** Three shimmering lines for a version that has not produced text yet. */
function Placeholder() {
  return (
    <div className="grid gap-2 py-[5px]">
      <span className="bjork-ai-shimmer text-[13px] font-medium leading-5">Writing a new version…</span>
      <span aria-hidden="true" className="h-2 w-[92%] rounded-full bg-[var(--bjork-surface-active)]" />
      <span aria-hidden="true" className="h-2 w-[64%] rounded-full bg-[var(--bjork-surface-active)]" />
    </div>
  );
}
