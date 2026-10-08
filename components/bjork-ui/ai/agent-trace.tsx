"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { LiveRegion, VisuallyHidden } from "@/components/bjork-ui/_core/a11y";
import { useVisibleLoop } from "@/components/bjork-ui/_core/loop";
import { BJORK_PALETTE, type BjorkTone } from "@/components/bjork-ui/_core/palette";
import { ease, easeCss, springs } from "@/components/bjork-ui/_core/motion";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import {
  StrokeMorphIcon,
  type StrokeIconName,
} from "@/components/bjork-ui/utilities/stroke-morph-icon";
import { cn } from "@/lib/utils";

export type AgentStepStatus = "pending" | "active" | "done" | "error" | "skipped";

export interface AgentStep {
  id: string;
  /** Free-form tag such as "search" or "tool". Shown in uppercase at 420px and wider. */
  kind?: string;
  label: string;
  detail?: ReactNode;
  status: AgentStepStatus;
  /** Epoch milliseconds (Date.now()) when an active step began. Without it, the first observed time is used. */
  startedAt?: number;
  /** Final duration in milliseconds. Required for a finished step to show a duration. */
  durationMs?: number;
}

export interface AgentTraceProps {
  steps: AgentStep[];
  /** Header title. Default "Thinking". */
  title?: string;
  /** Controlled collapsed state. */
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Fold to the header 800ms after every step is done or skipped. Never when a step errored. Default true. */
  autoCollapse?: boolean;
  /** Steps slower than this turn amber. Default 4000. */
  slowThresholdMs?: number;
  /** Replaces the step count and duration in the header while collapsed. */
  summary?: ReactNode;
  density?: "comfortable" | "compact";
  tone?: BjorkTone;
  /** Plays a built-in demo script on a loop. Ignores `steps`. */
  attract?: boolean;
  className?: string;
}

interface RailState {
  scale: number;
  color: string;
  shimmer: boolean;
}

const TICK_MS = 100;
const AUTO_COLLAPSE_MS = 800;
const ATTRACT_IDLE_MS = 4000;
const ATTRACT_CYCLE_S = 16;
const SHIMMER_KEYFRAMES =
  "@keyframes agent-trace-shimmer { from { background-position: 0 -24px; } to { background-position: 0 calc(100% + 24px); } }";

const STATUS_ICON: Record<AgentStepStatus, StrokeIconName> = {
  pending: "dot",
  active: "busy",
  done: "check",
  error: "close",
  skipped: "minus",
};

const STATUS_WORD: Record<AgentStepStatus, string> = {
  pending: "pending",
  active: "running",
  done: "done",
  error: "failed",
  skipped: "skipped",
};

interface ScriptStep {
  id: string;
  kind: string;
  label: string;
  seconds: number;
  error?: boolean;
}

const ATTRACT_SCRIPT: ScriptStep[] = [
  { id: "parse", kind: "think", label: "Parse request", seconds: 0.6 },
  { id: "search", kind: "search", label: 'Search docs: "optical alignment"', seconds: 1.8 },
  { id: "read", kind: "read", label: "Read OPTICAL-ALIGNMENT.md", seconds: 1.1 },
  { id: "draft", kind: "code", label: "Draft component spec", seconds: 5.2 },
  { id: "typecheck", kind: "tool", label: "Run type check", seconds: 2.0, error: true },
  { id: "retry", kind: "tool", label: "Retry type check", seconds: 1.4 },
  { id: "compose", kind: "think", label: "Compose answer", seconds: 0.9 },
];

// Start time of each script step in seconds, and the end of the script.
const SCRIPT_STARTS_S = ATTRACT_SCRIPT.reduce<number[]>(
  (acc, step, i) => (i === 0 ? [0] : [...acc, acc[i - 1] + ATTRACT_SCRIPT[i - 1].seconds]),
  [],
);
const SCRIPT_END_S = ATTRACT_SCRIPT.reduce((sum, step) => sum + step.seconds, 0);

