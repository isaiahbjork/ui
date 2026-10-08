"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControls,
} from "framer-motion";
import { cn } from "@/lib/utils";
import { BJORK_PALETTE, type BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import { isCoarsePointer, useVisibleLoop } from "@/components/bjork-ui/_core/loop";

export interface AdaptivePrecisionSliderProps {
  label: string;
  value?: number;
  defaultValue?: number;
  onValueChange?: (v: number) => void;
  onValueCommit?: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  precisionFalloff?: number;
  minGain?: number;
  showGain?: boolean;
  fineStep?: boolean;
  touchPrecision?: boolean;
  format?: (v: number) => string;
  marks?: { value: number; label?: string }[];
  disabled?: boolean;
  tone?: BjorkTone;
  attract?: boolean;
  /** Demo only. Forces the gain used for the band and the chip, so a preview can be posed mid-drag. */
  debugGain?: number;
  className?: string;
}

const GAIN_CHIP_BELOW = 0.95;
const DRIFT_DEAD_ZONE = 12; // px between the track centre and the start of the drift falloff
const TOUCH_FALLOFF = 64;
const MIN_TICK_PX = 4;
const BAND_REACH_PX = 80; // half of the widest band window, so every visible tick is computed
const TICK_COUNT = 51; // 0% to 100% every 2%, so the 50% tick is exact
const TICK_MAJOR_EVERY = 5; // every 10%
const KEY_SPRING = { type: "spring", stiffness: 700, damping: 45, mass: 0.4 } as const;
const ATTRACT_CYCLE_S = 4;
const ATTRACT_IDLE_MS = 4000;
const ATTRACT_DRIFT_PX = 72; // centre distance at the drift's end, so d = 60 after the dead zone
const BAND_MASK = "linear-gradient(90deg, transparent, #000 20%, #000 80%, transparent)";

type UiState = { raw: number; out: number; gain: number; dragging: boolean };

interface DragState {
  pointerId: number;
  lastX: number;
  centerY: number;
  width: number;
  gainOn: boolean;
  falloff: number;
}

// Token with a palette fallback, so the component keeps its tone outside the site.
function tok(name: string, fallback: string) {
  return `var(--bjork-${name}, ${fallback})`;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function decimalsOf(n: number) {
  const s = String(n);
  const i = s.indexOf(".");
  return i === -1 ? 0 : s.length - i - 1;
}

function fractionOf(v: number, min: number, max: number) {
  return max > min ? clamp((v - min) / (max - min), 0, 1) : 0;
}

// Clamp to [min, max], round to the step grid, and always allow max, even when the step does not divide the range.
function snapTo(raw: number, min: number, max: number, unit: number) {
  const c = clamp(raw, min, max);
  if (!(unit > 0)) return c;
  let r = min + Math.round((c - min) / unit) * unit;
  if (c >= max - unit / 2) r = max;
  r = clamp(r, min, max);
  return Number(r.toFixed(Math.min(10, Math.max(decimalsOf(unit), decimalsOf(min)))));
}

// g = minGain + (1 - minGain) * 2^(-d / falloff), where d is the distance past the dead zone.
function gainAt(distancePx: number, minGain: number, falloff: number) {
  const d = Math.max(0, distancePx - DRIFT_DEAD_ZONE);
  return minGain + (1 - minGain) * 2 ** (-d / falloff);
}

// Stride through 1, 2, 5, 10, 20, 50, ... until a tick is at least MIN_TICK_PX apart.
function tickStride(spacingPx: number) {
  const seq = [1, 2, 5];
  let k = 1;
  for (let i = 1; spacingPx * k < MIN_TICK_PX && i < 60; i++) {
    k = seq[i % 3] * 10 ** Math.floor(i / 3);
  }
  return k;
}

interface BandTick {
  m: number;
  px: number;
  major: boolean;
}

function bandTicks(base: number, min: number, max: number, unit: number, gain: number, pxPerUnit: number): BandTick[] {
  const k = tickStride((pxPerUnit * unit) / gain);
  const grid = unit * k;
  const reach = (BAND_REACH_PX * gain) / pxPerUnit;
  const lastIndex = Math.floor((max - min) / grid + 1e-9);
  const first = Math.max(0, Math.ceil((base - reach - min) / grid));
  const last = Math.min(lastIndex, Math.floor((base + reach - min) / grid));
  const ticks: BandTick[] = [];
  for (let m = first; m <= last; m++) {
    const v = min + m * grid;
    ticks.push({ m, px: ((v - base) * pxPerUnit) / gain, major: m % 10 === 0 });
  }
  return ticks;
}

// Idle demo pose by cycle time: sweep right on the track, drift away to 72px, small moves, return, rest.
function attractPose(p: number) {
  const ease = (u: number) => 1 - (1 - u) ** 3;
  if (p < 0.9) return { x: 0.35 * ease(p / 0.9), dist: 0, drag: true };
  if (p < 1.3) return { x: 0.35, dist: ATTRACT_DRIFT_PX * ease((p - 0.9) / 0.4), drag: true };
  if (p < 1.9) return { x: 0.35 + 0.06 * Math.sin(((p - 1.3) / 0.6) * Math.PI * 2), dist: ATTRACT_DRIFT_PX, drag: true };
  if (p < 2.4) {
    const e = ease((p - 1.9) / 0.5);
    return { x: 0.35 * (1 - e), dist: ATTRACT_DRIFT_PX * (1 - e), drag: true };
  }
  return { x: 0, dist: 0, drag: false };
}

function sameUi(a: UiState, b: UiState) {
  return a.raw === b.raw && a.out === b.out && a.gain === b.gain && a.dragging === b.dragging;
}

/**
 * A slider that gets finer the further the pointer drifts from the track.
 * Drag the thumb for a relative move, press the track to jump, then drift away to fine-tune.
 * Arrow keys step, Shift steps by ten, Alt steps by a tenth when `fineStep` is on.
 */
export function AdaptivePrecisionSlider({
  label,
  value,
  defaultValue,
  onValueChange,
  onValueCommit,
  min = 0,
  max = 100,
  step = 0.1,
  precisionFalloff = 48,
  minGain = 0.05,
  showGain = true,
  fineStep = true,
  touchPrecision = false,
  format,
  marks,
  disabled = false,
  tone,
  attract = false,
  debugGain,
  className,
}: AdaptivePrecisionSliderProps) {
  const resolvedTone = useBjorkTone(tone);
  const p = BJORK_PALETTE[resolvedTone];
  const reduced = !!useReducedMotion();
  const controlled = value !== undefined;
  const span = max - min;
  const unit = step > 0 ? step : span / 1000;
  const decimals = Math.max(decimalsOf(unit), decimalsOf(min));
  const fmt = format ?? ((v: number) => v.toFixed(decimals));
  const initial = snapTo(value ?? defaultValue ?? min, min, max, unit);

  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  // Live state for pointer and rAF code. Render reads `ui` only.
  const rawRef = useRef(initial);
  const outRef = useRef(initial);
  const gainRef = useRef(1);
  const activeRef = useRef(false);
  const dragRef = useRef<DragState | null>(null);
  const controlsRef = useRef<AnimationPlaybackControls | null>(null);
  const rafRef = useRef(0);
  const pausedRef = useRef(false);
  const resumeTimerRef = useRef<number | null>(null);
  const phaseRef = useRef(0);
  const baseRef = useRef(initial);

  const frac = useMotionValue(fractionOf(initial, min, max));
  const [trackW, setTrackW] = useState(0);
  // Position by transform, not layout. Thumb and band move with x, and the fill scales.
  const trackWMV = useMotionValue(0);
  const thumbX = useTransform([frac, trackWMV], ([f, w]: number[]) => f * w);
  const [ui, setUi] = useState<UiState>({ raw: initial, out: initial, gain: 1, dragging: false });
  const shown = value !== undefined && !ui.dragging ? snapTo(value, min, max, unit) : ui.out;

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setTrackW(entry.contentRect.width);
      trackWMV.set(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [trackWMV]);

  // `grid` is the step the value lands on. Fine keyboard steps pass a finer grid.
  const emit = (raw: number, grid = unit) => {
    const out = snapTo(raw, min, max, grid);
    if (out === outRef.current) return;
    outRef.current = out;
    onValueChange?.(out);
  };

  const moveFrac = useCallback(
    (to: number, spring: boolean) => {
      controlsRef.current?.stop();
      controlsRef.current = null;
      if (spring && !reduced) controlsRef.current = animate(frac, to, KEY_SPRING);
      else frac.set(to);
    },
    [frac, reduced],
  );

  const scheduleRender = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const next: UiState = {
        raw: rawRef.current,
        out: outRef.current,
        gain: gainRef.current,
        dragging: activeRef.current,
      };
      setUi((prev) => (sameUi(prev, next) ? prev : next));
    });
  }, []);

  // Idle demo. Uncontrolled only, because it writes the value itself.
  const attractOn = attract && !reduced && !controlled;
  const loop = useVisibleLoop(
    rootRef,
    (dt) => {
      if (pausedRef.current) return false;
      phaseRef.current = (phaseRef.current + dt) % ATTRACT_CYCLE_S;
      const pose = attractPose(phaseRef.current);
      const raw = clamp(baseRef.current + pose.x * span, min, max);
      rawRef.current = raw;
      activeRef.current = pose.drag;
      gainRef.current = pose.dist > 0 ? gainAt(pose.dist, minGain, precisionFalloff) : 1;
      moveFrac(fractionOf(raw, min, max), false);
      emit(raw);
      scheduleRender();
      return true;
    },
    { enabled: attractOn },
  );

  const noteInput = () => {
    pausedRef.current = true;
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  };

  const scheduleResume = () => {
    if (!pausedRef.current || dragRef.current) return;
    if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = window.setTimeout(() => {
      resumeTimerRef.current = null;
      if (dragRef.current) return;
      pausedRef.current = false;
      phaseRef.current = 0;
      baseRef.current = rawRef.current;
      activeRef.current = false;
      scheduleRender();
      loop.wake();
    }, ATTRACT_IDLE_MS);
  };

  // Follow the controlled value only. Reacting to `shown` wrote stale values back during attract and drags.
  useEffect(() => {
    if (value === undefined) return;
    const v = snapTo(value, min, max, unit);
    if (dragRef.current || v === outRef.current) return;
    outRef.current = v;
    rawRef.current = v;
    moveFrac(fractionOf(v, min, max), true);
  }, [value, min, max, unit, moveFrac]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current);
      controlsRef.current?.stop();
    };
  }, []);

  const endDrag = (pointerId: number) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== pointerId) return;
    dragRef.current = null;
    activeRef.current = false;
    gainRef.current = 1;
    onValueCommit?.(outRef.current);
    scheduleRender();
    scheduleResume();
  };

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (disabled || e.button !== 0 || !track) return;
    const rect = track.getBoundingClientRect();
    if (!(rect.width > 0) || span <= 0) return;
    const coarse = isCoarsePointer();
    const onThumb = thumbRef.current?.contains(e.target as Node) ?? false;
    if (!onThumb) {
      // Track press: jump to the point, then the drag continues relatively from there.
      const raw = clamp(min + ((e.clientX - rect.left) / rect.width) * span, min, max);
      rawRef.current = raw;
      emit(raw);
      moveFrac(fractionOf(raw, min, max), true);
    }
    activeRef.current = true;
    dragRef.current = {
      pointerId: e.pointerId,
      lastX: e.clientX,
      centerY: rect.top + rect.height / 2,
      width: rect.width,
      gainOn: !coarse || touchPrecision,
      falloff: coarse ? TOUCH_FALLOFF : precisionFalloff,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    scheduleRender();
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const g = drag.gainOn ? gainAt(Math.abs(e.clientY - drag.centerY), minGain, drag.falloff) : 1;
    const dx = e.clientX - drag.lastX;
    drag.lastX = e.clientX;
    const pxPerUnit = drag.width / span;
    const raw = clamp(rawRef.current + (dx / pxPerUnit) * g, min, max);
    rawRef.current = raw;
    gainRef.current = g;
    moveFrac(fractionOf(raw, min, max), false);
    emit(raw);
    scheduleRender();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    noteInput();
    if (disabled) return;
    const fine = e.altKey && fineStep;
    const delta = fine ? unit / 10 : e.shiftKey ? unit * 10 : unit;
    const snapUnit = fine ? unit / 10 : unit;
    const base = outRef.current;
    let target: number;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        target = base + delta;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        target = base - delta;
        break;
      case "PageUp":
        target = base + span / 10;
        break;
      case "PageDown":
        target = base - span / 10;
        break;
      case "Home":
        target = min;
        break;
      case "End":
        target = max;
        break;
      default:
        return;
    }
    e.preventDefault();
    const next = snapTo(target, min, max, snapUnit);
    rawRef.current = next;
    emit(next, snapUnit);
    moveFrac(fractionOf(next, min, max), true);
    scheduleRender();
  };

  // Render values. Live gesture values come from `ui`, and posed `debugGain` overrides them.
  const engaged = debugGain !== undefined || ui.dragging;
  const effGain = debugGain ?? ui.gain;
  const bandOpacity = engaged ? clamp((1 - effGain) / 0.5, 0, 1) : 0;
  const chipOn = showGain && engaged && effGain < GAIN_CHIP_BELOW;
  const pxPerUnit = trackW > 0 && span > 0 ? trackW / span : 0;
  const tickBase = ui.dragging ? ui.raw : shown;
  const ticks = bandOpacity > 0 && pxPerUnit > 0 ? bandTicks(tickBase, min, max, unit, effGain, pxPerUnit) : [];
  const readout = fmt(shown);
  const valueText = chipOn ? `${readout}, fine, ${effGain.toFixed(2)}× gain` : readout;
  const bandMotion = ui.dragging ? "" : "transition-opacity duration-[120ms] motion-reduce:transition-none";

  const accent = tok("accent", p.accent);
  const textSoft = tok("text-soft", p.textSoft);
  const textFaint = tok("text-faint", p.textFaint);
  const borderStrong = tok("border-strong", p.borderStrong);
  const surface = tok("surface", p.surface);
  const shadow = resolvedTone === "light" ? "0 1px 2px rgba(66,52,33,0.14)" : "0 1px 2px rgba(0,0,0,0.5)";
  const shadowToken = tok("shadow-surface", shadow);

  return (
    <div
      ref={rootRef}
      onPointerDownCapture={noteInput}
      onPointerUp={scheduleResume}
      onPointerCancel={scheduleResume}
      onKeyUp={scheduleResume}
      className={cn(
        "relative w-full min-w-0 select-none px-[12px] font-bjork-alpha transition-opacity duration-[120ms] motion-reduce:transition-none",
        disabled && "opacity-[0.45]",
        className,
      )}
    >
      {/* Row 1: label, gain chip, readout */}
      <div className="flex h-[18px] items-center justify-between gap-3">
        <span className="truncate text-[12px] font-medium" style={{ color: tok("text-medium", p.textMedium) }}>
          {label}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <span
            aria-hidden
            className={cn(
              "rounded-[6px] px-[6px] py-[2px] font-mono text-[10px] leading-none tabular-nums transition-opacity duration-[120ms] motion-reduce:transition-none",
              chipOn ? "opacity-100" : "opacity-0",
            )}
            style={{ color: tok("accent-ink", p.accentInk), background: tok("accent-soft", p.accentSoft) }}
          >
            {`${effGain.toFixed(2)}×`}
          </span>
          <span className="font-mono text-[13px] leading-none tabular-nums" style={{ color: tok("text", p.text) }}>
            {readout}
          </span>
        </div>
      </div>

      {/* Row 2: precision band, a 120 to 160px window centred on the thumb */}
      <div className="relative mt-[2px] h-[24px]" aria-hidden>
        <motion.div
          className={cn("absolute top-0 h-[24px] w-[120px] -translate-x-1/2 overflow-hidden sm:w-[160px]", bandMotion)}
          style={{
            left: 0,
            x: thumbX,
            opacity: bandOpacity,
            maskImage: BAND_MASK,
            WebkitMaskImage: BAND_MASK,
          }}
        >
          {ticks.map((t) => (
            <span
              key={t.m}
              className="absolute bottom-0 w-px -translate-x-1/2"
              style={{
                left: `calc(50% + ${t.px.toFixed(2)}px)`,
                height: t.major ? 12 : 6,
                background: textSoft,
              }}
            />
          ))}
          <span
            className="absolute left-1/2 top-0 h-[24px] w-[2px] -translate-x-1/2"
            style={{ background: accent }}
          />
        </motion.div>
      </div>

      {/* Row 3: hairline track and thumb. The whole row is the pointer target. */}
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => endDrag(e.pointerId)}
        onPointerCancel={(e) => endDrag(e.pointerId)}
        onLostPointerCapture={(e) => endDrag(e.pointerId)}
        className="relative mt-[2px] h-[20px] touch-none cursor-ew-resize"
      >
        <span
          className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full"
          style={{ background: borderStrong }}
        />
        <motion.span
          className="absolute left-0 top-1/2 h-[2px] w-full origin-left -translate-y-1/2 rounded-full"
          style={{ scaleX: frac, background: accent }}
        />
        <motion.div
          ref={thumbRef}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={label}
          aria-orientation="horizontal"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={shown}
          aria-valuetext={valueText}
          aria-disabled={disabled || undefined}
          onKeyDown={handleKeyDown}
          className="absolute top-1/2 size-[20px] -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bjork-ring-offset)]"
          style={{
            left: 0,
            x: thumbX,
            background: surface,
            borderColor: borderStrong,
          }}
        >
          {/* Shadow lives on its own layer, so the focus ring on the thumb is not overridden. */}
          <span aria-hidden className="absolute inset-0 rounded-full" style={{ boxShadow: shadowToken }} />
          <span
            className="absolute left-1/2 top-1/2 size-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: accent }}
          />
        </motion.div>
      </div>

      {/* Row 4: ticks every 2%, majors every 10%, optional mark labels */}
      <div className="relative mt-[2px] h-[8px]" aria-hidden>
        {Array.from({ length: TICK_COUNT }, (_, i) => {
          const major = i % TICK_MAJOR_EVERY === 0;
          return (
            <span
              key={i}
              className="absolute bottom-0 w-px -translate-x-1/2"
              style={{
                left: `${i * 2}%`,
                height: major ? 8 : 4,
                background: major ? textSoft : textFaint,
              }}
            />
          );
        })}
        {marks?.map((m) =>
          m.label ? (
            <span
              key={`${m.value}-${m.label}`}
              className="absolute top-full mt-[4px] -translate-x-1/2 whitespace-nowrap font-mono text-[10px] leading-none"
              style={{ left: `${fractionOf(m.value, min, max) * 100}%`, color: textFaint }}
            >
              {m.label}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}
