"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { animate, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BJORK_PALETTE, type BjorkTone } from "@/components/bjork-ui/_core/palette";
import {
  dampingRatio,
  overshoot,
  settleTime,
  springAt,
  type SpringConfig,
} from "@/components/bjork-ui/_core/spring";
import { springs } from "@/components/bjork-ui/_core/motion";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import { useVisibleLoop } from "@/components/bjork-ui/_core/loop";

export type SpringTransition = { type: "spring" } & SpringConfig;

export interface SpringTunerRanges {
  stiffness: [number, number];
  damping: [number, number];
  mass: [number, number];
}

export interface SpringTunerProps {
  value?: SpringConfig;
  defaultValue?: SpringConfig;
  onChange?: (config: SpringConfig) => void;
  onCopy?: (code: string) => void;
  presets?: Record<string, SpringConfig>;
  ranges?: SpringTunerRanges;
  showCode?: boolean;
  /** How many previous configs to trace behind the current curve. Capped at 5. */
  ghosts?: number;
  /** Seeds the ghost traces, most recent first. Used for posed previews. */
  defaultGhosts?: SpringConfig[];
  /** Replaces the preview lane. Receives the current config as a framer-motion transition. */
  children?: (transition: SpringTransition) => ReactNode;
  tone?: BjorkTone;
  /** Cycles the presets every 2.5s until the user interacts. Ignored when `value` is controlled. */
  attract?: boolean;
  className?: string;
}

// Plot coordinates. The SVG is drawn in a 320 x 180 viewBox and scales to its column.
const VIEW_W = 320;
const VIEW_H = 180;
const PAD_X = 12;
const Y_ONE = VIEW_H * 0.3; // 1 sits 30% from the top
const Y_ZERO = VIEW_H - 12; // 0 sits 12px above the bottom
const SCALE_Y = Y_ZERO - Y_ONE; // viewBox px per unit of travel
const TOP_LIMIT = 6; // handle and curve stop 6px below the top edge of the plot
const SAMPLES = 120;
const MAX_GHOSTS = 5;
const GHOST_OPACITY = [0.5, 0.35, 0.25, 0.15, 0.08] as const;

const PUCK_TRAVEL = 140;
const LANE_START = 30; // marker centre, from the lane's left edge
const LANE_END = LANE_START + PUCK_TRAVEL;

const DEFAULT_CONFIG: SpringConfig = { stiffness: 300, damping: 30, mass: 0.8 };
const DEFAULT_RANGES: SpringTunerRanges = {
  stiffness: [50, 1000],
  damping: [5, 80],
  mass: [0.2, 3],
};
const DEFAULT_PRESETS: Record<string, SpringConfig> = {
  press: springs.press,
  snappy: springs.snappy,
  standard: springs.standard,
  soft: springs.soft,
  settle: springs.settle,
};

const ATTRACT_INTERVAL = 2.5;
const ATTRACT_IDLE_S = 4;

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function sameConfig(a: SpringConfig, b: SpringConfig) {
  return a.stiffness === b.stiffness && a.damping === b.damping && a.mass === b.mass;
}

function normalize(c: SpringConfig, ranges: SpringTunerRanges): SpringConfig {
  return {
    stiffness: clamp(Math.round(c.stiffness), ranges.stiffness[0], ranges.stiffness[1]),
    damping: clamp(Math.round(c.damping * 2) / 2, ranges.damping[0], ranges.damping[1]),
    mass: clamp(Math.round(c.mass * 100) / 100, ranges.mass[0], ranges.mass[1]),
  };
}

function trim(n: number) {
  return String(Number(n.toFixed(3)));
}

function formatTransition(c: SpringConfig) {
  return `{ type: "spring", stiffness: ${trim(c.stiffness)}, damping: ${trim(c.damping)}, mass: ${trim(c.mass)} }`;
}

function xOf(t: number, span: number) {
  return PAD_X + (t / span) * (VIEW_W - PAD_X * 2);
}

function tOf(x: number, span: number) {
  return ((x - PAD_X) / (VIEW_W - PAD_X * 2)) * span;
}

function yOf(v: number) {
  return Y_ZERO - v * SCALE_Y;
}

function tickStep(span: number) {
  if (span <= 2) return 0.1;
  if (span <= 6) return 0.5;
  return 1;
}

