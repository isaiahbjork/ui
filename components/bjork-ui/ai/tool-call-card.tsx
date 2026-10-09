"use client";

import {
  Children,
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, Copy } from "lucide-react";
import { motion } from "framer-motion";
import { LiveRegion, VisuallyHidden } from "@/components/bjork-ui/_core/a11y";
import { ease, easeCss, springs } from "@/components/bjork-ui/_core/motion";
import {
  FOCUS_RING,
  PRESS,
  formatDuration,
  useAiTone,
  useControllable,
  useReduceMotion,
  type BjorkTone,
} from "@/components/bjork-ui/ai/_shared";
import { StrokeMorphIcon, type StrokeIconName } from "@/components/bjork-ui/utilities/stroke-morph-icon";
import { cn } from "@/lib/utils";

export type ToolCallStatus = "input-streaming" | "running" | "success" | "error" | "denied";

export interface ToolCall {
  id: string;
  name: string;
  status: ToolCallStatus;
  /** Arguments. An object, or a JSON string. While `input-streaming` it may be a partial JSON string. */
  input?: unknown;
  output?: unknown;
  error?: string;
  /** One-line human summary, e.g. "Open tickets tagged billing". */
  summary?: string;
  startedAt?: number;
  durationMs?: number;
}

export interface ToolCallCardProps {
  /** Tool name, shown in mono. */
  name: string;
  status: ToolCallStatus;
  /** Arguments. An object, or a JSON string. While `input-streaming` a partial JSON string renders as-is. */
  input?: unknown;
  /** Result. An object, or a JSON or plain-text string. */
  output?: unknown;
  /** Error message for `status: "error"`. */
  error?: string;
  /** One-line human summary shown next to the name. */
  summary?: string;
  /** Epoch ms when the call began. Drives the live duration; without it the first observed time is used. */
  startedAt?: number;
  /** Final duration in ms. */
  durationMs?: number;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Lines shown before "Show all N lines". Default 12. */
  maxLines?: number;
  /** Demo/preview only: freezes the clock. */
  now?: number;
  tone?: BjorkTone;
  className?: string;
}

export const SAMPLE_TOOL_CALLS: ToolCall[] = [
  {
    id: "call_1",
    name: "search_tickets",
    status: "success",
    summary: "Open tickets tagged billing",
    input: { query: "refund not received", tags: ["billing"], status: "open", limit: 5 },
    output: {
      total: 3,
      tickets: [
        { id: "TCK-4821", subject: "Refund still pending after 10 days", priority: "high", age_days: 10 },
        { id: "TCK-4790", subject: "Charged twice for annual plan", priority: "normal", age_days: 14 },
        { id: "TCK-4702", subject: "Refund to expired card", priority: "low", age_days: 21 },
      ],
    },
    durationMs: 412,
  },
  {
    id: "call_2",
    name: "get_customer",
    status: "success",
    summary: "Look up Maren Osei",
    input: { customer_id: "cus_8Hq2Lm", include: ["plan", "payments"] },
    output: {
      id: "cus_8Hq2Lm",
      name: "Maren Osei",
      email: "maren@fieldnotes.dev",
      plan: "Studio annual",
      lifetime_value: 1188.0,
      delinquent: false,
      last_payment: { amount: 99.0, card: "visa •4242", refunded: null },
    },
    durationMs: 286,
  },
  {
    id: "call_3",
    name: "draft_reply",
    status: "running",
    summary: "Write a reply for TCK-4821",
    input: { ticket_id: "TCK-4821", tone: "warm", max_words: 120 },
  },
];

const STATUS_ICON: Record<ToolCallStatus, StrokeIconName> = {
  "input-streaming": "busy",
  running: "busy",
  success: "check",
  error: "close",
  denied: "minus",
};

const STATUS_WORD: Record<ToolCallStatus, string> = {
  "input-streaming": "preparing",
  running: "running",
  success: "done",
  error: "failed",
  denied: "denied",
};