// Frame k: steps before k are finished, step k is active, the rest are pending. k = 7 is finished.
const ATTRACT_FRAMES: AgentStep[][] = Array.from({ length: ATTRACT_SCRIPT.length + 1 }, (_, stage) =>
  ATTRACT_SCRIPT.map((step, i): AgentStep => {
    if (i < stage) {
      return {
        id: step.id,
        kind: step.kind,
        label: step.label,
        status: step.error ? "error" : "done",
        durationMs: Math.round(step.seconds * 1000),
      };
    }
    return {
      id: step.id,
      kind: step.kind,
      label: step.label,
      status: i === stage ? "active" : "pending",
    };
  }),
);

function stageAt(t: number): number {
  let stage = 0;
  SCRIPT_STARTS_S.forEach((start, i) => {
    if (t >= start) stage = i;
  });
  return stage;
}

function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function liveElapsed(
  step: AgentStep,
  now: number,
  playing: boolean,
  attractMs: number,
  since: ReadonlyMap<string, number>,
): number {
  if (playing) return attractMs;
  return Math.max(0, now - (step.startedAt ?? since.get(step.id) ?? now));
}

function railOf(owner: AgentStep | undefined, slow: boolean, reduce: boolean): RailState {
  const color = slow ? "var(--bjork-warning)" : "var(--bjork-accent)";
  if (!owner) return { scale: 0, color, shimmer: false };
  if (owner.status === "done") return { scale: 1, color, shimmer: false };
  if (owner.status === "active") {
    // Reduced motion: a static half-filled segment instead of the shimmer.
    return reduce ? { scale: 0.5, color, shimmer: false } : { scale: 0, color, shimmer: true };
  }
  return { scale: 0, color, shimmer: false };
}

/**
 * A timeline of agent steps. The rail fills as steps finish, slow steps turn amber, and the whole trace
 * folds into a one-line receipt once it is done.
 */
