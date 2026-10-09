"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import { easeCss } from "@/components/bjork-ui/_core/motion";
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

export interface ReasoningDisclosureProps {
  /** The reasoning so far. Pass the full text on every chunk. Blank lines split paragraphs. */
  text: string;
  /** True while reasoning tokens are arriving. The label shimmers and the clock runs. */
  streaming?: boolean;
  /** Epoch milliseconds when reasoning began. Without it, the first streaming render is used. */
  startedAt?: number;
  /** Final reasoning time in milliseconds. Wins over the measured time once streaming ends. */
  durationMs?: number;
  /** Short titles for the reasoning so far, shown as a mini outline. The last one is current while streaming. */
  steps?: string[];
  /** Controlled open state. */
  open?: boolean;
  /** Defaults to open while streaming and closed for a finished message. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Fold shut a beat after streaming ends. Default true. */
  autoCollapse?: boolean;
  /** Height of the live viewport while streaming, in pixels. Default 128. */
  maxHeight?: number;
  /** Label while streaming. Default "Thinking". */
  label?: string;
  /** Demo/preview only: freezes the clock. */
  now?: number;
  tone?: BjorkTone;
  className?: string;
}

export const SAMPLE_REASONING = `The user wants the drafts to stop feeling sticky on slow laptops. Typing itself is cheap, so the cost has to be somewhere on the change path.

Looking at the editor wiring: every change event calls persist(), and persist() serialises the whole document and writes it to IndexedDB. On a 40-page draft that is a few milliseconds per keystroke, which is enough to drop frames on a throttled CPU.

Options: throttle the writes, debounce them, or move serialisation to a worker. A trailing debounce is the smallest change. The risk is losing the last edit when the tab closes, so it needs a flush on visibilitychange.

Reads are already served from the in-memory draftStore cache, so they can stay synchronous. I should mention the measured win from the Kestrel Mini rig and keep the answer short.`;

export const SAMPLE_REASONING_STEPS = [
  "Locate the slow path",
  "Weigh throttle, debounce and a worker",
  "Guard against lost edits",
  "Draft the answer",
];

const AUTO_COLLAPSE_MS = 900;
const TICK_MS = 250;