const GLYPH_COLOR: Record<ToolCallStatus, string> = {
  "input-streaming": "var(--bjork-text-muted)",
  running: "var(--bjork-accent-ink)",
  success: "var(--bjork-text-muted)",
  error: "var(--bjork-error)",
  denied: "var(--bjork-text-faint)",
};

const TICK_MS = 100;

// ---------------------------------------------------------------------------------------------------------------
// JSON helpers

/** Pretty JSON when the value parses, raw text when it does not (a partial stream, or plain text output). */
function toPretty(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

// Strings (closing quote optional, so a partial stream still tints), an optional key colon, literals and numbers.
const TOKEN_RE = /("(?:[^"\\\n]|\\.)*"?)(\s*:)?|\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g;

function tintLine(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(line.slice(last, at));
    if (m[1] !== undefined && m[2] !== undefined) {
      out.push(
        <span key={at} className="text-[color:var(--bjork-text-medium)]">
          {m[1]}
        </span>,
        <span key={`${at}:`} className="text-[color:var(--bjork-text-faint)]">
          {m[2]}
        </span>,
      );
    } else if (m[1] !== undefined) {
      out.push(
        <span key={at} className="text-[color:var(--bjork-text)]">
          {m[1]}
        </span>,
      );
    } else {
      out.push(
        <span key={at} className="text-[color:var(--bjork-accent-ink)]">
          {m[0]}
        </span>,
      );
    }
    last = at + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Group

const GroupContext = createContext(false);

export interface ToolCallGroupProps {
  children: ReactNode;
  /** Accessible name for the list. Default "Tool calls". */
  label?: string;
  tone?: BjorkTone;
  className?: string;
}

/** Stacks tool calls in one quiet frame with shared hairlines between them. */
export function ToolCallGroup({ children, label = "Tool calls", tone: toneProp, className }: ToolCallGroupProps) {
  const { style } = useAiTone(toneProp);
  return (
    <GroupContext.Provider value={true}>
      <div
        role="list"
        aria-label={label}
        style={style}
        className={cn(
          "w-full max-w-[640px] divide-y divide-[color:var(--bjork-border)] rounded-[12px] border border-[color:var(--bjork-border)]",
          className,
        )}
      >
        {Children.map(children, (child) =>
          child === null || child === undefined || child === false ? null : <div role="listitem">{child}</div>,
        )}
      </div>
    </GroupContext.Provider>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Card

/** One tool invocation: status, name, summary and duration, expanding to its input and output. */
export function ToolCallCard({
  name,
  status,
  input,
  output,
  error,
  summary,
  startedAt,
  durationMs,
  open,
  defaultOpen = false,
  onOpenChange,
  maxLines = 12,
  now,
  tone: toneProp,
  className,
}: ToolCallCardProps) {
  const { style } = useAiTone(toneProp);
  const reduce = useReduceMotion();
  const grouped = useContext(GroupContext);
  const [isOpen, setOpen] = useControllable(open, defaultOpen, onOpenChange);
  const bodyId = useId();
  const live = status === "running" || status === "input-streaming";

  // Status transitions are announced; token-by-token input is not.
  const [announce, setAnnounce] = useState({ status, message: "" });
  if (announce.status !== status) {
    const message =
      status === "success"
        ? `${name} finished`
        : status === "error"
          ? `${name} failed${error ? `: ${error}` : ""}`
          : status === "denied"
            ? `${name} not run, denied`
            : status === "running"
              ? `${name} running`
              : "";
    setAnnounce({ status, message });
  }

  const shownSummary = status === "denied" ? "Not run — denied by you" : summary;

  return (
    <div
      style={style}
      data-status={status}
      className={cn(
        "@container w-full min-w-0 font-bjork-alpha text-[color:var(--bjork-text)]",
        grouped ? "px-3" : "max-w-[640px] rounded-[12px] border border-[color:var(--bjork-border)] px-3",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={bodyId}
        onClick={() => setOpen(!isOpen)}
        className={cn(
          "-mx-1.5 flex min-h-11 w-[calc(100%+12px)] cursor-pointer items-center gap-2.5 rounded-[8px] px-1.5 py-2 text-left",
          FOCUS_RING,
        )}
      >
        <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center">
          <StrokeMorphIcon name={STATUS_ICON[status]} size={16} strokeWidth={1.75} color={GLYPH_COLOR[status]} />
        </span>
        <VisuallyHidden>{STATUS_WORD[status]}:</VisuallyHidden>
        <span className="flex min-w-0 flex-1 flex-col @[440px]:flex-row @[440px]:items-baseline @[440px]:gap-2.5">
          <span
            className={cn(
              "shrink-0 truncate font-mono text-[12px] leading-5",
              status === "denied" ? "text-[color:var(--bjork-text-muted)]" : "text-[color:var(--bjork-text)]",
            )}
          >
            {name}
          </span>
          {shownSummary && (
            <span
              className={cn(
                "min-w-0 truncate text-[13px] leading-5",
                status === "denied" ? "text-[color:var(--bjork-text-faint)]" : "text-[color:var(--bjork-text-muted)]",
              )}
            >
              {shownSummary}
            </span>
          )}
        </span>
        <Duration live={live} status={status} startedAt={startedAt} durationMs={durationMs} now={now} />
        <span
          aria-hidden="true"
          className={cn(
            "grid size-3 shrink-0 place-items-center transition-transform duration-[180ms] ease-out motion-reduce:transition-none",
            isOpen ? "rotate-180" : "rotate-0",
          )}
        >
          <StrokeMorphIcon name="chevron-down" size={12} strokeWidth={1.75} color="var(--bjork-text-muted)" />
        </span>
      </button>

      <div
        id={bodyId}
        role="region"
        aria-label={`${name} details`}
        aria-hidden={!isOpen || undefined}
        inert={!isOpen}
        className="grid"
        style={{
          gridTemplateRows: isOpen ? "1fr" : "0fr",
          opacity: isOpen ? 1 : 0,
          transition: reduce ? "none" : `grid-template-rows 280ms ${easeCss.drawer}, opacity 280ms ${easeCss.drawer}`,
        }}
      >
        <div className="-mx-1 min-h-0 overflow-hidden px-1">
          <div className="flex flex-col gap-3 pb-3 pl-[30px]">
            <Section label="Input" text={toPretty(input)} streaming={status === "input-streaming"} maxLines={maxLines} />
            {status === "success" && output !== undefined && (
              <Section label="Output" text={toPretty(output)} maxLines={maxLines} />
            )}
            {status === "running" && (
              <p className="font-mono text-[11px] leading-4 text-[color:var(--bjork-text-faint)]">Waiting for output…</p>
            )}
            {status === "error" && (
              <div>
                <SectionLabel>Error</SectionLabel>
                <p className="mt-1.5 rounded-[8px] border border-[color:color-mix(in_srgb,var(--bjork-error)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--bjork-error)_7%,transparent)] px-3 py-2 font-mono text-[12px] leading-[18px] break-words text-[color:var(--bjork-error)]">
                  {error ?? "The tool returned an error."}
                </p>
              </div>
            )}
            {status === "denied" && (
              <p className="text-[12px] leading-4 text-[color:var(--bjork-text-soft)]">
                Not run — denied by you. The assistant was told the call was declined.
              </p>
            )}
          </div>
        </div>
      </div>

      <LiveRegion message={announce.message} />
    </div>
  );
}

function Duration({
  live,
  status,
  startedAt,
  durationMs,
  now,
}: {
  live: boolean;
  status: ToolCallStatus;
  startedAt?: number;
  durationMs?: number;
  now?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const sinceRef = useRef<number | null>(null);
  const frozen = now !== undefined;

  // A running clock writes straight to the DOM at 10Hz, so the card never re-renders while it ticks.
  useLayoutEffect(() => {
    if (!live || frozen) {
      sinceRef.current = null;
      return;
    }
    const paint = () => {
      const clock = Date.now();
      if (sinceRef.current === null) sinceRef.current = startedAt ?? clock;
      const el = ref.current;
      if (el) el.textContent = `${(Math.max(0, clock - (startedAt ?? sinceRef.current)) / 1000).toFixed(1)}s`;
    };
    paint();
    const id = window.setInterval(paint, TICK_MS);
    return () => window.clearInterval(id);
  }, [live, frozen, startedAt]);

  let text: string | null = null;
  if (live && frozen) text = `${(Math.max(0, now - (startedAt ?? now)) / 1000).toFixed(1)}s`;
  else if (!live && durationMs !== undefined && status !== "denied") text = formatDuration(durationMs);

  if (!live && text === null) return null;
  return (
    <span
      ref={live && !frozen ? ref : undefined}
      className={cn(
        "min-w-[4.5ch] shrink-0 whitespace-nowrap text-right font-mono text-[11px] leading-5 tabular-nums",
        status === "running" ? "text-[color:var(--bjork-text-muted)]" : "text-[color:var(--bjork-text-faint)]",
      )}
    >
      {text}
    </span>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase leading-4 tracking-[0.08em] text-[color:var(--bjork-text-faint)]">
      {children}
    </span>
  );
}

function Section({
  label,
  text,
  streaming = false,
  maxLines,
}: {
  label: string;
  text: string;
  streaming?: boolean;
  maxLines: number;
}) {
  const reduce = useReduceMotion();
  const [all, setAll] = useState(false);
  const lines = text === "" ? [] : text.split("\n");
  const clamped = !all && lines.length > maxLines + 2;
  const shown = clamped ? lines.slice(0, maxLines) : lines;

  return (
    <div className="min-w-0">
      <div className="flex h-7 items-center justify-between gap-2">
        <SectionLabel>
          {label}
          {streaming && <span className="normal-case tracking-normal"> · streaming</span>}
        </SectionLabel>
        {text !== "" && !streaming && <CopyButton text={text} label={`Copy ${label.toLowerCase()}`} />}
      </div>
      {lines.length === 0 ? (
        <p className="font-mono text-[11px] leading-4 text-[color:var(--bjork-text-faint)]">
          {streaming ? "Receiving arguments…" : "None"}
        </p>
      ) : (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 6, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={reduce ? { duration: 0.12, ease: ease.out } : springs.blurIn}
          className="relative min-w-0 overflow-hidden rounded-[8px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-field-inset)]"
        >
          <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[11.5px] leading-[18px] text-[color:var(--bjork-text-muted)]">
            <code>
              {shown.map((line, i) => (
                <span key={i} className="block whitespace-pre">
                  {tintLine(line)}
                  {streaming && i === shown.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="ml-px inline-block h-3 w-[2px] translate-y-[2px] bg-[color:var(--bjork-accent)] motion-safe:animate-pulse"
                    />
                  )}
                  {line === "" ? "​" : null}
                </span>
              ))}
            </code>
          </pre>
          {clamped && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[color:var(--bjork-field-inset)] to-transparent"
            />
          )}
        </motion.div>
      )}
      {lines.length > maxLines + 2 && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className={cn(
            "mt-1 inline-flex h-7 cursor-pointer items-center rounded-[6px] px-1.5 -ml-1.5 font-mono text-[11px] text-[color:var(--bjork-text-muted)] transition-colors hover:text-[color:var(--bjork-text)]",
            FOCUS_RING,
          )}
        >
          {all ? "Show less" : `Show all ${lines.length} lines`}
        </button>
      )}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(id);
  }, [copied]);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(
          () => setCopied(true),
          () => undefined,
        );
      }}
      className={cn(
        "grid size-7 cursor-pointer place-items-center rounded-[7px] text-[color:var(--bjork-text-faint)] transition-colors hover:bg-[color:var(--bjork-surface-active)] hover:text-[color:var(--bjork-text)]",
        FOCUS_RING,
        PRESS,
      )}
    >
      {copied ? (
        <Check size={14} strokeWidth={1.75} className="text-[color:var(--bjork-success)]" />
      ) : (
        <Copy size={14} strokeWidth={1.75} />
      )}
    </button>
  );
}
