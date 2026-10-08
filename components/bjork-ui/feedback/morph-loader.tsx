"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BJORK_PALETTE, type BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import { VisuallyHidden } from "@/components/bjork-ui/_core/a11y";
import { cubicBezier, ease, easeCss } from "@/components/bjork-ui/_core/motion";
import { resamplePath } from "@/components/bjork-ui/_core/path";
import { useVisibleLoop } from "@/components/bjork-ui/_core/loop";

export type MorphState = "loading" | "done" | "error" | "idle";
export type MorphTarget = "check" | "cross" | "arrow-down" | "spark" | (string & {});

export const morphTargets: Record<"check" | "cross" | "arrow-down" | "spark", string> = {
  check: "M5 12.5 L10 17.5 L19 7",
  cross: "M6.5 6.5 L17.5 17.5 M17.5 6.5 L6.5 17.5",
  "arrow-down": "M12 4.5 V18.5 M6.5 13 L12 18.5 L17.5 13",
  spark: "M12 3 L13.8 10.2 L21 12 L13.8 13.8 L12 21 L10.2 13.8 L3 12 L10.2 10.2 Z",
};

export interface MorphLoaderProps {
  state: MorphState;
  target?: MorphTarget;
  size?: number;
  segments?: number;
  speedMs?: number;
  strokeWidth?: number;
  color?: string;
  doneColor?: string;
  errorColor?: string;
  labels?: Partial<Record<MorphState, string>>;
  onMorphComplete?: () => void;
  tone?: BjorkTone;
  attract?: boolean;
  /** Static morph frame, 0 to 1, from the ring to the done or error glyph. Turns the rotation off. */
  progress?: number;
  className?: string;
}

// Geometry in the 24-unit box. Each segment is an open polyline of POINTS samples.
const VIEW = 24;
const CENTRE = 12;
const RING_RADIUS = 9.2;
const RING_SPAN = 0.62;
const POINTS = 8;
const MORPH_MS = 560;
const STAGGER_MS = 18;
const REVERSE_MS = 400;
const DONE_WIDTH = 1.1;
const SHAKE_PX = [0, -3, 3, -2, 2, 0];
const SHAKE_MS = 360;
const FADE_MS = 80;
const LOADING_REDUCED_OPACITY = 0.6;
const ATTRACT_LOADING_MS = 1600;
const ATTRACT_FINAL_MS = 1200;
const ATTRACT_RESUME_MS = 4000;
const DOTS: ReadonlyArray<readonly [number, number]> = [
  [8, 12],
  [12, 12],
  [16, 12],
];
const DEFAULT_LABELS: Record<MorphState, string> = {
  loading: "Loading",
  done: "Done",
  error: "Failed",
  idle: "",
};
// OPTICAL-ALIGNMENT: the check's centroid sits low-left, so the check target is nudged
// 0.3px right and 0.4px up (24-unit space). Checked with the blur test.
const CHECK_NUDGE_X = 0.3;
const CHECK_NUDGE_Y = -0.4;

// One shared keyframe for every loader. It is injected once into <head>, not into the component's markup.
const SPIN_NAME = "morph-loader-spin";
function ensureSpinKeyframes() {
  if (typeof document === "undefined" || document.getElementById(SPIN_NAME)) return;
  const style = document.createElement("style");
  style.id = SPIN_NAME;
  style.textContent = `@keyframes ${SPIN_NAME}{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`;
  document.head.appendChild(style);
}

const morphEase = cubicBezier(...ease.inOut);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const fmt = (v: number) => (Math.round(v * 100) / 100).toString();

function tailOpacity(i: number, n: number): number {
  return 0.22 + 0.78 * (n === 1 ? 1 : i / (n - 1));
}

function ringPoints(n: number): Float32Array {
  const out = new Float32Array(n * POINTS * 2);
  const step = 360 / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < POINTS; j++) {
      const rad = ((i * step + (j / (POINTS - 1)) * step * RING_SPAN) * Math.PI) / 180;
      const at = (i * POINTS + j) * 2;
      out[at] = CENTRE + RING_RADIUS * Math.cos(rad);
      out[at + 1] = CENTRE + RING_RADIUS * Math.sin(rad);
    }
  }
  return out;
}

