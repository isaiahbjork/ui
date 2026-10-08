"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useReducedMotion } from "framer-motion";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { BJORK_PALETTE, type BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import { useVisibleLoop } from "@/components/bjork-ui/_core/loop";
import { sizeCanvas, useElementSize } from "@/components/bjork-ui/_core/canvas";
import { mulberry32 } from "@/components/bjork-ui/_core/random";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";

export interface LivePoint {
  t: number;
  v: number;
}

export interface LiveSeries {
  id: string;
  label: string;
  data: LivePoint[];
  color?: string;
}

export interface LiveLineProps {
  data?: LivePoint[];
  series?: LiveSeries[];
  window?: number;
  easing?: number;
  yDomain?: [number, number] | "auto";
  threshold?: { value: number; label?: string };
  formatValue?: (v: number) => string;
  formatTime?: (t: number) => string;
  scrub?: boolean;
  onScrub?: (index: number, p: LivePoint) => void;
  paused?: boolean;
  onPausedChange?: (paused: boolean) => void;
  height?: number;
  ariaLabel?: string;
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

// Plot insets. Left holds value labels, right holds the 64px badge column plus an 8px gap.
const PAD_TOP = 12;
const PAD_BOTTOM = 24;
const PAD_LEFT = 40;
const PAD_RIGHT = 72;
const BADGE_H = 22;
const RANGE_TAU = 0.4; // seconds, first-order contraction of the y range
const CONTRACT_PX = 2; // max px a range edge may move per frame while contracting
const HALO_PERIOD = 1.2; // seconds
const ATTRACT_STEP = 250; // ms, 4Hz
const ATTRACT_IDLE_MS = 4000;
const ARIA_EVERY_MS = 5000;
const HIT_CAP = 4096;
const SETTLE_EPS = 1e-4; // fraction of the visible range

function defaultFormatValue(v: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(v);
}

function defaultFormatTime(t: number): string {
  return new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatWindow(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms % 60000 === 0) return `${ms / 60000}m`;
  return `${Math.round(ms / 1000)}s`;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(rgb: [number, number, number], a: number): string {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
}

// First index whose t is >= value.
function lowerBound(samples: LivePoint[], value: number): number {
  let lo = 0;
  let hi = samples.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (samples[mid].t < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// First index whose t is > value.
function upperBound(samples: LivePoint[], value: number): number {
  let lo = 0;
  let hi = samples.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (samples[mid].t <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Grid values at "nice" steps (1, 2, 2.5 or 5 x 10^k), strictly inside lo..hi. Prefers 4 lines.
function gridValues(lo: number, hi: number): number[] {
  const range = hi - lo;
  if (!(range > 0)) return [];
  const base = Math.floor(Math.log10(range)) - 1;
  let fallback: number[] = [];
  for (let k = base; k <= base + 3; k++) {
    for (const m of [1, 2, 2.5, 5]) {
      const step = m * 10 ** k;
      const first = Math.floor(lo / step) + 1;
      const last = Math.ceil(hi / step) - 1;
      const count = last - first + 1;
      if (count < 2 || count > 4) continue;
      const values: number[] = [];
      for (let n = first; n <= last; n++) values.push(Number((n * step).toFixed(10)));
      if (count === 4) return values;
      if (fallback.length < 3) fallback = values;
    }
  }
  return fallback;
}

// Seeded random walk for demos and the attract idle state. next(t) takes ms and returns a point.
export function createRandomWalk(
  seed: number,
  opts?: { base?: number; volatility?: number; hz?: number },
): { next: (t: number) => LivePoint } {
  const base = opts?.base ?? 120;
  const volatility = opts?.volatility ?? 3;
  const hz = opts?.hz ?? 4;
  const rnd = mulberry32(seed);
  let v = base;
  let last: number | null = null;
  const gauss = () => {
    const u = Math.max(rnd(), 1e-9);
    const w = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w);
  };
  return {
    next(t: number) {
      const dt = last === null ? 1 / hz : Math.max(0, (t - last) / 1000);
      last = t;
      const k = dt > 0 ? dt : 1 / hz;
      v += (base - v) * Math.min(1, 0.5 * k) + gauss() * volatility * Math.sqrt(k * hz);
      return { t, v };
    },
  };
}

interface Buffer {
  id: string;
  color?: string;
  samples: LivePoint[];
}

interface RunState {
  clock: number | null;
  range: { lo: number; hi: number } | null;
  head: number | null;
  attract: LivePoint[];
  attractNext: number | null;
  walk: ReturnType<typeof createRandomWalk> | null;
  lastInput: number;
  scrubT: number | null;
  scrubSource: "pointer" | "keyboard" | null;
  primary: LivePoint[];
  plot: { l: number; r: number; t: number; b: number };
  hitCount: number;
  hitX: Float32Array;
  hitIdx: Int32Array;
  visMin: number;
  visMax: number;
  lastAria: number;
  tipText: string;
  tipW: number;
  labelText: string[];
  badgeText: string;
}

export function LiveLine({
  data,
  series,
  window: windowMs = 60000,
  easing = 0.08,
  yDomain = "auto",
  threshold,
  formatValue = defaultFormatValue,
  formatTime = defaultFormatTime,
  scrub = false,
  onScrub,
  paused: pausedProp,
  onPausedChange,
  height = 220,
  ariaLabel = "Live chart",
  tone: toneProp,
  attract = false,
  className,
}: LiveLineProps) {
  const tone = useBjorkTone(toneProp);
  const pal = BJORK_PALETTE[tone];
  const reduce = !!useReducedMotion();

  const [pausedState, setPausedState] = useState(false);
  const paused = pausedProp ?? pausedState;

  const [announce, setAnnounce] = useState("");

  const rootRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const thresholdRef = useRef<HTMLSpanElement>(null);
  const gridLabelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rectRef = useRef<DOMRect | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announceAt = useRef(0);

  const size = useElementSize(rootRef);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });

  const bufRef = useRef<Buffer[]>([]);
  const cfgRef = useRef({
    windowMs,
    easing,
    yDomain,
    threshold,
    formatValue,
    formatTime,
    scrub,
    onScrub,
    ariaLabel,
    reduce,
    attract,
    hasInput: false,
  });
  const palRef = useRef(pal);
  const pausedRef = useRef(paused);
  const stRef = useRef<RunState>({
    clock: null,
    range: null,
    head: null,
    attract: [],
    attractNext: null,
    walk: null,
    lastInput: 0,
    scrubT: null,
    scrubSource: null,
    primary: [],
    plot: { l: 0, r: 0, t: 0, b: 0 },
    hitCount: 0,
    hitX: new Float32Array(HIT_CAP),
    hitIdx: new Int32Array(HIT_CAP),
    visMin: 0,
    visMax: 0,
    lastAria: -Infinity,
    tipText: "",
    tipW: 0,
    labelText: [],
    badgeText: "",
  });

  const frame = (dt: number, t: number): boolean => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    const st = stRef.current;
    const cfg = cfgRef.current;
    const p = palRef.current;
    const isPaused = pausedRef.current;
    const { w, h, dpr } = sizeRef.current;
    if (!canvas || !root || !w || !h) return true;

    const useAttract = cfg.attract && !cfg.hasInput;
    const buffers: Buffer[] = useAttract ? [{ id: "attract", samples: st.attract }] : bufRef.current;
    const hasData = buffers.some((b) => b.samples.length > 0);

    // Clock: the x axis runs on it. It only moves while running and jumps forward to new data.
    let newest = -Infinity;
    for (const b of buffers) {
      const last = b.samples[b.samples.length - 1];
      if (last && last.t > newest) newest = last.t;
    }
    if (st.clock === null) st.clock = Number.isFinite(newest) ? newest : Date.now();
    if (!isPaused) st.clock += dt * 1000;
    if (!isPaused && Number.isFinite(newest) && newest > st.clock) st.clock = newest;
    const clock = st.clock;
    const windowLen = cfg.windowMs;
    const wStart = clock - windowLen;

    // Attract: a seeded walk at 4Hz, paused by input and resumed after 4s idle. Static under reduced motion.
    if (useAttract) {
      if (!st.walk) st.walk = createRandomWalk(7, { base: 120, volatility: 3, hz: 4 });
      const walk = st.walk;
      if (st.attractNext === null) {
        for (let tt = clock - 60000; tt <= clock; tt += ATTRACT_STEP) st.attract.push(walk.next(tt));
        st.attractNext = clock + ATTRACT_STEP;
      } else if (!cfg.reduce) {
        const inputRecently = st.lastInput !== 0 && performance.now() - st.lastInput <= ATTRACT_IDLE_MS;
        if (inputRecently || isPaused) {
          st.attractNext = clock + ATTRACT_STEP;
        } else {
          while (st.attractNext <= clock) {
            st.attract.push(walk.next(st.attractNext));
            st.attractNext += ATTRACT_STEP;
          }
        }
        while (st.attract.length && st.attract[0].t < clock - 300000) st.attract.shift();
      }
    }

    const plot = {
      l: PAD_LEFT,
      r: Math.max(PAD_LEFT + 20, w - PAD_RIGHT),
      t: PAD_TOP,
      b: Math.max(PAD_TOP + 20, h - PAD_BOTTOM),
    };
    st.plot = plot;
    const pW = plot.r - plot.l;
    const pH = plot.b - plot.t;
    const xOf = (tt: number) => plot.l + ((tt - wStart) / windowLen) * pW;

    // Visible window: min and max, hit cache for the primary series, and the primary run list.
    const primary = buffers[0]?.samples ?? [];
    st.primary = primary;
    let vMin = Infinity;
    let vMax = -Infinity;
    let hitCount = 0;
    const primaryStart = Math.max(0, lowerBound(primary, wStart) - 1);
    const primaryNewest = upperBound(primary, clock) - 1; // last sample at or before the clock
    const newestFinite = primaryNewest >= 0 && Number.isFinite(primary[primaryNewest].v);
    for (const b of buffers) {
      const s = b.samples;
      const from = Math.max(0, lowerBound(s, wStart) - 1);
      const to = upperBound(s, clock);
      for (let i = from; i < to; i++) {
        const v = s[i].v;
        if (!Number.isFinite(v)) continue;
        if (v < vMin) vMin = v;
        if (v > vMax) vMax = v;
      }
    }
    for (let i = primaryStart; i < primary.length && primary[i].t <= clock; i++) {
      const v = primary[i].v;
      if (!Number.isFinite(v)) continue;
      if (hitCount < HIT_CAP) {
        st.hitX[hitCount] = xOf(primary[i].t);
        st.hitIdx[hitCount] = i;
        hitCount++;
      }
    }
    st.hitCount = hitCount;

    if (!Number.isFinite(vMin)) {
      vMin = 0;
      vMax = 100;
    }
    st.visMin = vMin;
    st.visMax = vMax;

    // Target domain: visible data (plus the threshold) padded by 12%. A fixed yDomain wins.
    let tLo: number;
    let tHi: number;
    if (Array.isArray(cfg.yDomain)) {
      tLo = cfg.yDomain[0];
      tHi = cfg.yDomain[1];
    } else {
      let lo = vMin;
      let hi = vMax;
      if (cfg.threshold && Number.isFinite(cfg.threshold.value)) {
        lo = Math.min(lo, cfg.threshold.value);
        hi = Math.max(hi, cfg.threshold.value);
      }
      let span = hi - lo;
      if (span < 1e-9) span = Math.max(Math.abs(hi) * 0.2, 1);
      const pad = span * 0.12;
      tLo = lo - pad;
      tHi = hi + pad;
    }

    // Range: expands the same frame, contracts with a first-order approach capped per frame.
    if (!st.range) st.range = { lo: tLo, hi: tHi };
    const range = st.range;
    if (Array.isArray(cfg.yDomain)) {
      range.lo = tLo;
      range.hi = tHi;
    } else {
      if (tLo < range.lo) range.lo = tLo;
      if (tHi > range.hi) range.hi = tHi;
      if (cfg.reduce) {
        // Reduced motion: contraction is instant.
        if (tLo > range.lo) range.lo = tLo;
        if (tHi < range.hi) range.hi = tHi;
      } else {
        const pxPerUnit = pH / Math.max(1e-9, range.hi - range.lo);
        const cap = CONTRACT_PX / pxPerUnit;
        const k = 1 - Math.exp(-dt / RANGE_TAU);
        if (tLo > range.lo) range.lo += Math.min(cap, (tLo - range.lo) * k);
        if (tHi < range.hi) range.hi -= Math.min(cap, (range.hi - tHi) * k);
        if (range.lo > tLo && range.lo - tLo < 1e-9 * (range.hi - range.lo)) range.lo = tLo;
        if (range.hi < tHi && tHi - range.hi < 1e-9 * (range.hi - range.lo)) range.hi = tHi;
      }
    }
    const rLo = range.lo;
    const rHi = range.hi;
    const yOf = (v: number) => plot.t + ((rHi - v) / Math.max(1e-9, rHi - rLo)) * pH;
    const rangeSettled =
      Array.isArray(cfg.yDomain) ||
      (Math.abs(range.lo - tLo) < SETTLE_EPS * (rHi - rLo) && Math.abs(range.hi - tHi) < SETTLE_EPS * (rHi - rLo));

    // Head: the newest real value, approached with a damped step. The newest sample is drawn as the head.
    const newestVal = newestFinite ? primary[primaryNewest].v : null;
    if (newestVal !== null) {
      if (st.head === null || cfg.reduce) st.head = newestVal;
      else {
        const alpha = 1 - Math.pow(1 - cfg.easing, dt * 60);
        st.head += (newestVal - st.head) * alpha;
      }
    }
    const headSettled = newestVal === null || st.head === null || Math.abs(st.head - newestVal) < SETTLE_EPS * (rHi - rLo);
    const headY = st.head !== null && newestVal !== null ? yOf(st.head) : null;

    // Clear and frame.
    const ctx = canvas.getContext("2d");
    if (!ctx) return true;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const hair = p.hair;

    // Grid
    const grid = gridValues(rLo, rHi);
    ctx.lineWidth = 1;
    ctx.strokeStyle = hair;
    ctx.beginPath();
    grid.forEach((gv) => {
      const y = Math.round(yOf(gv)) + 0.5;
      ctx.moveTo(plot.l, y);
      ctx.lineTo(plot.r, y);
    });
    ctx.stroke();

    // Grid labels: pooled spans, positioned by transform only.
    for (let i = 0; i < gridLabelRefs.current.length; i++) {
      const el = gridLabelRefs.current[i];
      if (!el) continue;
      if (i < grid.length) {
        const text = cfg.formatValue(grid[i]);
        if (st.labelText[i] !== text) {
          st.labelText[i] = text;
          el.textContent = text;
        }
        el.style.opacity = "1";
        // Right edge sits 4px inside the 40px gutter. The box is anchored by its own width.
        el.style.transform = `translate3d(calc(36px - 100%), ${yOf(grid[i]).toFixed(2)}px, 0) translateY(-50%)`;
      } else {
        el.style.opacity = "0";
      }
    }

    // Threshold
    const thr = cfg.threshold;
    let thrY: number | null = null;
    if (thr && Number.isFinite(thr.value)) {
      thrY = yOf(thr.value);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = p.textSoft;
      ctx.beginPath();
      const y = Math.round(thrY) + 0.5;
      ctx.moveTo(plot.l, y);
      ctx.lineTo(plot.r, y);
      ctx.stroke();
      ctx.restore();
    }
    if (thresholdRef.current) {
      const el = thresholdRef.current;
      if (thr && thrY !== null) {
        el.style.opacity = "1";
        el.style.transform = `translate3d(0, ${thrY.toFixed(2)}px, 0) translateY(calc(-100% - 8px))`;
      } else {
        el.style.opacity = "0";
      }
    }

    // Runs for the primary series: real values before the newest sample, then the head.
    const runs: number[][] = [];
    let run: number[] = [];
    const lastIdx = newestFinite ? primaryNewest - 1 : primaryNewest;
    for (let i = primaryStart; i <= lastIdx && i < primary.length; i++) {
      const s = primary[i];
      if (s.t > clock) break;
      if (!Number.isFinite(s.v)) {
        if (run.length) runs.push(run);
        run = [];
        continue;
      }
      run.push(xOf(s.t), yOf(s.v));
    }
    if (newestFinite && headY !== null) {
      if (run.length === 0 && runs.length === 0) run.push(plot.l, headY);
      run.push(plot.r, headY);
    }
    if (run.length) runs.push(run);
    if (runs.length === 1 && runs[0].length === 2) runs[0].unshift(plot.l, runs[0][1]);

    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.l, plot.t, pW, pH);
    ctx.clip();

    // Area fill: accent gradient, switching to warning (16%) wherever the line is above the threshold.
    const accentRgb = hexToRgb(p.accent);
    const warnRgb = hexToRgb(p.warning);
    const grad = ctx.createLinearGradient(0, plot.t, 0, plot.b);
    grad.addColorStop(0, rgba(accentRgb, 0.144));
    grad.addColorStop(1, rgba(accentRgb, 0));
    ctx.fillStyle = grad;
    for (const r of runs) {
      if (r.length < 4) continue;
      ctx.beginPath();
      ctx.moveTo(r[0], r[1]);
      for (let i = 2; i < r.length; i += 2) ctx.lineTo(r[i], r[i + 1]);
      ctx.lineTo(r[r.length - 2], plot.b);
      ctx.lineTo(r[0], plot.b);
      ctx.closePath();
      ctx.fill();
    }
    if (thrY !== null) {
      const warnGrad = ctx.createLinearGradient(0, plot.t, 0, plot.b);
      warnGrad.addColorStop(0, rgba(warnRgb, 0.16));
      warnGrad.addColorStop(1, rgba(warnRgb, 0));
      ctx.fillStyle = warnGrad;
      for (const r of runs) {
        if (r.length < 4) continue;
        // Intervals of x where the line is above the threshold (smaller y).
        const intervals: [number, number][] = [];
        for (let i = 0; i + 3 < r.length; i += 2) {
          const x0 = r[i];
          const y0 = r[i + 1];
          const x1 = r[i + 2];
          const y1 = r[i + 3];
          const a0 = y0 <= thrY!;
          const a1 = y1 <= thrY!;
          if (a0 && a1) intervals.push([x0, x1]);
          else if (a0 !== a1) {
            const f = (thrY! - y0) / (y1 - y0);
            const xc = x0 + (x1 - x0) * f;
            intervals.push(a0 ? [x0, xc] : [xc, x1]);
          }
        }
        for (const [x0, x1] of intervals) {
          if (x1 - x0 <= 0) continue;
          ctx.save();
          ctx.beginPath();
          ctx.rect(x0, plot.t, x1 - x0, pH);
          ctx.clip();
          ctx.beginPath();
          ctx.moveTo(r[0], r[1]);
          for (let i = 2; i < r.length; i += 2) ctx.lineTo(r[i], r[i + 1]);
          ctx.lineTo(r[r.length - 2], plot.b);
          ctx.lineTo(r[0], plot.b);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
    }

    // Series 2 and 3 are drawn at real values. Series 1 is the accent line.
    const strokeRuns = (rs: number[][]) => {
      ctx.beginPath();
      for (const r of rs) {
        if (r.length < 4) continue;
        ctx.moveTo(r[0], r[1]);
        for (let i = 2; i < r.length; i += 2) ctx.lineTo(r[i], r[i + 1]);
      }
      ctx.stroke();
    };
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (let bi = 1; bi < buffers.length; bi++) {
      const b = buffers[bi];
      const rs: number[][] = [];
      let cur: number[] = [];
      const from = Math.max(0, lowerBound(b.samples, wStart) - 1);
      for (let i = from; i < b.samples.length && b.samples[i].t <= clock; i++) {
        const s = b.samples[i];
        if (!Number.isFinite(s.v)) {
          if (cur.length) rs.push(cur);
          cur = [];
          continue;
        }
        cur.push(xOf(s.t), yOf(s.v));
      }
      if (cur.length) rs.push(cur);
      ctx.save();
      if (bi === 1) {
        ctx.strokeStyle = b.color ?? p.textMuted;
        ctx.lineWidth = 1.5;
      } else {
        ctx.strokeStyle = b.color ?? p.textSoft;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
      }
      strokeRuns(rs);
      ctx.restore();
    }
    ctx.lineWidth = 1.75;
    ctx.strokeStyle = buffers[0]?.color ?? p.accent;
    strokeRuns(runs);

    ctx.restore();

    // Head dot and halo (halo only while running, never under reduced motion).
    if (headY !== null && newestFinite) {
      const running = !isPaused;
      if (running && !cfg.reduce) {
        const ph = (t % HALO_PERIOD) / HALO_PERIOD;
        const e = 1 - Math.pow(1 - ph, 3);
        const d = 6 + 12 * e;
        ctx.beginPath();
        ctx.arc(plot.r, headY, d / 2, 0, Math.PI * 2);
        ctx.fillStyle = rgba(accentRgb, 0.4 * (1 - ph));
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(plot.r, headY, 3, 0, Math.PI * 2);
      ctx.fillStyle = p.accent;
      ctx.fill();
    }

    // Badge: text from the newest real value, centred on the head y.
    const badge = badgeRef.current;
    if (badge) {
      if (headY !== null && newestVal !== null) {
        badge.style.opacity = "1";
        badge.style.transform = `translate3d(0, ${(headY - BADGE_H / 2).toFixed(2)}px, 0)`;
        const text = cfg.formatValue(newestVal);
        if (st.badgeText !== text) {
          st.badgeText = text;
          badge.textContent = text;
        }
      } else {
        badge.style.opacity = "0";
      }
    }

    // Scrub overlay: snapped crosshair, dot on the line, and a tooltip pill.
    const tip = tipRef.current;
    let scrubbing = false;
    if (st.scrubT !== null && primary.length) {
      const idx = Math.min(primary.length - 1, Math.max(0, lowerBound(primary, st.scrubT)));
      let pick = idx;
      if (idx > 0 && Math.abs(primary[idx - 1].t - st.scrubT) < Math.abs(primary[idx].t - st.scrubT)) pick = idx - 1;
      const sp = primary[pick];
      if (sp && sp.t >= wStart && sp.t <= clock) {
        scrubbing = true;
        const x = Math.round(xOf(sp.t)) + 0.5;
        ctx.save();
        ctx.strokeStyle = p.textSoft;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, plot.t);
        ctx.lineTo(x, plot.b);
        ctx.stroke();
        if (Number.isFinite(sp.v)) {
          const y = yOf(sp.v);
          ctx.beginPath();
          ctx.arc(x - 0.5, y, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = p.accent;
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = p.bg;
          ctx.stroke();
        }
        ctx.restore();
        if (tip) {
          const text = `${Number.isFinite(sp.v) ? cfg.formatValue(sp.v) : "No data"} \u00b7 ${cfg.formatTime(sp.t)}`;
          if (st.tipText !== text) {
            st.tipText = text;
            tip.textContent = text;
            st.tipW = tip.offsetWidth;
          }
          const tipW = st.tipW;
          const tipH = 24;
          const yPoint = Number.isFinite(sp.v) ? yOf(sp.v) : plot.t;
          let tx = x + 12;
          if (tx + tipW > w) tx = x - 12 - tipW;
          const ty = Math.min(Math.max(0, yPoint - tipH - 10), h - tipH);
          tip.style.opacity = "1";
          tip.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0)`;
        }
      }
    }
    if (!scrubbing && tip) tip.style.opacity = "0";

    // Summary for assistive tech, refreshed every 5s.
    const nowMs = performance.now();
    if (nowMs - st.lastAria >= ARIA_EVERY_MS && newestVal !== null) {
      st.lastAria = nowMs;
      canvas.setAttribute(
        "aria-label",
        `${cfg.ariaLabel}, latest ${cfg.formatValue(newestVal)}, min ${cfg.formatValue(vMin)}, max ${cfg.formatValue(vMax)}, last ${Math.round(windowLen / 1000)} seconds`,
      );
    }

    // Keep the loop running for scrub, live data and unsettled state.
    if (st.scrubT !== null) return true;
    if (useAttract) return !cfg.reduce;
    if (isPaused) return !(rangeSettled && headSettled);
    return hasData;
  };

  const { wake } = useVisibleLoop(rootRef, frame);

  // Buffers: sorted copies of the props, so out-of-order pushes land in place.
  useEffect(() => {
    const list: Buffer[] = [];
    const sortCopy = (points: LivePoint[]) =>
      points
        .filter((p) => Number.isFinite(p.t))
        .map((p) => ({ t: p.t, v: p.v }))
        .sort((a, b) => a.t - b.t);
    if (series && series.length) {
      series.slice(0, 3).forEach((s) => list.push({ id: s.id, color: s.color, samples: sortCopy(s.data) }));
    } else if (data) {
      list.push({ id: "data", samples: sortCopy(data) });
    }
    bufRef.current = list;
    cfgRef.current.hasInput = list.length > 0;
    wake();
  }, [data, series, attract, wake]);

  // Keep the config and palette the loop reads in sync with the latest render.
  useEffect(() => {
    cfgRef.current = {
      ...cfgRef.current,
      windowMs,
      easing,
      yDomain,
      threshold,
      formatValue,
      formatTime,
      scrub,
      onScrub,
      ariaLabel,
      reduce,
      attract,
    };
    palRef.current = pal;
    pausedRef.current = paused;
    wake();
  }, [windowMs, easing, yDomain, threshold, formatValue, formatTime, scrub, onScrub, ariaLabel, reduce, attract, pal, paused, wake]);

  // Canvas backing store follows the root size.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.width || !size.height) return;
    sizeRef.current = { w: size.width, h: size.height, dpr: sizeCanvas(canvas, size.width, size.height) };
    wake();
  }, [size.width, size.height, wake]);


  const markInput = () => {
    stRef.current.lastInput = performance.now();
  };

  const setPaused = (next: boolean) => {
    if (pausedProp === undefined) setPausedState(next);
    onPausedChange?.(next);
    wake();
  };

  const scrubToIndex = (index: number, source: "pointer" | "keyboard") => {
    const st = stRef.current;
    const primary = st.primary;
    if (!scrub || !primary.length) return;
    const i = Math.min(primary.length - 1, Math.max(0, index));
    st.scrubT = primary[i].t;
    st.scrubSource = source;
    onScrub?.(i, primary[i]);
    wake();
  };

  const clearScrub = () => {
    const st = stRef.current;
    st.scrubT = null;
    st.scrubSource = null;
    wake();
  };

  const announceScrub = (index: number) => {
    const primary = stRef.current.primary;
    const point = primary[index];
    if (!point) return;
    const text = `${cfgRef.current.formatValue(point.v)}, ${cfgRef.current.formatTime(point.t)}`;
    const now = performance.now();
    if (announceTimer.current) clearTimeout(announceTimer.current);
    if (now - announceAt.current >= 250) {
      announceAt.current = now;
      setAnnounce(text);
    } else {
      announceTimer.current = setTimeout(() => {
        announceAt.current = performance.now();
        setAnnounce(text);
      }, 250);
    }
  };

  const indexOfT = (t: number) => {
    const primary = stRef.current.primary;
    const i = lowerBound(primary, t);
    return Math.min(primary.length - 1, i);
  };

  const onPointerEnter = () => {
    markInput();
    const el = wrapperRef.current;
    if (el) rectRef.current = el.getBoundingClientRect();
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
  };

  const pointerToIndex = (e: PointerEvent<HTMLDivElement>): number | null => {
    const rect = rectRef.current;
    const st = stRef.current;
    if (!rect) return null;
    const x = e.clientX - rect.left;
    if (x < st.plot.l || x > st.plot.r) return null;
    const count = st.hitCount;
    if (!count) return null;
    let lo = 0;
    let hi = count - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (st.hitX[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(st.hitX[lo - 1] - x) < Math.abs(st.hitX[lo] - x)) lo -= 1;
    return st.hitIdx[lo];
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    markInput();
    if (!scrub) return;
    const index = pointerToIndex(e);
    if (index === null) return;
    scrubToIndex(index, "pointer");
    announceScrub(index);
  };

  const onPointerLeave = () => {
    if (!scrub) return;
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => {
      if (stRef.current.scrubSource === "pointer") clearScrub();
    }, 120);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    markInput();
    if (e.target !== e.currentTarget) return; // the pause button handles its own keys
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      setPaused(!paused);
      return;
    }
    if (!scrub) return;
    const st = stRef.current;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const primary = st.primary;
      if (!primary.length) return;
      e.preventDefault();
      const step = (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 10 : 1);
      const current = st.scrubT !== null ? indexOfT(st.scrubT) : primary.length - 1;
      const next = Math.min(primary.length - 1, Math.max(0, current + step));
      scrubToIndex(next, "keyboard");
      announceScrub(next);
    } else if (e.key === "End") {
      if (st.scrubT === null) return;
      e.preventDefault();
      clearScrub();
      setAnnounce("Live");
    } else if (e.key === "Escape") {
      if (st.scrubT === null) return;
      e.preventDefault();
      clearScrub();
    }
  };

  const isEmpty = !attract && (series ? series.every((s) => s.data.length === 0) : !data?.length);
  const showLegend = !!series && series.length > 1;
  const legend = (series ?? []).slice(0, 3);
  const thresholdText = threshold ? (threshold.label ?? formatValue(threshold.value)) : "";

  const cssVars = {
    "--bjork-accent": pal.accent,
    "--bjork-accent-fill": pal.accentFill,
    "--bjork-accent-foreground": pal.accentFg,
    "--bjork-text": pal.text,
    "--bjork-text-medium": pal.textMedium,
    "--bjork-text-muted": pal.textMuted,
    "--bjork-text-soft": pal.textSoft,
    "--bjork-text-faint": pal.textFaint,
    "--bjork-border": pal.border,
    "--bjork-surface-hover": pal.raised,
    "--bjork-ring-offset": pal.bg,
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      data-loop="idle"
      className={cn("relative w-full select-none text-[color:var(--bjork-text)]", className)}
      style={{ ...cssVars, height }}
    >
      <div
        ref={wrapperRef}
        role="group"
        aria-label={ariaLabel}
        tabIndex={0}
        onPointerEnter={onPointerEnter}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onPointerDown={(e) => {
          if (e.pointerType === "touch") onPointerMove(e);
        }}
        onKeyDown={onKeyDown}
        onFocus={markInput}
        className="absolute inset-0 touch-pan-y rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bjork-ring-offset)]"
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={ariaLabel}
          className="pointer-events-none absolute left-0 top-0"
        />

        {showLegend && (
          <div className="pointer-events-none absolute flex items-center gap-4 font-bjork-alpha text-[11px] font-medium leading-3" style={{ left: PAD_LEFT, top: 0 }}>
            {legend.map((s, i) => (
              <span key={s.id} className="inline-flex items-center gap-1.5 text-[color:var(--bjork-text-medium)]">
                <span
                  aria-hidden="true"
                  className="inline-block h-px w-2"
                  style={{
                    background: s.color ?? (i === 0 ? "var(--bjork-accent)" : i === 1 ? "var(--bjork-text-muted)" : "var(--bjork-text-soft)"),
                    height: i === 2 ? 0 : 2,
                    borderTop: i === 2 ? "1.5px dashed var(--bjork-text-soft)" : undefined,
                  }}
                />
                {s.label}
              </span>
            ))}
          </div>
        )}

        {Array.from({ length: 4 }).map((_, i) => (
          <span
            key={i}
            ref={(el) => {
              gridLabelRefs.current[i] = el;
            }}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 block whitespace-nowrap font-mono text-[10px] leading-none tabular-nums text-[color:var(--bjork-text-faint)] opacity-0 [text-box:trim-both_cap_alphabetic]"
          />
        ))}

        {threshold && (
          <span
            ref={thresholdRef}
            aria-hidden="true"
            className="pointer-events-none absolute right-[72px] top-0 whitespace-nowrap font-mono text-[10px] leading-none tabular-nums text-[color:var(--bjork-text-muted)] opacity-0 [text-box:trim-both_cap_alphabetic]"
            style={{ transform: "translate3d(0, -100px, 0)" }}
          >
            {thresholdText}
          </span>
        )}

        <span
          ref={badgeRef}
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-0 inline-flex h-[22px] items-center rounded-[11px] bg-[color:var(--bjork-accent-fill)] px-2 font-mono text-[12px] leading-none tabular-nums text-[color:var(--bjork-accent-foreground)] opacity-0 [text-box:trim-both_cap_alphabetic]"
        />

        <div
          ref={tipRef}
          role="presentation"
          className="pointer-events-none absolute left-0 top-0 flex h-6 items-center whitespace-nowrap rounded-[8px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-surface-hover)] px-2 font-mono text-[11px] leading-none tabular-nums text-[color:var(--bjork-text)] opacity-0 shadow-[0_14px_28px_-12px_rgba(0,0,0,0.6)]"
        />

        <button
          type="button"
          aria-pressed={paused}
          aria-label={paused ? "Resume" : "Pause"}
          onClick={() => setPaused(!paused)}
          className="absolute right-0 top-0 inline-flex size-6 items-center justify-center rounded-[7px] text-[color:var(--bjork-text-muted)] transition-[background-color,color,transform] duration-150 ease-out hover:bg-[color:var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bjork-ring-offset)] active:scale-[0.97]"
        >
          {paused ? (
            // Play glyph nudged 0.5px right: the triangle's weight sits on its flat left edge (OPTICAL-ALIGNMENT R2, 12px icon).
            <Play className="size-3 translate-x-[0.5px] fill-current" aria-hidden="true" />
          ) : (
            <Pause className="size-3 fill-current" aria-hidden="true" />
          )}
        </button>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 right-0 bottom-0 font-mono text-[10px] leading-none tabular-nums text-[color:var(--bjork-text-faint)] [text-box:trim-both_cap_alphabetic]"
          style={{ left: PAD_LEFT, right: PAD_RIGHT, height: PAD_BOTTOM }}
        >
          <div className="flex h-full items-start justify-between pt-[7px]">
            <span>-{formatWindow(windowMs)}</span>
            <span>-{formatWindow(windowMs / 2)}</span>
            <span>now</span>
          </div>
        </div>

        {isEmpty && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center font-bjork-alpha text-[12px] text-[color:var(--bjork-text-soft)]"
            style={{ top: PAD_TOP, bottom: PAD_BOTTOM, left: PAD_LEFT, right: PAD_RIGHT }}
          >
            Waiting for data
          </div>
        )}
      </div>

      <LiveRegion message={announce} />
    </div>
  );
}
