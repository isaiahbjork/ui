"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LiveRegion, VisuallyHidden } from "@/components/bjork-ui/_core/a11y";
import { ease, easeCss } from "@/components/bjork-ui/_core/motion";
import {
  FOCUS_RING,
  PRESS,
  SHIMMER_TEXT_CSS,
  useAiTone,
  useReduceMotion,
  type BjorkTone,
} from "@/components/bjork-ui/ai/_shared";
import { StrokeMorphIcon, type StrokeIconName } from "@/components/bjork-ui/utilities/stroke-morph-icon";
import { cn } from "@/lib/utils";

export type StreamStatusState = "working" | "done" | "error" | "stopped";

export interface StreamStatusProps {
  /** What is happening now, such as "Searching 14 sources". In a terminal state it is the receipt text. */
  phase: string;
  status?: StreamStatusState;
  /** 0 to 1. Leave undefined for an indeterminate hairline. */
  progress?: number;
  /** Current step, 1-based. Shown as "3/5" with `totalSteps`. */
  step?: number;
  totalSteps?: number;
  /** Epoch milliseconds when the work began. Without it, the first render is used. */
  startedAt?: number;
  /** Final time in milliseconds for a terminal state. Without it, the measured time is used. */
  durationMs?: number;
  /** Shows a Stop button while working. */
  onStop?: () => void;
  /** Demo/preview only: freezes the clock. */
  now?: number;
  tone?: BjorkTone;
  className?: string;
}

export interface StreamPhase {
  phase: string;
  /** How long the phase lasts in the sample script, in milliseconds. */
  ms: number;
}

/** A realistic research run, for demos. */
export const SAMPLE_STREAM_PHASES: StreamPhase[] = [
  { phase: "Planning the search", ms: 1400 },
  { phase: "Searching 14 sources", ms: 2600 },
  { phase: "Reading fieldnotes.dev", ms: 2200 },
  { phase: "Reading the Lumen Labs changelog", ms: 2000 },
  { phase: "Writing", ms: 3000 },
];

const ICON: Record<StreamStatusState, StrokeIconName> = {
  working: "busy",
  done: "check",
  error: "close",
  stopped: "minus",
};

const WORD: Record<StreamStatusState, string> = {
  working: "Working",
  done: "Done",
  error: "Failed",
  stopped: "Stopped",
};

const CSS =
  "@keyframes bjork-stream-scan{from{transform:translateX(-100%)}to{transform:translateX(340%)}}" +
  ".bjork-stream-scan{animation:bjork-stream-scan 1.6s cubic-bezier(0.45,0,0.25,1) infinite}" +
  "@media (prefers-reduced-motion: reduce){.bjork-stream-scan{animation:none;transform:none;width:100%!important;opacity:.35}}";

/** 4200 -> "0:04", 72000 -> "1:12". */
function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * One quiet line for a long AI wait: the current phase in shimmering text, an elapsed clock, an optional step count
 * and Stop button, and a hairline of progress. It settles into a distinct receipt when the work ends.
 */