// Curve for a config over the shared time axis. `zone` is the area between the curve and y = 1 where it is above 1.
function curvePaths(c: SpringConfig, span: number) {
  const pts: { x: number; y: number; v: number }[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t = (i / (SAMPLES - 1)) * span;
    const v = springAt(t, c, 0, 1, 0);
    pts.push({ x: xOf(t, span), y: yOf(v), v });
  }
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  if (!pts.some((p) => p.v > 1)) return { line, zone: "" };
  const top = pts.map((p) => `${p.x.toFixed(2)} ${yOf(Math.max(p.v, 1)).toFixed(2)}`);
  const base = pts.map((p) => `${p.x.toFixed(2)} ${yOf(1).toFixed(2)}`).reverse();
  const zone = `M${top.join(" L")} L${base.join(" L")} Z`;
  return { line, zone };
}

const PARAMS = [
  { key: "stiffness", label: "stiffness" },
  { key: "damping", label: "damping" },
  { key: "mass", label: "mass" },
] as const;

// Token with a palette fallback, so the component keeps its tone outside the site.
function tok(name: string, fallback: string) {
  return `var(--bjork-${name}, ${fallback})`;
}

export function SpringTuner({
  value,
  defaultValue,
  onChange,
  onCopy,
  presets = DEFAULT_PRESETS,
  ranges = DEFAULT_RANGES,
  showCode = true,
  ghosts = MAX_GHOSTS,
  defaultGhosts,
  children,
  tone,
  attract = false,
  className,
}: SpringTunerProps) {
  const resolvedTone = useBjorkTone(tone);
  const p = BJORK_PALETTE[resolvedTone];
  const reduced = useReducedMotion();
  const idBase = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);

  const isControlled = value !== undefined;
  const [internal, setInternal] = useState<SpringConfig>(defaultValue ?? DEFAULT_CONFIG);
  const current = value ?? internal;
  const { stiffness, damping, mass } = current;

  const [history, setHistory] = useState<SpringConfig[]>(defaultGhosts ?? []);
  const [copied, setCopied] = useState(false);

  // Gesture bookkeeping. A gesture (one drag, one held key, one preset click) pushes its starting config
  // into the ghost history once, when it ends with a different config.
  const gestureStart = useRef<SpringConfig | null>(null);
  const latest = useRef<SpringConfig>(current);
  const inputSeen = useRef(false);
  const drag = useRef<{ left: number; top: number; width: number; height: number; span: number } | null>(null);

  const ghostCount = Math.min(Math.max(0, ghosts), MAX_GHOSTS);

  const settle = useMemo(
    () => settleTime({ stiffness, damping, mass }),
    [stiffness, damping, mass],
  );
  const zeta = dampingRatio(current);
  const os = overshoot(current);
  const underdamped = zeta < 1;
  const peakTime = underdamped
    ? Math.PI / (Math.sqrt(stiffness / mass) * Math.sqrt(1 - zeta * zeta))
    : settle;
  const peakValue = underdamped ? 1 + os : 1;
  // Spec: the axis covers 1.1 x settleTime. A peak can fall after the 0.1% settle band when its overshoot is
  // tiny, so the axis also covers the peak. Otherwise the handle would sit off the plot.
  const span = 1.1 * Math.max(settle, peakTime);

  const currentCurve = useMemo(() => curvePaths(current, span), [current, span]);
  const ghostLines = useMemo(
    () => history.slice(0, ghostCount).map((c) => curvePaths(c, span).line),
    [history, ghostCount, span],
  );
  const ticks = useMemo(() => {
    const step = tickStep(span);
    const out: number[] = [];
    for (let t = step; t < span - 1e-9; t += step) out.push(xOf(t, span));
    return out;
  }, [span]);

  const code = formatTransition(current);

  const markInput = () => {
    inputSeen.current = true;
  };

  const startGesture = (c: SpringConfig) => {
    if (gestureStart.current === null) {
      gestureStart.current = c;
      latest.current = c;
    }
  };

  const endGesture = () => {
    const start = gestureStart.current;
    gestureStart.current = null;
    if (start && !sameConfig(start, latest.current)) {
      setHistory((h) => [start, ...h].slice(0, MAX_GHOSTS));
    }
  };

  const commit = (next: SpringConfig) => {
    latest.current = next;
    if (!isControlled) setInternal(next);
    onChange?.(next);
  };

  // Puck: spring from end to end on every config change (120ms debounce). Each run alternates direction.
  const puckX = useMotionValue(0);
  const puckNext = useRef(PUCK_TRAVEL);
  const playPuck = useCallback(
    (c: SpringConfig) => {
      const to = puckNext.current;
      puckNext.current = to === PUCK_TRAVEL ? 0 : PUCK_TRAVEL;
      if (reduced) {
        puckX.set(to);
        return;
      }
      animate(puckX, to, {
        type: "spring",
        stiffness: c.stiffness,
        damping: c.damping,
        mass: c.mass,
        restDelta: 0.01,
        restSpeed: 0.01,
      });
    },
    [puckX, reduced],
  );

  useEffect(() => {
    const id = window.setTimeout(() => playPuck({ stiffness, damping, mass }), 120);
    return () => window.clearTimeout(id);
  }, [stiffness, damping, mass, playPuck]);

  // Attract: cycle the presets, paused while the user is interacting (4s idle to resume).
  const attractIndex = useRef(-1);
  const attractTime = useRef(0);
  const idleFor = useRef(ATTRACT_IDLE_S);
  const attractOn = attract && !reduced && !isControlled;
  useVisibleLoop(
    rootRef,
    (dt) => {
      if (inputSeen.current) {
        inputSeen.current = false;
        idleFor.current = 0;
      } else {
        idleFor.current += dt;
      }
      if (idleFor.current < ATTRACT_IDLE_S) {
        attractTime.current = 0;
        return true;
      }
      attractTime.current += dt;
      if (attractTime.current < ATTRACT_INTERVAL) return true;
      attractTime.current = 0;
      const keys = Object.keys(presets);
      if (keys.length === 0) return false;
      attractIndex.current = (attractIndex.current + 1) % keys.length;
      startGesture(current);
      commit({ ...presets[keys[attractIndex.current]] });
      endGesture();
      return true;
    },
    { enabled: attractOn },
  );

  // Plot drag. The pointer sets overshoot (y) and peak time (x). Stiffness and damping follow from them.
  const updateFromPointer = (clientX: number, clientY: number) => {
    const d = drag.current;
    if (!d) return;
    const vx = ((clientX - d.left) / d.width) * VIEW_W;
    const vy = ((clientY - d.top) / d.height) * VIEW_H;
    const yClamped = clamp(vy, TOP_LIMIT, Y_ZERO);
    const yValue = (Y_ZERO - yClamped) / SCALE_Y;
    const os = clamp(yValue - 1, 0.0005, 0.9);
    const lnOs = Math.log(os);
    const z = -lnOs / Math.sqrt(Math.PI * Math.PI + lnOs * lnOs);
    const tp = clamp(tOf(vx, d.span), 0.03, 2);
    const m = latest.current.mass;
    const wn = Math.PI / (tp * Math.sqrt(1 - z * z));
    const k = wn * wn * m;
    const dm = 2 * z * Math.sqrt(k * m);
    const next = normalize({ stiffness: k, damping: dm, mass: m }, ranges);
    if (!sameConfig(next, latest.current)) commit(next);
  };

  const onPlotPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const el = plotRef.current;
    if (!el) return;
    e.preventDefault();
    markInput();
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    drag.current = { left: r.left, top: r.top, width: r.width, height: r.height, span };
    startGesture(current);
    updateFromPointer(e.clientX, e.clientY);
  };

  const onPlotPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    updateFromPointer(e.clientX, e.clientY);
  };

  const onPlotPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    endGesture();
  };

  const onHandleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, [keyof SpringConfig, number]> = {
      ArrowUp: ["damping", 1],
      ArrowDown: ["damping", -1],
      ArrowRight: ["stiffness", 10],
      ArrowLeft: ["stiffness", -10],
    };
    const hit = step[e.key];
    if (!hit) return;
    e.preventDefault();
    markInput();
    startGesture(current);
    const [key, delta] = hit;
    const base = latest.current;
    const next = normalize({ ...base, [key]: base[key] + delta }, ranges);
    if (!sameConfig(next, base)) commit(next);
  };

  const onHandleKeyUp = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key.startsWith("Arrow")) endGesture();
  };

  const onRangeChange = (key: keyof SpringConfig) => (e: ChangeEvent<HTMLInputElement>) => {
    const base = latest.current;
    const next = normalize({ ...base, [key]: Number(e.target.value) }, ranges);
    if (!sameConfig(next, base)) commit(next);
  };

  const onPreset = (c: SpringConfig) => {
    markInput();
    startGesture(current);
    commit({ ...c });
    endGesture();
  };

  const onCopyClick = async () => {
    markInput();
    try {
      await navigator.clipboard.writeText(code);
      onCopy?.(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard is blocked or unavailable. Nothing to report.
    }
  };

  // Handle position, in plot percentages.
  const handleX = (xOf(peakTime, span) / VIEW_W) * 100;
  const handleY = (clamp(yOf(peakValue), TOP_LIMIT, Y_ZERO) / VIEW_H) * 100;
  const overshootPct = os * 100;
  const handleValueText = underdamped
    ? `overshoot ${overshootPct.toFixed(1)}%, peak ${Math.round(peakTime * 1000)}ms`
    : `overshoot 0.0%, settle ${Math.round(settle * 1000)}ms`;

  const values: Record<(typeof PARAMS)[number]["key"], number> = { stiffness, damping, mass };
  const transition: SpringTransition = { type: "spring", stiffness, damping, mass };
  const isPresetActive = (c: SpringConfig) => sameConfig(c, current);

  const textColor = tok("text", p.text);
  const textMedium = tok("text-medium", p.textMedium);
  const textMuted = tok("text-muted", p.textMuted);
  const textSoft = tok("text-soft", p.textSoft);
  const border = tok("border", p.border);
  const borderStrong = tok("border-strong", p.borderStrong);
  const accent = tok("accent", p.accent);
  const surface = tok("surface", p.surface);
  const panel = tok("panel", p.surface);

  const rangeVars = {
    "--sp-accent": accent,
    "--sp-surface": surface,
    "--sp-rail": borderStrong,
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      data-spring-tuner=""
      style={{
        ...rangeVars,
        background: panel,
        borderColor: border,
        boxShadow: tok("shadow-panel", "none"),
        color: textColor,
      }}
      className={cn(
        "@container relative flex w-[560px] max-w-full min-h-[300px] flex-col gap-3 rounded-[20px] border p-4 select-none",
        className,
      )}
    >
      <div className="grid gap-6 @[520px]:grid-cols-[304px_200px]">
        <div className="flex min-w-0 flex-col gap-2">
          <div
            ref={plotRef}
            onPointerDown={onPlotPointerDown}
            onPointerMove={onPlotPointerMove}
            onPointerUp={onPlotPointerEnd}
            onPointerCancel={onPlotPointerEnd}
            className="relative aspect-[320/180] w-full cursor-crosshair touch-none"
          >
            <svg
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              className="block h-full w-full overflow-hidden"
              aria-hidden="true"
              focusable="false"
            >
              {/* Hairlines: y = 0 solid, y = 1 dashed 2/3. y = 1 sits on a half pixel for crisp 1px rendering. */}
              <line x1={0} x2={VIEW_W} y1={Y_ZERO + 0.5} y2={Y_ZERO + 0.5} stroke={p.borderStrong} strokeWidth={1} />
              <line
                x1={0}
                x2={VIEW_W}
                y1={Y_ONE + 0.5}
                y2={Y_ONE + 0.5}
                stroke={p.textFaint}
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              {ticks.map((x) => (
                <line key={x} x1={x} x2={x} y1={Y_ZERO} y2={Y_ZERO + 4} stroke={p.textFaint} strokeWidth={1} />
              ))}
              {ghostLines.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke={p.textMuted}
                  strokeOpacity={GHOST_OPACITY[i]}
                  strokeWidth={1}
                />
              ))}
              {currentCurve.zone && <path d={currentCurve.zone} fill={p.accentSoft} />}
              <path d={currentCurve.line} fill="none" stroke={p.text} strokeWidth={1.75} strokeLinejoin="round" />
            </svg>

            <div
              role="slider"
              tabIndex={0}
              aria-label="Overshoot"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(overshootPct * 10) / 10}
              aria-valuetext={handleValueText}
              onKeyDown={onHandleKeyDown}
              onKeyUp={onHandleKeyUp}
              onBlur={endGesture}
              style={{ left: `${handleX}%`, top: `${handleY}%` }}
              className="absolute flex size-5 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--sp-surface)] active:cursor-grabbing"
            >
              <span
                aria-hidden="true"
                className="block size-2 rounded-full"
                style={{ background: accent, boxShadow: `0 0 0 2px ${surface}` }}
              />
            </div>
          </div>

          <p className="font-mono text-[11px] tabular-nums" style={{ color: textSoft }}>
            {`ζ ${zeta.toFixed(2)} · settle ${Math.round(settle * 1000)}ms · overshoot ${overshootPct.toFixed(1)}%`}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div role="group" aria-label="Presets" className="flex flex-wrap gap-1.5">
            {Object.entries(presets).map(([name, c]) => {
              const active = isPresetActive(c);
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onPreset(c)}
                  className="h-6 rounded-[7px] border px-2 font-mono text-[11px] transition-[transform,background-color,color] duration-[140ms] ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--sp-surface)]"
                  style={{
                    borderColor: active ? tok("accent-muted", p.accentMuted) : border,
                    background: active ? tok("accent-soft", p.accentSoft) : "transparent",
                    color: active ? p.accentInk : textMedium,
                  }}
                >
                  {name}
                </button>
              );
            })}
          </div>

          {typeof children === "function" ? (
            children(transition)
          ) : (
            <div className="flex flex-col gap-1">
              <div className="flex h-4 items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-[0.04em]" style={{ color: textMuted }}>
                  Preview
                </span>
                <button
                  type="button"
                  onClick={() => playPuck(current)}
                  className="font-mono text-[11px] rounded-[5px] px-1 transition-[transform] duration-[140ms] ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--sp-surface)]"
                  style={{ color: p.accentInk }}
                >
                  Play
                </button>
              </div>
              <div aria-hidden="true" className="relative h-10 w-full">
                <span
                  className="absolute top-1/2 h-px -translate-y-1/2"
                  style={{ left: LANE_START, width: PUCK_TRAVEL, background: p.hair }}
                />
                <span
                  className="absolute top-[17px] size-1.5 rounded-full"
                  style={{ left: LANE_START - 3, background: borderStrong }}
                />
                <span
                  className="absolute top-[17px] size-1.5 rounded-full"
                  style={{ left: LANE_END - 3, background: borderStrong }}
                />
                <motion.span
                  className="absolute left-[16px] top-[6px] size-7 rounded-full"
                  style={{ x: puckX, background: textColor }}
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {PARAMS.map(({ key, label }) => {
              const [lo, hi] = ranges[key];
              const v = values[key];
              const step = key === "damping" ? 0.5 : key === "mass" ? 0.01 : 1;
              const fill = ((v - lo) / (hi - lo)) * 100;
              const id = `${idBase}-${key}`;
              return (
                <div key={key} className="grid grid-cols-[64px_minmax(0,1fr)_48px] items-center gap-2">
                  <label
                    htmlFor={id}
                    className="font-mono text-[11px] uppercase tracking-[0.04em]"
                    style={{ color: textMuted }}
                  >
                    {label}
                  </label>
                  <input
                    id={id}
                    type="range"
                    min={lo}
                    max={hi}
                    step={step}
                    value={v}
                    aria-label={label[0].toUpperCase() + label.slice(1)}
                    aria-valuetext={`${trim(v)} ${label}`}
                    onChange={onRangeChange(key)}
                    onPointerDown={() => {
                      markInput();
                      startGesture(current);
                    }}
                    onPointerUp={endGesture}
                    onPointerCancel={endGesture}
                    onBlur={endGesture}
                    onKeyDown={() => {
                      markInput();
                      startGesture(current);
                    }}
                    onKeyUp={endGesture}
                    style={{
                      ["--fill" as string]: `${fill}%`,
                      background: `linear-gradient(to right, ${accent} var(--fill), ${borderStrong} var(--fill)) center / 100% 2px no-repeat`,
                    }}
                    className="h-3 w-full cursor-pointer appearance-none rounded-full bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--sp-surface)] [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[color:var(--sp-accent)] [&::-moz-range-thumb]:shadow-[0_0_0_2px_var(--sp-surface)] [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:h-3 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[color:var(--sp-accent)] [&::-webkit-slider-thumb]:shadow-[0_0_0_2px_var(--sp-surface)]"
                  />
                  <output
                    htmlFor={id}
                    className="text-right font-mono text-[12px] tabular-nums"
                    style={{ color: textColor }}
                  >
                    {trim(v)}
                  </output>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showCode && (
        <div
          className="mt-auto flex items-center justify-between gap-3 rounded-[10px] px-3 py-2"
          style={{ background: surface }}
        >
          <code className="min-w-0 break-words font-mono text-[12px] leading-5" style={{ color: textMedium }}>
            {code}
          </code>
          <button
            type="button"
            onClick={onCopyClick}
            className="h-7 shrink-0 rounded-[8px] border px-3 font-mono text-[11px] transition-[transform] duration-[140ms] ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--sp-surface)]"
            style={{ borderColor: border, color: textColor }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <LiveRegion message={copied ? "Copied" : ""} />
        </div>
      )}
    </div>
  );
}