function dotPoints(n: number): Float32Array {
  const out = new Float32Array(n * POINTS * 2);
  for (let i = 0; i < n; i++) {
    const [x, y] = i < DOTS.length ? DOTS[i] : [CENTRE, CENTRE];
    for (let j = 0; j < POINTS; j++) {
      const at = (i * POINTS + j) * 2;
      out[at] = x;
      out[at + 1] = y;
    }
  }
  return out;
}

function segmentD(pts: Float32Array, seg: number): string {
  let d = "";
  for (let j = 0; j < POINTS; j++) {
    const at = (seg * POINTS + j) * 2;
    d += `${j === 0 ? "M" : " L"}${fmt(pts[at])} ${fmt(pts[at + 1])}`;
  }
  return d;
}

function polylineLength(pts: Float32Array): number {
  let len = 0;
  for (let i = 2; i < pts.length; i += 2) {
    len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  }
  return len;
}

function subpaths(d: string): string[] {
  return d
    .split(/(?=[Mm])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Splits n segments across subpaths in proportion to length, keeping at least one each.
function allocateSegments(lengths: number[], n: number): number[] {
  const total = lengths.reduce((a, b) => a + b, 0);
  const exact = lengths.map((l) => (n * l) / total);
  const counts = exact.map((x) => Math.max(1, Math.round(x)));
  let sum = counts.reduce((a, b) => a + b, 0);
  while (sum > n) {
    let best = -1;
    let bestOver = -Infinity;
    counts.forEach((c, i) => {
      if (c > 1 && c - exact[i] > bestOver) {
        bestOver = c - exact[i];
        best = i;
      }
    });
    if (best < 0) break;
    counts[best] -= 1;
    sum -= 1;
  }
  while (sum < n) {
    let best = 0;
    let bestUnder = -Infinity;
    counts.forEach((c, i) => {
      if (exact[i] - c > bestUnder) {
        bestUnder = exact[i] - c;
        best = i;
      }
    });
    counts[best] += 1;
    sum += 1;
  }
  return counts;
}

// Resamples a path into n segments of POINTS samples by arc length. Returns null for an invalid path.
function buildTarget(d: string, n: number): Float32Array | null {
  const parts = subpaths(d);
  if (parts.length === 0) return null;
  const lengths = parts.map((part) => polylineLength(resamplePath(part, 64)));
  const total = lengths.reduce((a, b) => a + b, 0);
  if (!(total > 1e-6)) return null;
  const counts = parts.length === 1 ? [n] : allocateSegments(lengths, n);
  if (counts.reduce((a, b) => a + b, 0) !== n) return null;
  const out = new Float32Array(n * POINTS * 2);
  let seg = 0;
  parts.forEach((part, idx) => {
    out.set(resamplePath(part, counts[idx] * POINTS), seg * POINTS * 2);
    seg += counts[idx];
  });
  return out;
}

function resolveTarget(target: MorphTarget, n: number): Float32Array {
  const isKey = Object.prototype.hasOwnProperty.call(morphTargets, target);
  let d = isKey ? morphTargets[target as keyof typeof morphTargets] : target;
  let pts = buildTarget(d, n);
  if (!pts) {
    if (process.env.NODE_ENV !== "production" && typeof document !== "undefined") {
      console.warn(`MorphLoader: "${target}" is not a valid path. Using "check".`);
    }
    d = morphTargets.check;
    pts = buildTarget(d, n) ?? new Float32Array(n * POINTS * 2);
  }
  if (d === morphTargets.check) {
    for (let at = 0; at < pts.length; at += 2) {
      pts[at] += CHECK_NUDGE_X;
      pts[at + 1] += CHECK_NUDGE_Y;
    }
  }
  return pts;
}

function mixColor(from: string, to: string, p: number): string {
  if (p <= 0) return from;
  if (p >= 1) return to;
  return `color-mix(in srgb, ${to} ${(p * 100).toFixed(1)}%, ${from})`;
}

interface EngineOptions {
  size: number;
  strokeWidth: number;
  colorLoading: string;
  colorDone: string;
  colorError: string;
  speedMs: number;
  kf: string;
  reduced: boolean;
}

interface Tween {
  t0: number;
  dur: number;
  stagger: number;
  from: Float32Array;
  fromOp: Float32Array;
  fromW: number;
  fromColor: string;
  to: Float32Array;
  toOp: Float32Array;
  toW: number;
  toColor: string;
  onDone?: () => void;
}

const DEFAULT_OPTIONS: EngineOptions = {
  size: 40,
  strokeWidth: 2.25,
  colorLoading: "currentColor",
  colorDone: "currentColor",
  colorError: "#ff5c4d",
  speedMs: 900,
  kf: "morph-loader-spin",
  reduced: false,
};

// Owns the segment points and runs every tween on one rAF loop. React only sets props and effects.
class MorphEngine {
  group: SVGGElement | null = null;
  n = 0;
  logical: MorphState | null = null;
  posed = false;
  private ring: Float32Array = new Float32Array(0);
  private tail: Float32Array = new Float32Array(0);
  private ones: Float32Array = new Float32Array(0);
  private dots: Float32Array = new Float32Array(0);
  private dotsOp: Float32Array = new Float32Array(0);
  private target: Float32Array = new Float32Array(0);
  private cross: Float32Array = new Float32Array(0);
  private cur: Float32Array = new Float32Array(0);
  private op: Float32Array = new Float32Array(0);
  private width = DEFAULT_OPTIONS.strokeWidth;
  private shownColor = "currentColor";
  private tween: Tween | null = null;
  private rotating = false;
  private rotStart = 0;
  private fade: Animation | null = null;
  private opts: EngineOptions = DEFAULT_OPTIONS;

  attach(group: SVGGElement | null) {
    this.group = group;
  }

  setOptions(opts: EngineOptions) {
    this.opts = opts;
  }

  setGeometry(n: number, target: MorphTarget) {
    if (n !== this.n) {
      this.n = n;
      this.ring = ringPoints(n);
      this.tail = new Float32Array(n);
      this.ones = new Float32Array(n).fill(1);
      this.dots = dotPoints(n);
      this.dotsOp = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        this.tail[i] = tailOpacity(i, n);
        this.dotsOp[i] = i < DOTS.length ? 1 : 0;
      }
      this.cur = new Float32Array(n * POINTS * 2);
      this.op = new Float32Array(n);
      this.cross = resolveTarget("cross", n);
    }
    this.target = resolveTarget(target, n);
  }

  // Sets the posed state at once, with no tween.
  snap(state: MorphState) {
    this.tween = null;
    this.posed = false;
    this.stopRotation();
    this.logical = state;
    const o = this.opts;
    if (state === "loading") {
      this.cur.set(this.ring);
      this.op.set(this.tail);
      this.width = o.strokeWidth;
      this.shownColor = o.colorLoading;
    } else if (state === "done") {
      this.cur.set(this.target);
      this.op.set(this.ones);
      this.width = o.strokeWidth * DONE_WIDTH;
      this.shownColor = o.colorDone;
    } else if (state === "error") {
      this.cur.set(this.cross);
      this.op.set(this.ones);
      this.width = o.strokeWidth;
      this.shownColor = o.colorError;
    } else {
      this.cur.set(this.dots);
      this.op.set(this.dotsOp);
      this.width = o.strokeWidth;
      this.shownColor = o.colorLoading;
    }
    if (this.group) {
      this.group.style.opacity = o.reduced && state === "loading" ? String(LOADING_REDUCED_OPACITY) : "1";
    }
    if (state === "loading") this.startRotation();
    this.paint();
  }

  // Moves to a state with the morph. Reduced motion crossfades instead.
  go(state: MorphState, complete?: () => void) {
    if (this.logical === null || this.posed) {
      this.snap(state);
      return;
    }
    if (this.logical === state) return;
    this.logical = state;
    const o = this.opts;
    if (state === "loading") {
      this.morph(this.ring, this.tail, o.strokeWidth, o.colorLoading, REVERSE_MS, () => this.startRotation());
    } else if (state === "idle") {
      this.morph(this.dots, this.dotsOp, o.strokeWidth, o.colorLoading, MORPH_MS);
    } else if (state === "done") {
      this.morph(this.target, this.ones, o.strokeWidth * DONE_WIDTH, o.colorDone, MORPH_MS, complete);
    } else {
      this.morph(this.cross, this.ones, o.strokeWidth, o.colorError, MORPH_MS, complete);
      this.shake();
    }
  }

  // Re-runs the done morph to a new target from the points on screen.
  retarget(complete?: () => void) {
    const o = this.opts;
    this.morph(this.target, this.ones, o.strokeWidth * DONE_WIDTH, o.colorDone, MORPH_MS, complete);
  }

  // A static frame between the ring (0) and the done or error glyph (1).
  pose(state: MorphState, p: number) {
    this.tween = null;
    this.stopRotation();
    const o = this.opts;
    const done = state === "done";
    const fin = done ? this.target : this.cross;
    const finW = done ? o.strokeWidth * DONE_WIDTH : o.strokeWidth;
    const finColor = done ? o.colorDone : o.colorError;
    const total = MORPH_MS + STAGGER_MS * (this.n - 1);
    for (let i = 0; i < this.n; i++) {
      const q = morphEase(clamp01((p * total - STAGGER_MS * i) / MORPH_MS));
      this.op[i] = lerp(this.tail[i], 1, q);
      for (let j = 0; j < POINTS; j++) {
        const at = (i * POINTS + j) * 2;
        this.cur[at] = lerp(this.ring[at], fin[at], q);
        this.cur[at + 1] = lerp(this.ring[at + 1], fin[at + 1], q);
      }
    }
    const g = morphEase(clamp01(p));
    this.width = lerp(o.strokeWidth, finW, g);
    this.shownColor = mixColor(o.colorLoading, finColor, g);
    this.posed = true;
    this.logical = state;
    if (this.group) this.group.style.opacity = "1";
    this.paint();
  }

  // Reduced motion: fade out, swap the state, fade in (80ms each).
  fadeTo(state: MorphState) {
    const g = this.group;
    if (!g || this.logical === null || this.posed) {
      this.snap(state);
      return;
    }
    if (this.logical === state) return;
    this.fade?.cancel();
    const from = Number(g.style.opacity || 1);
    const out = g.animate([{ opacity: from }, { opacity: 0 }], { duration: FADE_MS, easing: "ease-out" });
    this.fade = out;
    out.onfinish = () => {
      this.snap(state);
      this.fade = g.animate([{ opacity: 0 }, { opacity: Number(g.style.opacity || 1) }], {
        duration: FADE_MS,
        easing: "ease-out",
      });
    };
  }

  // Returns true while a tween is running.
  tickTween(now: number): boolean {
    const tw = this.tween;
    if (!tw) return false;
    const t = now - tw.t0;
    const total = tw.dur + tw.stagger * (this.n - 1);
    if (t >= total) {
      this.finish(tw);
      return false;
    }
    for (let i = 0; i < this.n; i++) {
      const e = morphEase(clamp01((t - tw.stagger * i) / tw.dur));
      this.op[i] = lerp(tw.fromOp[i], tw.toOp[i], e);
      for (let j = 0; j < POINTS; j++) {
        const at = (i * POINTS + j) * 2;
        this.cur[at] = lerp(tw.from[at], tw.to[at], e);
        this.cur[at + 1] = lerp(tw.from[at + 1], tw.to[at + 1], e);
      }
    }
    const g = morphEase(clamp01(t / tw.dur));
    this.width = lerp(tw.fromW, tw.toW, g);
    this.shownColor = mixColor(tw.fromColor, tw.toColor, g);
    this.paint();
    return true;
  }

  private finish(tw: Tween) {
    this.tween = null;
    this.cur.set(tw.to);
    this.op.set(tw.toOp);
    this.width = tw.toW;
    this.shownColor = tw.toColor;
    this.paint();
    tw.onDone?.();
  }

  private morph(
    fin: Float32Array,
    finOp: Float32Array,
    finW: number,
    finColor: string,
    dur: number,
    onDone?: () => void,
  ) {
    this.bake();
    this.posed = false;
    this.tween = {
      t0: performance.now(),
      dur,
      stagger: STAGGER_MS,
      from: this.cur.slice(),
      fromOp: this.op.slice(),
      fromW: this.width,
      fromColor: this.shownColor,
      to: fin,
      toOp: finOp,
      toW: finW,
      toColor: finColor,
      onDone,
    };
  }

  private startRotation() {
    const g = this.group;
    if (!g || this.opts.reduced) return;
    g.style.animation = `${this.opts.kf} ${this.opts.speedMs}ms linear infinite`;
    this.rotating = true;
    this.rotStart = performance.now();
  }

  private stopRotation() {
    if (this.group) this.group.style.animation = "none";
    this.rotating = false;
  }

  // Freezes the spin: bakes the current angle into the points and removes the CSS animation in the same task.
  private bake() {
    const g = this.group;
    if (!this.rotating || !g) return;
    const angle = this.currentAngle();
    this.stopRotation();
    const rad = (angle * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    for (let at = 0; at < this.cur.length; at += 2) {
      const dx = this.cur[at] - CENTRE;
      const dy = this.cur[at + 1] - CENTRE;
      this.cur[at] = CENTRE + dx * c - dy * s;
      this.cur[at + 1] = CENTRE + dx * s + dy * c;
    }
  }

  private currentAngle(): number {
    const speed = this.opts.speedMs;
    const anim = this.group
      ?.getAnimations()
      .find((a) => (a as CSSAnimation).animationName === this.opts.kf) as CSSAnimation | undefined;
    const ms = anim && typeof anim.currentTime === "number" ? anim.currentTime : performance.now() - this.rotStart;
    return ((((ms % speed) + speed) % speed) / speed) * 360;
  }

  private shake() {
    const g = this.group;
    if (!g || this.opts.reduced) return;
    const unit = VIEW / this.opts.size;
    g.animate(
      SHAKE_PX.map((px) => ({ transform: `translateX(${fmt(px * unit)}px)` })),
      { duration: SHAKE_MS, easing: easeCss.out },
    );
  }

  private paint() {
    const g = this.group;
    if (!g) return;
    const kids = g.children;
    for (let i = 0; i < this.n && i < kids.length; i++) {
      const el = kids[i];
      el.setAttribute("d", segmentD(this.cur, i));
      el.setAttribute("opacity", this.op[i].toFixed(3));
    }
    g.setAttribute("stroke-width", this.width.toFixed(3));
    g.style.stroke = this.shownColor;
  }
}

export function MorphLoader({
  state,
  target = "check",
  size = 40,
  segments = 10,
  speedMs = 900,
  strokeWidth = 2.25,
  color,
  doneColor,
  errorColor,
  labels,
  onMorphComplete,
  tone,
  attract = false,
  progress,
  className,
}: MorphLoaderProps) {
  const resolvedTone = useBjorkTone(tone);
  const reduced = useReducedMotion() ?? false;
  const kf = SPIN_NAME;
  const n = size < 20 ? 8 : Math.max(3, Math.round(segments));
  const colorLoading = color ?? "currentColor";
  const colorDone = doneColor ?? "currentColor";
  const colorError = errorColor ?? BJORK_PALETTE[resolvedTone].error;
  const driven = attract && !reduced;

  const [engine] = useState(() => new MorphEngine());
  const [attractState, setAttractState] = useState<MorphState>("loading");
  const shown: MorphState = driven ? attractState : state;
  const rootRef = useRef<HTMLSpanElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const completeRef = useRef(onMorphComplete);
  const attractRef = useRef({ on: false, state: "loading" as MorphState, cycle: 1, clock: 0, paused: false, lastInput: 0 });

  const ringD = useMemo(() => {
    const pts = ringPoints(n);
    return Array.from({ length: n }, (_, i) => segmentD(pts, i));
  }, [n]);

  const { wake } = useVisibleLoop(
    rootRef,
    (dt) => {
      let busy = engine.tickTween(performance.now());
      const a = attractRef.current;
      if (a.on) {
        busy = true;
        if (a.paused && performance.now() - a.lastInput >= ATTRACT_RESUME_MS) a.paused = false;
        if (!a.paused) {
          a.clock += dt * 1000;
          const limit = a.state === "loading" ? ATTRACT_LOADING_MS : ATTRACT_FINAL_MS;
          if (a.clock >= limit) {
            a.clock -= limit;
            if (a.state === "loading") {
              a.state = a.cycle % 3 === 0 ? "error" : "done";
            } else {
              a.cycle += 1;
              a.state = "loading";
            }
            setAttractState(a.state);
          }
        }
      }
      return busy;
    },
    { enabled: true },
  );

  // Keep the engine in step with the latest props on every render.
  useLayoutEffect(() => {
    ensureSpinKeyframes();
    engine.attach(groupRef.current);
    engine.setOptions({
      size,
      strokeWidth,
      colorLoading,
      colorDone,
      colorError,
      speedMs,
      kf,
      reduced,
    });
  });

  useLayoutEffect(() => {
    completeRef.current = onMorphComplete;
  });

  // Geometry. A new segment count re-snaps. A new target morphs when the component is done.
  useLayoutEffect(() => {
    const complete = () => completeRef.current?.();
    const nChanged = engine.n !== n;
    engine.setGeometry(n, target);
    if (engine.logical === null) return;
    if (nChanged) {
      engine.snap(engine.logical);
      return;
    }
    if (engine.logical === "done" && !engine.posed) {
      engine.retarget(complete);
      wake();
    }
  }, [n, target, wake, engine]);

  // Colours, stroke and speed take effect at once.
  useLayoutEffect(() => {
    if (engine.logical !== null && !engine.posed) engine.snap(engine.logical);
  }, [colorLoading, colorDone, colorError, strokeWidth, speedMs, size, reduced, engine]);

  // State. Progress poses a static frame. Reduced motion crossfades.
  useLayoutEffect(() => {
    const complete = () => completeRef.current?.();
    if (progress !== undefined && (shown === "done" || shown === "error")) {
      engine.pose(shown, clamp01(progress));
      return;
    }
    if (reduced) {
      engine.fadeTo(shown);
      return;
    }
    engine.go(shown, complete);
    wake();
  }, [shown, progress, reduced, wake, engine]);

  // Attract runs its cycle on the loop. Starting it sends the state through the effect above.
  useLayoutEffect(() => {
    const a = attractRef.current;
    a.on = driven;
    a.clock = 0;
    a.paused = false;
    if (driven) wake();
  }, [driven, wake]);

  const markInput = () => {
    const a = attractRef.current;
    if (a.on) {
      a.paused = true;
      a.lastInput = performance.now();
    }
  };
  const label = labels?.[shown] ?? DEFAULT_LABELS[shown];

  return (
    <span
      ref={rootRef}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-state={shown}
      onPointerEnter={markInput}
      onPointerMove={markInput}
      onPointerDown={markInput}
      onKeyDown={markInput}
      className={cn("relative inline-block shrink-0 align-middle leading-none", className)}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" className="block overflow-visible">
        <g
          ref={groupRef}
          stroke={colorLoading}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transformBox: "view-box", transformOrigin: "12px 12px" }}
        >
          {ringD.map((d, i) => (
            <path key={i} d={d} opacity={tailOpacity(i, n)} />
          ))}
        </g>
      </svg>
      <VisuallyHidden>{label}</VisuallyHidden>
    </span>
  );
}