export function StreamStatus({
  phase,
  status = "working",
  progress,
  step,
  totalSteps,
  startedAt,
  durationMs,
  onStop,
  now,
  tone: toneProp,
  className,
}: StreamStatusProps) {
  const { pal, style } = useAiTone(toneProp);
  const reduce = useReduceMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const working = status === "working";

  // Live clock, painted into the DOM so the tick never re-renders React.
  const startRef = useRef<number | null>(null);
  const endRef = useRef<number | null>(null);
  const latest = useRef({ working, startedAt, durationMs, now });
  const paint = useCallback(() => {
    const el = rootRef.current?.querySelector<HTMLElement>("[data-stream-clock]");
    if (!el) return;
    const { working: live, startedAt: start, durationMs: duration, now: frozen } = latest.current;
    const from = start ?? startRef.current ?? frozen ?? Date.now();
    if (!live && duration !== undefined) el.textContent = formatClock(duration);
    else el.textContent = formatClock((live ? (frozen ?? Date.now()) : (endRef.current ?? frozen ?? Date.now())) - from);
  }, []);

  useLayoutEffect(() => {
    latest.current = { working, startedAt, durationMs, now };
    const clock = now ?? Date.now();
    if (working) {
      if (startRef.current === null || endRef.current !== null) startRef.current = clock;
      endRef.current = null;
    } else if (endRef.current === null) {
      endRef.current = clock;
    }
    paint();
  });

  useEffect(() => {
    if (!working || now !== undefined) return;
    const id = window.setInterval(paint, 250);
    return () => window.clearInterval(id);
  }, [working, now, paint]);

  // Announce phase and status changes, derived during render.
  const [seen, setSeen] = useState({ phase, status, message: working ? phase : `${WORD[status]}: ${phase}` });
  if (seen.phase !== phase || seen.status !== status) {
    setSeen({ phase, status, message: status === "working" ? phase : `${WORD[status]}: ${phase}` });
  }

  const determinate = progress !== undefined;
  const pct = Math.min(1, Math.max(0, progress ?? 0));
  const hasSteps = step !== undefined && totalSteps !== undefined && totalSteps > 0;

  const glyphColor =
    status === "working"
      ? pal.accentInk
      : status === "done"
        ? pal.success
        : status === "error"
          ? pal.error
          : pal.textFaint;

  const barColor =
    status === "error"
      ? "var(--bjork-error)"
      : status === "done"
        ? "var(--bjork-success)"
        : status === "stopped"
          ? "var(--bjork-text-faint)"
          : "var(--bjork-accent)";
  const barScale = status === "done" || status === "error" ? 1 : pct;

  const textVariants = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 10, filter: "blur(3px)" },
        animate: { opacity: 1, y: 0, filter: "blur(0px)" },
        exit: { opacity: 0, y: -10, filter: "blur(3px)" },
      };

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label="Response status"
      aria-busy={working || undefined}
      data-status={status}
      className={cn(
        "@container relative w-full max-w-[520px] font-bjork-alpha text-[color:var(--bjork-text)]",
        className,
      )}
      style={style}
    >
      <style href="bjork-ai-shimmer" precedence="default">
        {SHIMMER_TEXT_CSS}
      </style>
      <style href="bjork-stream-status" precedence="default">
        {CSS}
      </style>

      <div className="flex min-h-9 items-center gap-2.5 pb-1.5 pt-1">
        <span aria-hidden="true" className="grid size-4 shrink-0 place-items-center">
          <StrokeMorphIcon name={ICON[status]} size={16} strokeWidth={1.75} color={glyphColor} />
        </span>

        <span className="relative h-5 min-w-0 flex-1 overflow-hidden">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={`${status}:${phase}`}
              variants={textVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={reduce ? { duration: 0.14, ease: ease.out } : { duration: 0.26, ease: ease.out }}
              className={cn(
                "block truncate text-[14px] font-medium leading-5",
                status === "working" && "bjork-ai-shimmer",
                status === "done" && "text-[color:var(--bjork-text)]",
                status === "error" && "text-[color:var(--bjork-error)]",
                status === "stopped" && "text-[color:var(--bjork-text-muted)]",
              )}
            >
              {phase}
            </motion.span>
          </AnimatePresence>
        </span>

        {hasSteps && (
          <span className="shrink-0 font-mono text-[11px] leading-5 tabular-nums text-[color:var(--bjork-text-faint)]">
            <VisuallyHidden>Step </VisuallyHidden>
            {step}
            <span aria-hidden="true">/</span>
            <VisuallyHidden> of </VisuallyHidden>
            {totalSteps}
          </span>
        )}

        {now !== undefined && startedAt !== undefined && (working || durationMs === undefined) ? (
          <span key="frozen" className={clockClass(status)}>
            {formatClock(now - startedAt)}
          </span>
        ) : !working && durationMs !== undefined ? (
          <span key="final" className={clockClass(status)}>
            {formatClock(durationMs)}
          </span>
        ) : (
          <span key="live" data-stream-clock="" className={clockClass(status)} />
        )}

        {working && onStop && (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop"
            className={cn(
              "-my-1 -mr-1 flex h-7 min-w-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] px-1.5 text-[12px] font-medium text-[color:var(--bjork-text-muted)] transition-colors hover:bg-[var(--bjork-surface-active)] hover:text-[color:var(--bjork-text)] @[360px]:px-2",
              FOCUS_RING,
              PRESS,
            )}
          >
            <span aria-hidden="true" className="size-2 rounded-[2px] bg-current" />
            <span className="hidden @[360px]:inline">Stop</span>
          </button>
        )}
      </div>

      <div
        aria-hidden="true"
        className="relative h-px w-full overflow-hidden bg-[color:var(--bjork-border)]"
      >
        {working && !determinate ? (
          <span
            className="bjork-stream-scan absolute inset-y-0 left-0 w-[30%]"
            style={{ background: `linear-gradient(90deg, transparent, ${barColor}, transparent)` }}
          />
        ) : (
          <span
            className="absolute inset-0 origin-left"
            style={{
              background: barColor,
              transform: `scaleX(${barScale})`,
              opacity: status === "done" ? 0.55 : 1,
              transition: reduce
                ? "none"
                : `transform 420ms ${easeCss.out}, background-color 200ms ease-out, opacity 600ms ease-out`,
            }}
          />
        )}
      </div>

      {working && determinate && (
        <span role="progressbar" aria-label={phase} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)} className="sr-only" />
      )}
      <LiveRegion message={seen.message} />
    </div>
  );
}

function clockClass(status: StreamStatusState): string {
  return cn(
    "min-w-[4ch] shrink-0 text-right font-mono text-[11px] leading-5 tabular-nums",
    status === "error" ? "text-[color:var(--bjork-text-muted)]" : "text-[color:var(--bjork-text-faint)]",
  );
}