/** 4200 -> "4s", 72000 -> "1m 12s". Whole seconds, never "0s". */
function formatSeconds(ms: number): string {
  const total = Math.max(1, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}

/** Live seconds while streaming count up from zero, so the first second reads "0s" rather than jumping to 1. */
function formatLive(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}

/**
 * A model's reasoning as a quiet disclosure. While it streams, the label shimmers, the seconds count up and the text
 * scrolls in a capped viewport. When it ends it becomes "Thought for 12s" and folds away.
 */
export function ReasoningDisclosure({
  text,
  streaming = false,
  startedAt,
  durationMs,
  steps,
  open,
  defaultOpen,
  onOpenChange,
  autoCollapse = true,
  maxHeight = 128,
  label = "Thinking",
  now,
  tone: toneProp,
  className,
}: ReasoningDisclosureProps) {
  const { pal, style } = useAiTone(toneProp);
  const reduce = useReduceMotion();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [isOpen, setOpen] = useControllable(open, defaultOpen ?? streaming, onOpenChange);

  // Streaming transitions, derived during render. `finished` is true only when this instance saw streaming end.
  const [phase, setPhase] = useState({ streaming, finished: false, message: "" });
  if (phase.streaming !== streaming) {
    setPhase({
      streaming,
      finished: !streaming,
      message: streaming
        ? `${label}`
        : durationMs !== undefined
          ? `Thought for ${formatSeconds(durationMs)}`
          : "Finished thinking",
    });
  }

  useEffect(() => {
    if (!phase.finished || !autoCollapse) return;
    const id = window.setTimeout(() => setOpen(false), AUTO_COLLAPSE_MS);
    return () => window.clearTimeout(id);
  }, [phase.finished, autoCollapse, setOpen]);

  // The clock. Times live in refs and the seconds are painted straight into the DOM, so ticking never re-renders.
  const startRef = useRef<number | null>(null);
  const endRef = useRef<number | null>(null);
  const latest = useRef({ streaming, startedAt, durationMs, now });

  const paint = useCallback(() => {
    const el = rootRef.current?.querySelector<HTMLElement>("[data-reasoning-clock]");
    if (!el) return;
    const { streaming: live, startedAt: start, durationMs: duration, now: frozen } = latest.current;
    const from = start ?? startRef.current;
    if (live) {
      el.textContent = from === null ? "0s" : formatLive((frozen ?? Date.now()) - from);
      return;
    }
    if (duration !== undefined) el.textContent = formatSeconds(duration);
    else if (from !== null && endRef.current !== null) el.textContent = formatSeconds(endRef.current - from);
    else el.textContent = "a moment";
  }, []);

  useLayoutEffect(() => {
    latest.current = { streaming, startedAt, durationMs, now };
    const clock = now ?? Date.now();
    if (streaming) {
      if (startRef.current === null || endRef.current !== null) startRef.current = clock;
      endRef.current = null;
    } else if (startRef.current !== null && endRef.current === null) {
      endRef.current = clock;
    }
    paint();
  });

  useEffect(() => {
    if (!streaming || now !== undefined) return;
    const id = window.setInterval(paint, TICK_MS);
    return () => window.clearInterval(id);
  }, [streaming, now, paint]);

  // Auto-scroll the live viewport, unless the reader has scrolled up to read something.
  const stickRef = useRef(true);
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    if (streaming && stickRef.current) el.scrollTop = el.scrollHeight;
    el.dataset.fade = streaming && el.scrollTop > 2 ? "true" : "false";
  }, [text, streaming, isOpen]);

  const onScroll = () => {
    const el = viewportRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
    el.dataset.fade = streaming && el.scrollTop > 2 ? "true" : "false";
  };

  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim() !== "");
  const capped = streaming;

  return (
    <div
      ref={rootRef}
      className={cn("@container w-full max-w-[560px] font-bjork-alpha text-[color:var(--bjork-text)]", className)}
      style={style}
    >
      <style href="bjork-ai-shimmer" precedence="default">
        {SHIMMER_TEXT_CSS}
      </style>

      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setOpen(!isOpen)}
        className={cn(
          "group -mx-1.5 inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-[8px] px-1.5 text-left",
          FOCUS_RING,
          PRESS,
        )}
      >
        <span className="flex items-baseline gap-1.5 text-[14px] leading-5">
          {streaming ? (
            <span className="bjork-ai-shimmer font-medium">{label}</span>
          ) : (
            <span className="font-medium text-[color:var(--bjork-text-muted)] transition-colors group-hover:text-[color:var(--bjork-text)]">
              Thought for
            </span>
          )}
          {streaming && now !== undefined && startedAt !== undefined ? (
            <span key="frozen" className={clockClass(streaming)}>
              {formatLive(now - startedAt)}
            </span>
          ) : !streaming && durationMs !== undefined ? (
            <span key="final" className={clockClass(streaming)}>
              {formatSeconds(durationMs)}
            </span>
          ) : (
            <span key="live" data-reasoning-clock="" className={clockClass(streaming)} />
          )}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "grid size-3.5 shrink-0 place-items-center transition-transform duration-[180ms] ease-out motion-reduce:transition-none",
            isOpen ? "rotate-0" : "-rotate-90",
          )}
        >
          <StrokeMorphIcon name="chevron-down" size={12} strokeWidth={1.75} color={pal.textFaint} />
        </span>
      </button>

      <div
        id={panelId}
        role="region"
        aria-label="Reasoning"
        aria-hidden={!isOpen || undefined}
        inert={!isOpen}
        className="grid"
        style={{
          gridTemplateRows: isOpen ? "1fr" : "0fr",
          opacity: isOpen ? 1 : 0,
          transition: reduce ? "none" : `grid-template-rows 280ms ${easeCss.drawer}, opacity 280ms ${easeCss.drawer}`,
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="ml-[3px] mt-1.5 border-l border-[color:var(--bjork-border)] pl-4">
            {steps && steps.length > 0 && (
              <ol aria-label="Outline" className="mb-2.5 grid gap-1 pt-0.5">
                {steps.map((step, i) => {
                  const current = streaming && i === steps.length - 1;
                  return (
                    <li key={`${i}:${step}`} className="flex min-w-0 items-center gap-2.5 text-[12px] leading-[18px]">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-[5px] shrink-0 rounded-full",
                          current ? "bg-[color:var(--bjork-accent)]" : "bg-[color:var(--bjork-text-faint)]",
                        )}
                      />
                      <span
                        className={cn(
                          "min-w-0 truncate",
                          current ? "text-[color:var(--bjork-text-medium)]" : "text-[color:var(--bjork-text-soft)]",
                        )}
                      >
                        {step}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
            <div
              ref={viewportRef}
              onScroll={onScroll}
              tabIndex={capped ? 0 : undefined}
              aria-label={capped ? "Reasoning so far" : undefined}
              className={cn(
                "rounded-[4px] text-[13px] leading-5 text-[color:var(--bjork-text-muted)] [overflow-wrap:anywhere]",
                "data-[fade=true]:[mask-image:linear-gradient(to_bottom,transparent,black_28px)]",
                capped && "overflow-y-auto overscroll-contain [scrollbar-width:none]",
                capped && FOCUS_RING,
              )}
              style={capped ? { maxHeight } : undefined}
            >
              {paragraphs.length === 0 && streaming ? (
                <p className="text-[color:var(--bjork-text-faint)]">…</p>
              ) : (
                paragraphs.map((p, i) => (
                  <p key={i} className="mb-2.5 whitespace-pre-wrap last:mb-0">
                    {p}
                  </p>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <LiveRegion message={phase.message} />
    </div>
  );
}

function clockClass(streaming: boolean): string {
  return cn(
    "inline-block min-w-[3ch] font-mono text-[12px] tabular-nums",
    streaming ? "text-[color:var(--bjork-text-faint)]" : "text-[color:var(--bjork-text-muted)]",
  );
}
