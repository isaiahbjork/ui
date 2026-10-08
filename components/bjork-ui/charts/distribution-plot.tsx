"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
import { mulberry32 } from "@/components/bjork-ui/_core/random";
import { useChartCanvas, easeOut, roundRectPath, writeLabels } from "@/components/bjork-ui/charts/_kit/canvas";
import {
  useChartTheme,
  chartFocusRing,
  ChartTable,
  LabelPool,
  placeTooltip,
  HoverTooltip,
  ChartAnnouncer,
  type TooltipHandle,
  type AnnouncerHandle,
  type TooltipContent,
} from "@/components/bjork-ui/charts/_kit/chrome";
import { clamp, crisp, damp, kde, niceDomain, niceTicks, quantile, silverman, withAlpha, formatNumber, formatPercent, gaussian } from "@/components/bjork-ui/charts/_kit/scale";

export type DistributionMarker = "p50" | "p75" | "p90" | "p95" | "p99" | "mean";

export interface DistributionPlotProps {
  values: number[];
  /** Bin count, or "auto" (Freedman-Diaconis, 12 to 48). */
  bins?: number | "auto";
  onBinsChange?: (bins: number) => void;
  /** Draggable threshold. Controlled when `threshold` is set. */
  threshold?: number | null;
  defaultThreshold?: number | null;
  onThresholdChange?: (value: number) => void;
  /** Which side of the threshold is the tail. */
  tail?: "above" | "below";
  markers?: DistributionMarker[];
  showDensity?: boolean;
  /** Fixed x domain. Auto by default. */
  domain?: [number, number];
  formatValue?: (v: number) => string;
  unit?: string;
  height?: number;
  ariaLabel?: string;
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

const PAD_TOP = 54;
const PAD_BOTTOM = 26;
const PAD_LEFT = 40;
const PAD_RIGHT = 14;
const ENTER_MS = 760;
const DENSITY_DELAY = 0.45;
const BAR_TAU = 0.11;
const RANGE_TAU = 0.14;
const KDE_SAMPLES = 180;
const Y_LABELS = 6;
const X_LABELS = 12;
const PIN_LABELS = 6;
const ATTRACT_IDLE_MS = 4000;

const clock = () => performance.now();
const defaultFormatValue = (v: number) => formatNumber(v, 0);

function autoBins(sorted: number[], lo: number, hi: number): number {
  const n = sorted.length;
  if (n < 2) return 12;
  const iqr = quantile(sorted, 0.75) - quantile(sorted, 0.25);
  const h = 2 * iqr * Math.pow(n, -1 / 3);
  if (!(h > 0)) return 24;
  return clamp(Math.round((hi - lo) / h), 12, 48);
}

interface Stats {
  sorted: number[];
  lo: number;
  hi: number;
  n: number;
  binCount: number;
  binW: number;
  counts: number[];
  density: number[]; // KDE scaled to counts
  maxCount: number;
  bw: number;
  pins: { id: DistributionMarker; v: number }[];
  mean: number;
}

function computeStats(values: number[], bins: number | "auto", domain: [number, number] | undefined, markers: DistributionMarker[]): Stats {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const n = sorted.length;
  const rawLo = n ? sorted[0] : 0;
  const rawHi = n ? sorted[n - 1] : 1;
  const [lo, hi] = domain ?? niceDomain(rawLo, rawHi, 8);
  const binCount = bins === "auto" ? autoBins(sorted, lo, hi) : clamp(Math.round(bins), 4, 120);
  const binW = (hi - lo) / binCount;
  const counts = new Array(binCount).fill(0);
  for (const v of sorted) counts[clamp(Math.floor((v - lo) / binW), 0, binCount - 1)]++;
  const bw = silverman(sorted) || binW;
  const density: number[] = [];
  for (let k = 0; k < KDE_SAMPLES; k++) density.push(kde(sorted, lo + ((hi - lo) * k) / (KDE_SAMPLES - 1), bw) * n * binW);
  const maxCount = Math.max(1, ...counts, ...density);
  const mean = n ? sorted.reduce((a, b) => a + b, 0) / n : 0;
  const pins = markers.map((id) => ({ id, v: id === "mean" ? mean : quantile(sorted, Number(id.slice(1)) / 100) }));
  return { sorted, lo, hi, n, binCount, binW, counts, density, maxCount, bw, pins, mean };
}

// Count of values strictly above v, by binary search.
function countAbove(sorted: number[], v: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return sorted.length - lo;
}

interface Run {
  enter: number;
  disp: number[];
  dispDensity: number[];
  yMax: number;
  ready: boolean;
  prev: { lo: number; binW: number; heights: number[] } | null;
  binsKey: string;
  thr: number | null;
  thrDisp: number | null;
  hoverBin: number | null;
  source: "pointer" | "keyboard" | "attract" | null;
  plot: { l: number; r: number; t: number; b: number };
  yCache: string[];
  xCache: string[];
  pinCache: string[];
  drag: number | null;
  lastInput: number;
  attractT: number;
}

export function DistributionPlot({
  values,
  bins: binsProp = "auto",
  onBinsChange,
  threshold: thresholdProp,
  defaultThreshold = null,
  onThresholdChange,
  tail = "above",
  markers = ["p50", "p95", "p99"],
  showDensity = true,
  domain,
  formatValue = defaultFormatValue,
  unit = "",
  height = 300,
  ariaLabel = "Distribution",
  tone: toneProp,
  attract = false,
  className,
}: DistributionPlotProps) {
  const { pal, reduce, vars } = useChartTheme(toneProp);
  const announcer = useRef<AnnouncerHandle>(null);
  const tipRef = useRef<TooltipHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const shareRef = useRef<HTMLSpanElement>(null);
  const handleValueRef = useRef<HTMLSpanElement>(null);
  const yPool = useRef<(HTMLSpanElement | null)[]>([]);
  const xPool = useRef<(HTMLSpanElement | null)[]>([]);
  const pinPool = useRef<(HTMLSpanElement | null)[]>([]);
  const rectRef = useRef<DOMRect | null>(null);

  const [binsState, setBinsState] = useState<number | "auto">(binsProp);
  const bins = onBinsChange ? binsProp : binsState;
  const [thrState, setThrState] = useState<number | null>(defaultThreshold);
  const threshold = thresholdProp !== undefined ? thresholdProp : thrState;

  const markerKey = markers.join(",");
  const stats = useMemo(
    () => computeStats(values, bins, domain, markerKey ? (markerKey.split(",") as DistributionMarker[]) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values, bins, domain?.[0], domain?.[1], markerKey],
  );

  const fmt = (v: number) => `${formatValue(v)}${unit ? ` ${unit}` : ""}`;
  const shareText = (t: number) => {
    const above = countAbove(stats.sorted, t);
    const share = (tail === "above" ? above : stats.n - above) / Math.max(1, stats.n);
    return { share, text: `${formatPercent(share, share < 0.1 ? 1 : 0)} ${tail}` };
  };

  const cfg = useRef({ stats, threshold, showDensity, tail, reduce, pal, formatValue, unit, attract });
  useEffect(() => {
    cfg.current = { stats, threshold, showDensity, tail, reduce, pal, formatValue, unit, attract };
  });

  const st = useRef<Run>({
    enter: 0,
    disp: [],
    dispDensity: [],
    yMax: 1,
    ready: false,
    prev: null,
    binsKey: "",
    thr: threshold,
    thrDisp: threshold,
    hoverBin: null,
    source: null,
    plot: { l: 0, r: 0, t: 0, b: 0 },
    yCache: [],
    xCache: [],
    pinCache: [],
    drag: null,
    lastInput: 0,
    attractT: 0,
  });

  const { rootRef, hostRef, canvasRef, wake } = useChartCanvas(({ ctx, w, h, dt }) => {
    const s = st.current;
    const c = cfg.current;
    const p = c.pal;
    const S = c.stats;
    const plot = { l: PAD_LEFT, r: w - PAD_RIGHT, t: PAD_TOP, b: h - PAD_BOTTOM };
    s.plot = plot;
    const pW = plot.r - plot.l;
    const xOf = (v: number) => plot.l + ((v - S.lo) / Math.max(1e-12, S.hi - S.lo)) * pW;

    // Rebin: new bars start from the old histogram's height at their centre, so changes morph.
    const key = `${S.lo}|${S.hi}|${S.binCount}|${S.n}`;
    if (key !== s.binsKey) {
      const prev = s.prev;
      s.disp = S.counts.map((cnt, k) => {
        if (!s.ready || !prev || c.reduce) return cnt;
        const centre = S.lo + (k + 0.5) * S.binW;
        const j = clamp(Math.floor((centre - prev.lo) / prev.binW), 0, prev.heights.length - 1);
        return (prev.heights[j] ?? 0) * (S.binW / prev.binW);
      });
      if (!s.dispDensity.length || c.reduce) s.dispDensity = S.density.slice();
      s.binsKey = key;
    }

    s.enter = c.reduce ? 1 : Math.min(1, s.enter + (dt * 1000) / ENTER_MS);
    const ms = s.enter * ENTER_MS;
    const stagger = Math.min(18, 380 / Math.max(1, S.binCount));
    const growOf = (k: number) => (s.enter >= 1 ? 1 : easeOut(clamp((ms - k * stagger) / (ENTER_MS - 380), 0, 1)));

    let moving = false;
    for (let k = 0; k < S.binCount; k++) {
      const target = S.counts[k];
      if (c.reduce) s.disp[k] = target;
      else {
        s.disp[k] = damp(s.disp[k] ?? 0, target, BAR_TAU, dt);
        if (Math.abs(s.disp[k] - target) > 0.01) moving = true;
        else s.disp[k] = target;
      }
    }
    for (let k = 0; k < KDE_SAMPLES; k++) {
      const target = S.density[k];
      if (c.reduce) s.dispDensity[k] = target;
      else {
        s.dispDensity[k] = damp(s.dispDensity[k] ?? 0, target, BAR_TAU, dt);
        if (Math.abs(s.dispDensity[k] - target) > 0.01) moving = true;
        else s.dispDensity[k] = target;
      }
    }
    s.prev = { lo: S.lo, binW: S.binW, heights: s.disp.slice() };
    s.ready = true;

    const targetMax = S.maxCount * 1.12;
    s.yMax = c.reduce || s.yMax <= 1 ? targetMax : damp(s.yMax, targetMax, RANGE_TAU, dt);
    if (Math.abs(s.yMax - targetMax) > targetMax * 1e-4) moving = true;
    else s.yMax = targetMax;
    const yOf = (cnt: number) => plot.b - (cnt / s.yMax) * (plot.b - plot.t);

    // Grid and axes.
    const yt = niceTicks(0, s.yMax, 4);
    ctx.lineWidth = 1;
    ctx.strokeStyle = p.hair;
    ctx.beginPath();
    for (const v of yt) {
      const y = crisp(yOf(v));
      ctx.moveTo(plot.l, y);
      ctx.lineTo(plot.r, y);
    }
    ctx.stroke();
    writeLabels(yPool.current, s.yCache, yt.map((v) => ({ text: formatNumber(v, 0), x: plot.l - 8, y: yOf(v), ax: -100 })));
    const xt = niceTicks(S.lo, S.hi, Math.max(3, Math.floor(pW / 90)));
    writeLabels(xPool.current, s.xCache, xt.map((v) => ({ text: c.formatValue(v), x: xOf(v), y: plot.b + 13, ax: -50 })));

    // Threshold, eased toward its target so keyboard steps glide.
    if (c.threshold !== null && c.threshold !== undefined) {
      if (s.thrDisp === null || c.reduce || s.drag !== null) s.thrDisp = c.threshold;
      else {
        s.thrDisp = damp(s.thrDisp, c.threshold, 0.06, dt);
        if (Math.abs(s.thrDisp - c.threshold) > (S.hi - S.lo) * 1e-4) moving = true;
        else s.thrDisp = c.threshold;
      }
    } else s.thrDisp = null;
    const thrX = s.thrDisp !== null ? xOf(s.thrDisp) : null;
    const inTail = (x0: number, x1: number): [number, number] | null => {
      if (thrX === null) return null;
      if (c.tail === "above") return x1 > thrX ? [Math.max(x0, thrX), x1] : null;
      return x0 < thrX ? [x0, Math.min(x1, thrX)] : null;
    };

    // Bars: 2px surface gap, rounded data end, square baseline. The tail part is accent.
    const bw = pW / S.binCount;
    const gap = bw > 6 ? 2 : bw > 3 ? 1 : 0;
    for (let k = 0; k < S.binCount; k++) {
      const cnt = s.disp[k] * growOf(k);
      if (cnt <= 0) continue;
      const x0 = plot.l + k * bw + gap / 2;
      const x1 = plot.l + (k + 1) * bw - gap / 2;
      const y = yOf(cnt);
      const hov = s.hoverBin === k;
      ctx.beginPath();
      roundRectPath(ctx, x0, y, Math.max(0.5, x1 - x0), plot.b - y, Math.min(3, (x1 - x0) / 2), 0);
      ctx.fillStyle = withAlpha(p.text, hov ? 0.32 : 0.15);
      ctx.fill();
      const tailSpan = inTail(x0, x1);
      if (tailSpan) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(tailSpan[0], plot.t - 4, tailSpan[1] - tailSpan[0], plot.b - plot.t + 4);
        ctx.clip();
        ctx.beginPath();
        roundRectPath(ctx, x0, y, Math.max(0.5, x1 - x0), plot.b - y, Math.min(3, (x1 - x0) / 2), 0);
        ctx.fillStyle = withAlpha(p.accent, hov ? 0.85 : 0.6);
        ctx.fill();
        ctx.restore();
      }
    }

    // Density curve, drawn in after the bars land.
    if (c.showDensity) {
      const d = clamp((s.enter - DENSITY_DELAY) / (1 - DENSITY_DELAY), 0, 1);
      if (d > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(plot.l, 0, pW * easeOut(d), h);
        ctx.clip();
        ctx.beginPath();
        for (let k = 0; k < KDE_SAMPLES; k++) {
          const x = plot.l + (k / (KDE_SAMPLES - 1)) * pW;
          const y = yOf(s.dispDensity[k]);
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineJoin = "round";
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = withAlpha(p.text, 0.72);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Baseline.
    ctx.strokeStyle = p.textFaint;
    ctx.beginPath();
    ctx.moveTo(plot.l, crisp(plot.b));
    ctx.lineTo(plot.r, crisp(plot.b));
    ctx.stroke();

    // Percentile pins: hairlines with tags stacked so they never collide.
    const pinItems = S.pins
      .map((pin) => ({ ...pin, x: xOf(pin.v) }))
      .filter((pin) => pin.x >= plot.l && pin.x <= plot.r)
      .sort((a, b) => a.x - b.x);
    const rowsEnd: number[] = [];
    const placed: { text: string; x: number; y: number; ax: number }[] = [];
    const pinAlpha = clamp((s.enter - 0.55) / 0.45, 0, 1);
    ctx.strokeStyle = withAlpha(p.text, 0.32 * pinAlpha);
    ctx.lineWidth = 1;
    for (const pin of pinItems) {
      const text = `${pin.id.toUpperCase()} ${c.formatValue(pin.v)}`;
      const tw = text.length * 6.1 + 8;
      let row = 0;
      while (rowsEnd[row] !== undefined && rowsEnd[row] > pin.x - 4) row++;
      rowsEnd[row] = pin.x + tw;
      const y = 10 + row * 14;
      const x = crisp(pin.x - 0.5);
      ctx.beginPath();
      ctx.moveTo(x, y + 6);
      ctx.lineTo(x, plot.b);
      ctx.stroke();
      placed.push({ text, x: pin.x - 3, y: y, ax: 0 });
    }
    writeLabels(pinPool.current, s.pinCache, placed.map((pl) => ({ ...pl, opacity: pinAlpha })));

    // Threshold line and handle.
    const handle = handleRef.current;
    if (thrX !== null && handle) {
      ctx.strokeStyle = p.accentInk;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(Math.round(thrX) + 0.25, plot.t - 2);
      ctx.lineTo(Math.round(thrX) + 0.25, plot.b);
      ctx.stroke();
      const hw = handle.offsetWidth;
      handle.style.opacity = String(clamp((s.enter - 0.4) / 0.6, 0, 1));
      handle.style.transform = `translate3d(${clamp(thrX - hw / 2, 0, w - hw).toFixed(1)}px, ${(plot.t - 24).toFixed(1)}px, 0)`;
      const thrNow = c.threshold ?? 0;
      const above = countAbove(S.sorted, thrNow);
      const share = (c.tail === "above" ? above : S.n - above) / Math.max(1, S.n);
      const vText = `${c.formatValue(thrNow)}${c.unit ? ` ${c.unit}` : ""}`;
      const sText = `${formatPercent(share, share < 0.1 ? 1 : 0)} ${c.tail}`;
      if (handleValueRef.current && handleValueRef.current.textContent !== vText) handleValueRef.current.textContent = vText;
      if (shareRef.current && shareRef.current.textContent !== sText) shareRef.current.textContent = sText;
    } else if (handle) handle.style.opacity = "0";

    // Tooltip for the hovered bin.
    const tip = tipRef.current;
    if (tip?.el && s.hoverBin !== null) {
      const k = s.hoverBin;
      const x = plot.l + (k + 0.5) * bw;
      const pos = placeTooltip(x, yOf(S.counts[k]), tip.size.w, tip.size.h, w, h, 10);
      tip.el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
    }

    // Attract: the threshold sweeps through the upper tail.
    if (c.attract && !c.reduce && c.threshold !== null && (!s.lastInput || clock() - s.lastInput > ATTRACT_IDLE_MS)) {
      s.attractT += dt;
      const q = 0.7 + 0.25 * (0.5 - 0.5 * Math.cos(s.attractT * 0.6));
      // Drives the drawn threshold only; React state is untouched until a real input.
      c.threshold = quantile(S.sorted, q);
      return true;
    }

    return moving || s.enter < 1;
  });

  const setThreshold = (v: number, announce = true) => {
    const t = clamp(v, stats.lo, stats.hi);
    if (thresholdProp === undefined) setThrState(t);
    onThresholdChange?.(t);
    cfg.current.threshold = t;
    if (announce) announcer.current?.say(`Threshold ${fmt(t)}, ${shareText(t).text}`);
    wake();
  };
  useEffect(() => {
    wake();
  }, [stats, threshold, showDensity, tail, pal, reduce, attract, wake]);

  const tooltipFor = (k: number): TooltipContent => {
    const a = stats.lo + k * stats.binW;
    const b = a + stats.binW;
    const cnt = stats.counts[k];
    return {
      key: `${k}|${stats.binCount}|${pal.text}`,
      title: `${formatValue(a)}–${formatValue(b)}${unit ? ` ${unit}` : ""}`,
      rows: [
        { key: "c", label: "Count", value: formatNumber(cnt, 0) },
        { key: "s", label: "Share", value: formatPercent(cnt / Math.max(1, stats.n), 1), strong: false },
      ],
    };
  };

  const setHoverBin = (k: number | null, source: Run["source"]) => {
    const s = st.current;
    if (s.hoverBin === k) return;
    s.hoverBin = k;
    s.source = k === null ? null : source;
    tipRef.current?.set(k === null ? null : tooltipFor(k));
    wake();
  };

  const local = (e: PointerEvent<HTMLDivElement>) => {
    const r = rectRef.current ?? wrapperRef.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : null;
  };
  const valueAt = (x: number) => {
    const s = st.current;
    return stats.lo + ((x - s.plot.l) / Math.max(1, s.plot.r - s.plot.l)) * (stats.hi - stats.lo);
  };
  const nearThreshold = (x: number) => {
    const s = st.current;
    if (threshold === null || threshold === undefined) return false;
    const tx = s.plot.l + ((threshold - stats.lo) / (stats.hi - stats.lo)) * (s.plot.r - s.plot.l);
    return Math.abs(x - tx) < 12;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    st.current.lastInput = clock();
    if (wrapperRef.current) rectRef.current = wrapperRef.current.getBoundingClientRect();
    const pt = local(e);
    if (!pt || threshold === null || threshold === undefined) return;
    // Grab the handle, or click anywhere in the plot to move the threshold there.
    const s = st.current;
    if (nearThreshold(pt.x) || (pt.y > s.plot.t - 30 && pt.y < s.plot.t)) {
      s.drag = e.pointerId;
    } else if (pt.y >= s.plot.t && pt.y <= s.plot.b && e.pointerType !== "touch") {
      s.drag = e.pointerId;
      setThreshold(valueAt(pt.x), false);
    } else return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setHoverBin(null, null);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    st.current.lastInput = clock();
    const pt = local(e);
    if (!pt) return;
    const s = st.current;
    if (s.drag === e.pointerId) {
      setThreshold(valueAt(pt.x), false);
      return;
    }
    if (wrapperRef.current) wrapperRef.current.style.cursor = nearThreshold(pt.x) ? "ew-resize" : "crosshair";
    if (pt.x < s.plot.l || pt.x > s.plot.r || pt.y < s.plot.t - 10 || pt.y > s.plot.b + 4 || nearThreshold(pt.x)) {
      setHoverBin(null, null);
      return;
    }
    setHoverBin(clamp(Math.floor(((pt.x - s.plot.l) / (s.plot.r - s.plot.l)) * stats.binCount), 0, stats.binCount - 1), "pointer");
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const s = st.current;
    if (s.drag === e.pointerId) {
      s.drag = null;
      if (threshold !== null && threshold !== undefined) announcer.current?.say(`Threshold ${fmt(threshold)}, ${shareText(threshold).text}`);
      wake();
    }
  };

  const setBins = (n: number) => {
    const next = clamp(n, 4, 120);
    if (onBinsChange) onBinsChange(next);
    else setBinsState(next);
    announcer.current?.say(`${next} bins`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    st.current.lastInput = clock();
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      if (threshold === null || threshold === undefined) return;
      e.preventDefault();
      const step = stats.binW * (e.shiftKey ? 10 : 1) * (e.key === "ArrowLeft" ? -1 : 1);
      // Snap to bin edges, so keyboard steps land on round values.
      const snapped = Math.round((threshold - stats.lo) / stats.binW) * stats.binW + stats.lo;
      setThreshold(snapped + step);
    } else if (e.key === "Home" || e.key === "End") {
      if (threshold === null || threshold === undefined) return;
      e.preventDefault();
      setThreshold(e.key === "Home" ? stats.lo : stats.hi);
    } else if (e.key === "[" || e.key === "]") {
      e.preventDefault();
      setBins(stats.binCount + (e.key === "[" ? -2 : 2));
    } else if (e.key === "Escape") {
      setHoverBin(null, null);
    }
  };

  const tableRows = useMemo(
    () => stats.counts.map((cnt, k) => [`${formatValue(stats.lo + k * stats.binW)} to ${formatValue(stats.lo + (k + 1) * stats.binW)}`, cnt, formatPercent(cnt / Math.max(1, stats.n), 1)]),
    [stats, formatValue],
  );
  const tableCols = useMemo(() => [`Range${unit ? ` (${unit})` : ""}`, "Count", "Share"], [unit]);
  const summary = `${ariaLabel}: ${stats.n} values, ${stats.pins.map((pin) => `${pin.id} ${fmt(pin.v)}`).join(", ")}${threshold !== null && threshold !== undefined ? `, ${shareText(threshold).text} ${fmt(threshold)}` : ""}`;

  return (
    <div ref={rootRef} data-loop="idle" className={cn("relative w-full select-none text-[color:var(--bjork-text)]", className)} style={{ ...vars, height }}>
      <div
        ref={wrapperRef}
        role="group"
        aria-roledescription="chart"
        aria-label={`${ariaLabel}. Left and right move the threshold one bin, Shift moves ten, brackets change the bin count.`}
        tabIndex={0}
        onPointerEnter={() => {
          if (wrapperRef.current) rectRef.current = wrapperRef.current.getBoundingClientRect();
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => setHoverBin(null, null)}
        onKeyDown={onKeyDown}
        className={cn("absolute inset-0 cursor-crosshair touch-pan-y rounded-[10px]", chartFocusRing)}
      >
        <div ref={hostRef} className="absolute inset-0">
          <canvas ref={canvasRef} role="img" aria-label={summary} className="pointer-events-none absolute left-0 top-0" />
        </div>
        <LabelPool count={Y_LABELS} pool={yPool} />
        <LabelPool count={X_LABELS} pool={xPool} />
        <LabelPool count={PIN_LABELS} pool={pinPool} className="font-mono text-[10px] leading-none tabular-nums text-[color:var(--bjork-text-muted)] [text-box:trim-both_cap_alphabetic]" />
        {threshold !== null && threshold !== undefined && (
          <div
            ref={handleRef}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 flex h-[22px] cursor-ew-resize items-center gap-1.5 whitespace-nowrap rounded-[11px] bg-[color:var(--bjork-accent-fill)] px-2 font-mono text-[11px] leading-none tabular-nums text-[color:var(--bjork-accent-foreground)] opacity-0"
          >
            <span ref={handleValueRef} className="[text-box:trim-both_cap_alphabetic]" />
            <span aria-hidden="true" className="opacity-60">
              {"·"}
            </span>
            <span ref={shareRef} className="[text-box:trim-both_cap_alphabetic]" />
          </div>
        )}
        <HoverTooltip ref={tipRef} onMeasure={wake} />
      </div>
      <ChartTable caption={ariaLabel} columns={tableCols} rows={tableRows} />
      <ChartAnnouncer ref={announcer} />
    </div>
  );
}

// Seeded demo samples: "latency" is lognormal with a slow tail, "bimodal" is two clusters.
export function createDistributionSample(seed: number, kind: "latency" | "bimodal", n = 2000): number[] {
  const rnd = mulberry32(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (kind === "latency") {
      const slow = rnd() < 0.06;
      const v = Math.exp(Math.log(slow ? 320 : 168) + gaussian(rnd) * (slow ? 0.26 : 0.24));
      out.push(Math.min(v, 590));
    } else {
      const a = rnd() < 0.62;
      out.push(a ? 210 + gaussian(rnd) * 34 : 420 + gaussian(rnd) * 48);
    }
  }
  return out;
}