export function AgentTrace({
  steps,
  title = "Thinking",
  collapsed,
  defaultCollapsed = false,
  onCollapsedChange,
  autoCollapse = true,
  slowThresholdMs = 4000,
  summary,
  density = "comfortable",
  tone: toneProp,
  attract = false,
  className,
}: AgentTraceProps) {
  const tone = useBjorkTone(toneProp);
  const pal = BJORK_PALETTE[tone];
  const reduce = useReducedMotion() === true;
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const compact = density === "compact";
  const PAD = compact ? 4 : 8; // row padding
  const MIN_H = compact ? 28 : 36;
  const CENTRE = PAD + 10; // glyph centre: the 20px label line box is centred on the glyph (R4, R6)

  // Attract script state. Only the stage changes React state; the clock lives in refs.
  const playing = attract && !reduce;
  const [stage, setStage] = useState(0);
  const clockRef = useRef(0);
  const stageRef = useRef(0);
  const holdRef = useRef(false);
  const elapsedRef = useRef(0);
  const inputAt = useRef(Number.NEGATIVE_INFINITY);

  const displayed = useMemo<AgentStep[]>(() => {
    if (!attract) return steps;
    return ATTRACT_FRAMES[reduce ? ATTRACT_SCRIPT.length : stage];
  }, [attract, reduce, stage, steps]);

  // Collapsed state, controlled or not.
  const controlled = collapsed !== undefined;
  const [innerCollapsed, setInnerCollapsed] = useState(defaultCollapsed);
  const isCollapsed = controlled ? collapsed : innerCollapsed;
  const onChangeRef = useRef(onCollapsedChange);
  useLayoutEffect(() => {
    onChangeRef.current = onCollapsedChange;
  });
  const collapseTo = useCallback(
    (next: boolean) => {
      if (!controlled) setInnerCollapsed(next);
      onChangeRef.current?.(next);
    },
    [controlled],
  );

  const allFinished =
    displayed.length > 0 && displayed.every((s) => s.status === "done" || s.status === "skipped");
  const anyError = displayed.some((s) => s.status === "error");

  useEffect(() => {
    if (!autoCollapse || !allFinished || anyError || attract) return;
    const id = window.setTimeout(() => collapseTo(true), AUTO_COLLAPSE_MS);
    return () => window.clearTimeout(id);
  }, [autoCollapse, allFinished, anyError, attract, collapseTo]);

  // Live time. Refs and DOM writes only, so the 10Hz tick never re-renders React.
  const activeSince = useRef(new Map<string, number>());
  const liveSlowRef = useRef(new Set<string>());
  const [liveSlow, setLiveSlow] = useState<ReadonlySet<string>>(() => new Set());
  const latest = useRef({ displayed, slowThresholdMs, playing });

  const paintLive = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const { displayed: list, playing: live } = latest.current;
    const now = Date.now();
    let total = 0;
    for (const s of list) if (s.durationMs !== undefined) total += s.durationMs;
    const active = list.find((s) => s.status === "active");
    if (active) total += liveElapsed(active, now, live, elapsedRef.current, activeSince.current);
    root.querySelectorAll<HTMLElement>("[data-live-elapsed]").forEach((el) => {
      const step = list.find((s) => s.id === el.dataset.liveElapsed);
      if (step) el.textContent = formatMs(liveElapsed(step, now, live, elapsedRef.current, activeSince.current));
    });
    const totalEl = root.querySelector<HTMLElement>("[data-live-total]");
    if (totalEl) totalEl.textContent = formatMs(total);
  }, []);

  // Runs after every commit. It records when steps became active and repaints the live text.
  useLayoutEffect(() => {
    latest.current = { displayed, slowThresholdMs, playing };
    const now = Date.now();
    const since = activeSince.current;
    const activeIds = new Set<string>();
    for (const s of displayed) {
      if (s.status !== "active") continue;
      activeIds.add(s.id);
      if (s.startedAt === undefined && !since.has(s.id)) since.set(s.id, now);
    }
    for (const id of since.keys()) if (!activeIds.has(id)) since.delete(id);
    paintLive();
  });

  const tick = useCallback(() => {
    paintLive();
    const { displayed: list, slowThresholdMs: threshold, playing: live } = latest.current;
    const active = list.find((s) => s.status === "active");
    if (!active || liveSlowRef.current.has(active.id)) return;
    const ms = liveElapsed(active, Date.now(), live, elapsedRef.current, activeSince.current);
    if (ms > threshold) {
      liveSlowRef.current.add(active.id);
      setLiveSlow(new Set(liveSlowRef.current));
    }
  }, [paintLive]);

  const hasActive = displayed.some((s) => s.status === "active");
  useEffect(() => {
    if (!hasActive) return;
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [hasActive, tick]);

  // Attract clock. Pauses for 4s after any pointer or key input inside the component.
  const markInput = useCallback(() => {
    inputAt.current = performance.now();
  }, []);

  const frame = (dt: number) => {
    if (performance.now() - inputAt.current < ATTRACT_IDLE_MS) return true;
    let t = clockRef.current + dt;
    if (t >= ATTRACT_CYCLE_S) t -= ATTRACT_CYCLE_S;
    clockRef.current = t;
    const nextStage = t >= SCRIPT_END_S ? ATTRACT_SCRIPT.length : stageAt(t);
    elapsedRef.current = nextStage < ATTRACT_SCRIPT.length ? (t - SCRIPT_STARTS_S[nextStage]) * 1000 : 0;
    if (nextStage !== stageRef.current) {
      stageRef.current = nextStage;
      setStage(nextStage);
    }
    const hold = t >= SCRIPT_END_S;
    if (hold !== holdRef.current) {
      holdRef.current = hold;
      collapseTo(hold); // the trace folds for 3s at the end of each run
    }
    return true;
  };
  useVisibleLoop(rootRef, frame, { enabled: playing });

  // LiveRegion text. Derived during render, so it updates only when a status changes.
  const [announce, setAnnounce] = useState<{ seen: AgentStep[]; message: string }>(() => ({
    seen: displayed,
    message: "",
  }));
  let message = announce.message;
  if (announce.seen !== displayed) {
    const before = new Map(announce.seen.map((s) => [s.id, s.status] as const));
    for (const s of displayed) {
      if (before.get(s.id) === s.status) continue;
      if (s.status === "done") message = `${s.label}: done`;
      if (s.status === "error") message = `${s.label}: failed`;
    }
    setAnnounce({ seen: displayed, message });
  }

  const isSlow = (s: AgentStep) =>
    (s.durationMs !== undefined && s.durationMs > slowThresholdMs) || liveSlow.has(s.id);

  const countLabel = `${displayed.length} ${displayed.length === 1 ? "step" : "steps"}`;

  const cssVars = {
    "--bjork-text": pal.text,
    "--bjork-text-medium": pal.textMedium,
    "--bjork-text-muted": pal.textMuted,
    "--bjork-text-soft": pal.textSoft,
    "--bjork-text-faint": pal.textFaint,
    "--bjork-border": pal.border,
    "--bjork-accent": pal.accent,
    "--bjork-accent-ink": pal.accentInk,
    "--bjork-accent-foreground": pal.accentFg,
    "--bjork-warning": pal.warning,
    "--bjork-ring-offset": pal.bg,
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      data-loop="idle"
      className={cn(
        "@container relative w-full max-w-[520px] font-bjork-alpha text-[color:var(--bjork-text)]",
        className,
      )}
      style={cssVars}
      onPointerDown={markInput}
      onPointerMove={markInput}
      onKeyDown={markInput}
    >
      <style href="bjork-agent-trace-shimmer" precedence="default">
        {SHIMMER_KEYFRAMES}
      </style>

      <button
        type="button"
        aria-expanded={!isCollapsed}
        aria-controls={listId}
        onClick={() => collapseTo(!isCollapsed)}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between gap-3 rounded-[8px] text-left outline-none transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bjork-ring-offset)]",
          compact ? "py-1" : "py-2",
        )}
      >
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="text-[14px] font-semibold leading-5 text-[color:var(--bjork-text)]">{title}</span>
          {isCollapsed && summary !== undefined ? (
            <span className="min-w-0 font-mono text-[12px] leading-5 text-[color:var(--bjork-text-muted)]">
              {summary}
            </span>
          ) : (
            <span className="font-mono text-[12px] leading-5 tabular-nums text-[color:var(--bjork-text-muted)]">
              {countLabel}
              {displayed.length > 0 && (
                <>
                  {" · "}
                  <span data-live-total />
                </>
              )}
            </span>
          )}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "grid size-3 shrink-0 place-items-center text-[color:var(--bjork-text-muted)] transition-transform duration-[180ms] ease-out motion-reduce:transition-none",
            isCollapsed ? "rotate-0" : "rotate-180",
          )}
        >
          <StrokeMorphIcon name="chevron-down" size={12} strokeWidth={1.75} color={pal.textMuted} />
        </span>
      </button>

      <div
        id={listId}
        aria-hidden={isCollapsed || undefined}
        inert={isCollapsed}
        className="grid"
        style={{
          gridTemplateRows: isCollapsed ? "0fr" : "1fr",
          opacity: isCollapsed ? 0 : 1,
          transition: reduce ? "none" : `grid-template-rows 280ms ${easeCss.drawer}, opacity 280ms ${easeCss.drawer}`,
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <ol className="relative pt-1">
            {displayed.map((step, i) => {
              const above = i > 0 ? displayed[i - 1] : undefined;
              const below = i < displayed.length - 1 ? displayed[i + 1] : undefined;
              return (
                <StepRow
                  key={step.id}
                  step={step}
                  aboveRail={i > 0 ? railOf(above, above ? isSlow(above) : false, reduce) : null}
                  belowRail={below ? railOf(step, isSlow(step), reduce) : null}
                  slow={isSlow(step)}
                  pal={pal}
                  reduce={reduce}
                  pad={PAD}
                  centre={CENTRE}
                  minHeight={MIN_H}
                />
              );
            })}
          </ol>
        </div>
      </div>

      <LiveRegion message={message} />
    </div>
  );
}

interface StepRowProps {
  step: AgentStep;
  aboveRail: RailState | null;
  belowRail: RailState | null;
  slow: boolean;
  pal: (typeof BJORK_PALETTE)[BjorkTone];
  reduce: boolean;
  pad: number;
  centre: number;
  minHeight: number;
}

function StepRow({ step, aboveRail, belowRail, slow, pal, reduce, pad, centre, minHeight }: StepRowProps) {
  const detailId = useId();
  const [detailEl, setDetailEl] = useState<HTMLSpanElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const expandedRef = useRef(expanded);
  useLayoutEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  const hasDetail = step.detail !== undefined && step.detail !== null && step.detail !== "";

  // A detail is a disclosure only when its one-line truncation actually hides text. The measurement is
  // skipped while expanded, because the wrapped text would then read as fitting.
  useEffect(() => {
    if (!detailEl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (!expandedRef.current) setOverflows(detailEl.scrollWidth > detailEl.clientWidth + 1);
    });
    ro.observe(detailEl);
    return () => ro.disconnect();
  }, [detailEl]);

  const expandable = hasDetail && (overflows || expanded);

  const glyphColor =
    step.status === "active"
      ? pal.accentInk
      : step.status === "error"
        ? pal.error
        : step.status === "done"
          ? pal.textMuted
          : pal.textFaint;

  const detailClass = cn(
    "block text-[12px] leading-4 text-[color:var(--bjork-text-soft)]",
    expanded ? "whitespace-normal break-words" : "truncate",
  );

  let durationNode: ReactNode = null;
  if (step.status === "active") {
    durationNode = <span data-live-elapsed={step.id} />;
  } else if (step.durationMs !== undefined) {
    durationNode = formatMs(step.durationMs);
  }

  return (
    <motion.li
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, filter: "blur(4px)" }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={reduce ? { duration: 0.12, ease: ease.out } : springs.blurIn}
      className="relative"
      style={{ minHeight, paddingTop: pad, paddingBottom: pad }}
      data-status={step.status}
    >
      {aboveRail && <RailHalf edge="upper" state={aboveRail} centre={centre} reduce={reduce} />}
      {belowRail && <RailHalf edge="lower" state={belowRail} centre={centre} reduce={reduce} />}

      <span className="absolute left-0 flex h-5 w-7 items-center justify-center" style={{ top: pad }}>
        <StrokeMorphIcon name={STATUS_ICON[step.status]} size={16} strokeWidth={1.75} color={glyphColor} />
      </span>
      <VisuallyHidden>{STATUS_WORD[step.status]}</VisuallyHidden>

      <div className="relative min-w-0 pl-9">
        <div className="flex min-w-0 items-baseline gap-3">
          <div className="flex min-w-0 flex-1 items-baseline">
            {step.kind && (
              <span className="mr-2 hidden shrink-0 font-mono text-[10px] uppercase leading-5 tracking-[0.08em] text-[color:var(--bjork-text-faint)] @[420px]:inline">
                {step.kind}
              </span>
            )}
            <span
              className={cn(
                "line-clamp-2 min-w-0 text-[14px] font-medium leading-5",
                step.status === "pending" ? "text-[color:var(--bjork-text-muted)]" : "text-[color:var(--bjork-text)]",
              )}
            >
              {step.label}
            </span>
          </div>
          {durationNode !== null && (
            <span
              className={cn(
                "min-w-[3.5ch] shrink-0 whitespace-nowrap text-right font-mono text-[11px] leading-5 tabular-nums",
                slow ? "text-[color:var(--bjork-warning)]" : "text-[color:var(--bjork-text-faint)]",
              )}
            >
              {durationNode}
            </span>
          )}
        </div>

        {hasDetail &&
          (expandable ? (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={detailId}
              onClick={() => setExpanded((v) => !v)}
              className="mt-0.5 block w-full min-w-0 cursor-pointer rounded-[4px] text-left outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bjork-ring-offset)]"
            >
              <span id={detailId} ref={setDetailEl} className={detailClass}>
                {step.detail}
              </span>
            </button>
          ) : (
            <span id={detailId} ref={setDetailEl} className={cn("mt-0.5", detailClass)}>
              {step.detail}
            </span>
          ))}
      </div>
    </motion.li>
  );
}

function RailHalf({
  edge,
  state,
  centre,
  reduce,
}: {
  edge: "upper" | "lower";
  state: RailState;
  centre: number;
  reduce: boolean;
}) {
  const position = edge === "upper" ? { top: 0, height: centre } : { top: centre, bottom: 0 };
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-[14px] w-px -translate-x-1/2 overflow-hidden bg-[color:var(--bjork-border)]"
      style={position}
    >
      <div
        className="absolute inset-0 origin-top"
        style={{
          background: state.color,
          transform: `scaleY(${state.scale})`,
          transition: reduce ? "none" : "transform 320ms cubic-bezier(0.23,1,0.32,1)",
        }}
      />
      {state.shimmer && (
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to bottom, transparent, ${state.color}, transparent) 0 -24px / 100% 24px no-repeat`,
            animation: "agent-trace-shimmer 1.4s linear infinite",
          }}
        />
      )}
    </div>
  );
}
