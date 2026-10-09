"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useChartCanvas, easeOut, roundRectPath, writeLabels, type PlacedLabel } from "@/components/bjork-ui/charts/_kit/canvas";
import {
  useChartTheme,
  chartFocusRing,
  ChartTable,
  LabelPool,
  LegendKey,
  placeTooltip,
  HoverTooltip,
  ChartAnnouncer,
  type TooltipHandle,
  type AnnouncerHandle,
  type TooltipContent,
  type TooltipRow,
} from "@/components/bjork-ui/charts/_kit/chrome";
import { clamp, crisp, damp, niceDomain, niceTicks, timeTicks, withAlpha, formatCompact, formatPercent } from "@/components/bjork-ui/charts/_kit/scale";
import { CHART_OTHER, MAX_SERIES, foldSeries, seriesColor } from "@/components/bjork-ui/charts/_kit/series";

export interface AreaSeries {
  id: string;
  label: string;
  /** One value per entry in `times`. Missing, non-finite and negative values count as zero. */
  values: number[];
}

export type StackedAreaMode = "stacked" | "percent" | "lines";

export interface StackedAreaChartProps {
  /** Shared time axis in UTC milliseconds, ascending. */
  times: number[];
  /** Series in stack order, first at the bottom. Colour follows this index. Past six, the rest fold into "Other". */
  series: AreaSeries[];
  /** "stacked" (default) shows the total, "percent" each part's share, "lines" the parts unstacked. */
  mode?: StackedAreaMode;
  /** Hidden series ids, controlled. Toggled from the legend; the last visible series cannot be hidden. */
  hidden?: string[];
  defaultHidden?: string[];
  onHiddenChange?: (hidden: string[]) => void;
  /** Brushed window [start, end] in UTC ms, controlled. Defaults to the whole axis. */
  range?: [number, number];
  defaultRange?: [number, number];
  /** Called when the user settles a new window (drag end, click, keyboard), not on every pointer move. */
  onRangeChange?: (range: [number, number]) => void;
  /** The overview strip with the draggable window under the plot. */
  brush?: boolean;
  formatValue?: (v: number) => string;
  /** Date text for the tooltip, table and announcements. */
  formatTime?: (t: number) => string;
  /** How the table twin rolls up more than 120 points into weeks or months. */
  tableAggregate?: "mean" | "sum" | "last";
  /** Posed crosshair by point index. */
  activeIndex?: number | null;
  /** Posed crosshair by time (nearest point). */
  activeTime?: number | null;
  height?: number;
  ariaLabel?: string;
  tone?: BjorkTone;
  className?: string;
}

const PAD_R = 8;
const LEGEND_GAP = 18;
const AXIS_H = 24;
const BRUSH_H = 36;
const BRUSH_GAP = 8;
const TAU = 0.14;
const VIEW_TAU = 0.12;
const ENTER_MS = 720;
const Y_LABELS = 8;
const X_LABELS = 16;
const MIN_POINTS = 7;
const TABLE_MAX_ROWS = 120;
const DAY = 86400000;
const FILL_ALPHA: Record<BjorkTone, number> = { dark: 0.5, light: 0.46 };
const OTHER_ID = "__other";

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const weekFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const defaultFormatValue = (v: number) => formatCompact(v, 1);
const defaultFormatTime = (t: number) => dateFmt.format(t);
const formatShare = (f: number) => formatPercent(f, f > 0 && f < 0.1 ? 1 : 0);

// First index with a[k] >= x.
function lowerBound(a: number[], x: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function nearestIndex(a: number[], t: number): number {
  const n = a.length;
  if (!n) return -1;
  let k = lowerBound(a, t);
  if (k >= n) k = n - 1;
  else if (k > 0 && t - a[k - 1] < a[k] - t) k--;
  return k;
}

function clampWindow(a: number, b: number, d0: number, d1: number, minSpan: number): [number, number] {
  const full = d1 - d0;
  let w = b - a;
  if (!Number.isFinite(w)) w = full;
  w = clamp(w, Math.min(minSpan, full), full);
  let s = Number.isFinite(a) ? a : d0;
  if (s < d0) s = d0;
  if (s + w > d1) s = d1 - w;
  return [s, s + w];
}

function measure(ctx: CanvasRenderingContext2D, cache: Map<string, number>, font: string, text: string): number {
  const key = `${font}|${text}`;
  let w = cache.get(key);
  if (w === undefined) {
    ctx.font = font;
    w = ctx.measureText(text).width;
    if (cache.size > 600) cache.clear();
    cache.set(key, w);
  }
  return w;
}

// Monotone cubic tangents (as d3's curveMonotoneX) for row `off` over [a, b]: no overshoot, so
// a band never dips below its neighbour and shared edges trace the same curve both ways.
function monoTangents(xs: Float64Array, ys: Float64Array, off: number, a: number, b: number, m: Float64Array) {
  if (b <= a) {
    m[a] = 0;
    return;
  }
  const secant = (k: number) => {
    const h = xs[k + 1] - xs[k];
    return h ? (ys[off + k + 1] - ys[off + k]) / h : 0;
  };
  if (b - a === 1) {
    m[a] = m[b] = secant(a);
    return;
  }
  for (let k = a + 1; k < b; k++) {
    const h0 = xs[k] - xs[k - 1];
    const h1 = xs[k + 1] - xs[k];
    const s0 = secant(k - 1);
    const s1 = secant(k);
    const p = h0 + h1 ? (s0 * h1 + s1 * h0) / (h0 + h1) : 0;
    m[k] = (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  }
  m[a] = (3 * secant(a) - m[a + 1]) / 2;
  m[b] = (3 * secant(b - 1) - m[b - 1]) / 2;
}

// Traces row `off` over [a, b] with the tangents in `m`, forward (moveTo first) or backward (lineTo first).
function traceEdge(ctx: CanvasRenderingContext2D, xs: Float64Array, ys: Float64Array, off: number, a: number, b: number, m: Float64Array, reverse: boolean) {
  if (!reverse) {
    ctx.moveTo(xs[a], ys[off + a]);
    for (let k = a; k < b; k++) {
      const d = (xs[k + 1] - xs[k]) / 3;
      ctx.bezierCurveTo(xs[k] + d, ys[off + k] + m[k] * d, xs[k + 1] - d, ys[off + k + 1] - m[k + 1] * d, xs[k + 1], ys[off + k + 1]);
    }
  } else {
    ctx.lineTo(xs[b], ys[off + b]);
    for (let k = b; k > a; k--) {
      const d = (xs[k] - xs[k - 1]) / 3;
      ctx.bezierCurveTo(xs[k] - d, ys[off + k] - m[k] * d, xs[k - 1] + d, ys[off + k - 1] + m[k - 1] * d, xs[k - 1], ys[off + k - 1]);
    }
  }
}

interface Clean {
  id: string;
  label: string;
  values: number[];
}

interface Run {
  ready: boolean;
  enter: number;
  vis: number[];
  emph: number[];
  pct: number;
  lines: number;
  hi: number;
  gutter: number;
  gutterKey: string;
  gutterT: number;
  vs: number;
  ve: number;
  ts: number;
  te: number;
  col: number | null;
  source: "pointer" | "keyboard" | "prop" | null;
  plot: { l: number; r: number; t: number; b: number; ot: number; ob: number };
  legendW: number;
  legendH: number;
  legendKey: string;
  drag: null | { mode: "move" | "left" | "right"; x: number; vs: number; ve: number; id: number };
  focusId: string | null;
  yCache: string[];
  xCache: string[];
  inCache: string[];
  endCache: string[];
  fonts: { mono: string; alpha: string } | null;
  widths: Map<string, number>;
  xs: Float64Array;
  los: Float64Array;
  his: Float64Array;
  tan: Float64Array;
  tot: Float64Array;
}

export function StackedAreaChart({
  times,
  series,
  mode = "stacked",
  hidden: hiddenProp,
  defaultHidden,
  onHiddenChange,
  range,
  defaultRange,
  onRangeChange,
  brush = true,
  formatValue = defaultFormatValue,
  formatTime = defaultFormatTime,
  tableAggregate = "mean",
  activeIndex,
  activeTime,
  height = 400,
  ariaLabel = "Stacked area chart",
  tone: toneProp,
  className,
}: StackedAreaChartProps) {
  const { tone, pal, reduce, vars } = useChartTheme(toneProp);
  const announcer = useRef<AnnouncerHandle>(null);
  const tipRef = useRef<TooltipHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const legendBtns = useRef<(HTMLButtonElement | null)[]>([]);
  const startRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const yPool = useRef<(HTMLSpanElement | null)[]>([]);
  const xPool = useRef<(HTMLSpanElement | null)[]>([]);
  const inPool = useRef<(HTMLSpanElement | null)[]>([]);
  const endPool = useRef<(HTMLSpanElement | null)[]>([]);
  const rectRef = useRef<DOMRect | null>(null);
  const tableTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const n = times.length;

  // Sanitised, folded series. Colour stays with the caller's index; "Other" takes the neutral.
  const folded = series.length > MAX_SERIES;
  const data = useMemo<Clean[]>(() => {
    const clean = series.map((s) => ({
      id: s.id,
      label: s.label,
      values: times.map((_, j) => {
        const v = s.values[j];
        return Number.isFinite(v) && v > 0 ? v : 0;
      }),
    }));
    return foldSeries(clean, MAX_SERIES, (rest) => ({
      id: OTHER_ID,
      label: "Other",
      values: times.map((_, j) => rest.reduce((sum, r) => sum + r.values[j], 0)),
    }));
  }, [series, times]);
  const colors = useMemo(() => data.map((_, i) => (folded && i === MAX_SERIES - 1 ? CHART_OTHER[tone] : seriesColor(tone, i))), [data, folded, tone]);

  const domain = useMemo<[number, number]>(() => {
    if (!n) return [0, DAY];
    const a = times[0];
    const b = times[n - 1];
    return b > a ? [a, b] : [a - DAY / 2, a + DAY / 2];
  }, [times, n]);
  // Typical spacing, for keyboard steps and the narrowest window.
  const stepMs = useMemo(() => {
    if (n < 2) return DAY;
    const diffs: number[] = [];
    for (let j = 1; j < n; j++) diffs.push(times[j] - times[j - 1]);
    diffs.sort((a, b) => a - b);
    return Math.max(1, diffs[diffs.length >> 1]);
  }, [times, n]);
  const minSpan = Math.min(domain[1] - domain[0], stepMs * (MIN_POINTS - 1));

  const [hiddenState, setHiddenState] = useState<string[]>(defaultHidden ?? []);
  const hiddenList = hiddenProp ?? hiddenState;
  const hiddenSet = useMemo(() => {
    const set = new Set(hiddenList);
    // Never hide everything.
    return data.every((s) => set.has(s.id)) ? new Set<string>() : set;
  }, [hiddenList, data]);
  const visibleCount = data.filter((s) => !hiddenSet.has(s.id)).length;

  const initWindow = useMemo(() => {
    const r = range ?? defaultRange ?? domain;
    return clampWindow(r[0], r[1], domain[0], domain[1], minSpan);
    // Only the first render's window seeds the state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [tableRange, setTableRange] = useState<[number, number]>(initWindow);

  const legendKey = `${data.map((s) => s.label).join("|")}|${mode}`;
  const cfg = useRef({ times, data, colors, hiddenSet, mode, pal, tone, reduce, formatValue, formatTime, brush, domain, legendKey, minSpan });
  useEffect(() => {
    cfg.current = { times, data, colors, hiddenSet, mode, pal, tone, reduce, formatValue, formatTime, brush, domain, legendKey, minSpan };
  });

  const st = useRef<Run>({
    ready: false,
    enter: 0,
    vis: [],
    emph: [],
    pct: 0,
    lines: 0,
    hi: 1,
    gutter: 32,
    gutterKey: "",
    gutterT: 32,
    vs: initWindow[0],
    ve: initWindow[1],
    ts: initWindow[0],
    te: initWindow[1],
    col: null,
    source: null,
    plot: { l: 0, r: 0, t: 0, b: 0, ot: 0, ob: 0 },
    legendW: -1,
    legendH: 0,
    legendKey: "",
    drag: null,
    focusId: null,
    yCache: [],
    xCache: [],
    inCache: [],
    endCache: [],
    fonts: null,
    widths: new Map(),
    xs: new Float64Array(0),
    los: new Float64Array(0),
    his: new Float64Array(0),
    tan: new Float64Array(0),
    tot: new Float64Array(0),
  });

  const { rootRef, hostRef, canvasRef, wake } = useChartCanvas(({ ctx, w, h, dt }) => {
    const s = st.current;
    const c = cfg.current;
    const p = c.pal;
    const T = c.times;
    const N = T.length;
    const D = c.data;
    const S = D.length;
    const [d0, d1] = c.domain;
    const full = d1 - d0;

    if (!s.fonts) {
      const a = yPool.current[0];
      const b = inPool.current[0];
      if (a && b) {
        const fa = getComputedStyle(a);
        const fb = getComputedStyle(b);
        s.fonts = { mono: `${fa.fontWeight} ${fa.fontSize} ${fa.fontFamily}`, alpha: `${fb.fontWeight} ${fb.fontSize} ${fb.fontFamily}` };
      }
    }
    const mono = s.fonts?.mono ?? "400 10px monospace";
    const alphaFont = s.fonts?.alpha ?? "500 11px sans-serif";
    const tw = (font: string, text: string) => measure(ctx, s.widths, font, text);

    // The legend wraps on narrow widths; the plot starts under it.
    if (s.legendW !== w || s.legendKey !== c.legendKey) {
      s.legendW = w;
      s.legendKey = c.legendKey;
      s.legendH = legendRef.current?.offsetHeight ?? 0;
    }

    // Scratch buffers, grown only when the data grows.
    if (s.xs.length < N) {
      s.xs = new Float64Array(N);
      s.tan = new Float64Array(Math.max(N, MAX_SERIES));
      s.tot = new Float64Array(N);
    }
    if (s.los.length < N * S) {
      s.los = new Float64Array(N * S);
      s.his = new Float64Array(N * S);
    }

    const first = !s.ready || c.reduce;
    let moving = false;
    const approach = (cur: number, target: number, tau: number, tol: number) => {
      if (first || !Number.isFinite(cur)) return target;
      const v = damp(cur, target, tau, dt);
      if (Math.abs(v - target) > tol) {
        moving = true;
        return v;
      }
      return target;
    };

    const focusIdx = s.focusId ? D.findIndex((d) => d.id === s.focusId && !c.hiddenSet.has(d.id)) : -1;
    for (let i = 0; i < S; i++) {
      const visT = c.hiddenSet.has(D[i].id) ? 0 : 1;
      s.vis[i] = approach(s.vis[i] ?? visT, visT, TAU, 1e-3);
      const emT = focusIdx < 0 ? 1 : i === focusIdx ? 1.45 : 0.4;
      s.emph[i] = approach(s.emph[i] ?? emT, emT, TAU * 0.7, 1e-3);
    }
    s.vis.length = S;
    s.emph.length = S;
    const pctT = c.mode === "percent" ? 1 : 0;
    const linesT = c.mode === "lines" ? 1 : 0;
    s.pct = approach(s.pct, pctT, TAU, 1e-3);
    s.lines = approach(s.lines, linesT, TAU, 1e-3);
    if (c.reduce || s.drag || first) {
      s.vs = s.ts;
      s.ve = s.te;
    } else {
      s.vs = approach(s.vs, s.ts, VIEW_TAU, full * 1e-5);
      s.ve = approach(s.ve, s.te, VIEW_TAU, full * 1e-5);
    }

    // Layout, bottom up: brush strip, axis labels, plot.
    const brushOn = c.brush && N > 1;
    const top = s.legendH > 0 ? s.legendH + LEGEND_GAP : 12;
    const ob = h - 1;
    const ot = brushOn ? ob - BRUSH_H : ob;
    const plotB = Math.max(top + 20, (brushOn ? ot - BRUSH_GAP : h) - AXIS_H);
    const pH = Math.max(1, plotB - top);
    const yCount = clamp(Math.round(pH / 56), 2, 6);

    // Points in the window, plus one outside each edge so the curves run off the plot.
    const i0 = Math.max(0, lowerBound(T, s.vs) - 1);
    const i1 = Math.min(N - 1, lowerBound(T, s.ve));

    // Target y domain over the window, from the target visibility, so it heads straight for its end.
    let maxV = 0;
    for (let j = i0; j <= i1; j++) {
      let tot = 0;
      let mx = 0;
      for (let i = 0; i < S; i++) {
        if (c.hiddenSet.has(D[i].id)) continue;
        const v = D[i].values[j];
        tot += v;
        if (v > mx) mx = v;
      }
      const m = linesT ? mx : tot;
      if (m > maxV) maxV = m;
    }
    const hiT = maxV > 0 ? niceDomain(0, maxV * 1.04, yCount)[1] : 1;
    s.hi = approach(s.hi, hiT, TAU, hiT * 1e-4);

    // Left gutter fits the widest target tick label, then glides there.
    const gk = `${hiT}|${yCount}|${pctT}|${s.fonts ? 1 : 0}`;
    if (s.gutterKey !== gk) {
      s.gutterKey = gk;
      const labels = pctT ? ["100%"] : niceTicks(0, hiT, yCount).map((v) => c.formatValue(v));
      let mw = 0;
      for (const l of labels) mw = Math.max(mw, tw(mono, l));
      s.gutterT = Math.max(24, Math.ceil(mw) + 10);
    }
    s.gutter = approach(s.gutter, s.gutterT, TAU, 0.3);
    s.ready = true;

    const plot = { l: Math.round(s.gutter), r: w - PAD_R, t: top, b: plotB, ot, ob };
    s.plot = plot;
    const pW = Math.max(1, plot.r - plot.l);
    const span = Math.max(1e-9, s.ve - s.vs);
    const xOf = (t: number) => plot.l + ((t - s.vs) / span) * pW;

    s.enter = c.reduce ? 1 : Math.min(1, s.enter + (dt * 1000) / ENTER_MS);
    const e = easeOut(s.enter);

    // Horizontal grid and y labels. The value and percent sets cross-fade through the mode change.
    const usePct = s.pct >= 0.5;
    const fade = Math.abs(1 - 2 * s.pct);
    const ticks = usePct ? (pH < 120 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]) : niceTicks(0, s.hi, yCount).filter((v) => v <= s.hi * 1.0001);
    const yTick = (v: number) => (usePct ? plot.b - v * pH : plot.b - (v / s.hi) * pH);
    ctx.lineWidth = 1;
    ctx.strokeStyle = p.hair;
    ctx.globalAlpha = fade;
    ctx.beginPath();
    for (const v of ticks) {
      if (v <= 0) continue;
      const y = crisp(yTick(v));
      ctx.moveTo(plot.l, y);
      ctx.lineTo(plot.r, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    writeLabels(
      yPool.current,
      s.yCache,
      ticks.map((v) => ({ text: usePct ? formatPercent(v) : c.formatValue(v), x: plot.l - 8, y: yTick(v), ax: -100, opacity: fade })),
    );

    // Edge geometry for every series over the window, in screen space. When the window holds more
    // than one point per 3px, the drawing uses bucket means (buckets aligned to absolute indices,
    // so panning never shimmers; every series shares them, so the stack stays consistent). The
    // crosshair, tooltip and keyboard still read the true points.
    const xs = s.xs;
    const los = s.los;
    const his = s.his;
    const kL = 1 - s.lines;
    const B = Math.max(1, Math.ceil((i1 - i0 + 1) / Math.max(1, pW / 3)));
    const k0 = Math.max(0, Math.floor(i0 / B) - (B > 1 ? 1 : 0));
    const k1 = Math.min(Math.floor((N - 1) / B), Math.floor(Math.max(0, i1) / B) + (B > 1 ? 1 : 0));
    const R = N ? k1 - k0 + 1 : 0;
    for (let r = 0; r < R; r++) {
      const ja = (k0 + r) * B;
      const jb = Math.min(N - 1, ja + B - 1);
      const cnt = jb - ja + 1;
      let tm = 0;
      for (let j = ja; j <= jb; j++) tm += T[j];
      xs[r] = xOf(tm / cnt);
      // s.tan doubles as per-series scratch here; the tangents overwrite it later.
      let tot = 0;
      for (let i = 0; i < S; i++) {
        let v = 0;
        for (let j = ja; j <= jb; j++) v += D[i].values[j];
        v = (v / cnt) * s.vis[i];
        s.tan[i] = v;
        tot += v;
      }
      let cum = 0;
      let cumP = 0;
      for (let i = 0; i < S; i++) {
        const v = s.tan[i];
        const share = tot > 0 ? v / tot : 0;
        const b0 = cum * kL;
        const aS = plot.b - (b0 / s.hi) * pH;
        const bS = plot.b - ((b0 + v) / s.hi) * pH;
        const aP = plot.b - cumP * pH;
        const bP = plot.b - (cumP + share) * pH;
        let ya = aS + (aP - aS) * s.pct;
        let yb = bS + (bP - bS) * s.pct;
        if (e < 1) {
          ya = plot.b + (ya - plot.b) * e;
          yb = plot.b + (yb - plot.b) * e;
        }
        los[i * N + r] = ya;
        his[i * N + r] = yb;
        cum += v;
        cumP += share;
      }
    }
    const ra = 0;
    const rb = R - 1;

    let topVis = -1;
    for (let i = S - 1; i >= 0; i--) {
      if (s.vis[i] > 0.01) {
        topVis = i;
        break;
      }
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.l, plot.t - 3, pW, pH + 3);
    ctx.clip();
    ctx.lineJoin = "round";
    if (rb > ra && S) {
      const fillBase = FILL_ALPHA[c.tone];
      for (let i = 0; i < S; i++) {
        if (s.vis[i] <= 0.01) continue;
        const em = s.emph[i];
        const col = c.colors[i];
        ctx.beginPath();
        monoTangents(xs, his, i * N, ra, rb, s.tan);
        traceEdge(ctx, xs, his, i * N, ra, rb, s.tan, false);
        monoTangents(xs, los, i * N, ra, rb, s.tan);
        traceEdge(ctx, xs, los, i * N, ra, rb, s.tan, true);
        ctx.closePath();
        const fa = Math.min(0.85, fillBase * em) * kL;
        if (fa > 0.003) {
          ctx.fillStyle = withAlpha(col, fa);
          ctx.fill();
        }
        if (kL > 0.5) {
          // The top stroke is clipped to its own band, so it never spills onto a neighbour.
          ctx.save();
          ctx.clip();
          ctx.beginPath();
          monoTangents(xs, his, i * N, ra, rb, s.tan);
          traceEdge(ctx, xs, his, i * N, ra, rb, s.tan, false);
          ctx.lineWidth = i < topVis ? 5 : 3;
          ctx.strokeStyle = withAlpha(col, clamp(0.3 + 0.7 * em, 0, 1));
          ctx.stroke();
          ctx.restore();
        }
      }
      // 2px surface seams between neighbouring bands.
      if (kL > 0.01) {
        ctx.strokeStyle = withAlpha(p.stage, kL);
        ctx.lineWidth = 2;
        for (let i = 0; i < topVis; i++) {
          if (s.vis[i] <= 0.01) continue;
          ctx.beginPath();
          monoTangents(xs, his, i * N, ra, rb, s.tan);
          traceEdge(ctx, xs, his, i * N, ra, rb, s.tan, false);
          ctx.stroke();
        }
      }
      if (kL <= 0.5) {
        ctx.lineWidth = 2;
        for (let i = 0; i < S; i++) {
          if (s.vis[i] <= 0.01) continue;
          ctx.beginPath();
          monoTangents(xs, his, i * N, ra, rb, s.tan);
          traceEdge(ctx, xs, his, i * N, ra, rb, s.tan, false);
          ctx.strokeStyle = withAlpha(c.colors[i], s.vis[i] * clamp(0.3 + 0.7 * s.emph[i], 0, 1));
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    // Baseline.
    ctx.strokeStyle = p.textFaint;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.l, crisp(plot.b));
    ctx.lineTo(plot.r, crisp(plot.b));
    ctx.stroke();

    // Calendar x ticks for the window; labels clamp inside the box and drop on collision.
    const xt = timeTicks(s.vs, s.ve, pW, w < 520 ? 60 : 84);
    const xl: PlacedLabel[] = [];
    let lastR = -Infinity;
    ctx.strokeStyle = p.hair;
    ctx.beginPath();
    for (const tk of xt) {
      const x = xOf(tk.t);
      if (x < plot.l - 0.5 || x > plot.r + 0.5) continue;
      ctx.moveTo(crisp(x), plot.b + 1);
      ctx.lineTo(crisp(x), plot.b + 5);
      const hw = tw(mono, tk.label) / 2;
      const cx = clamp(x, hw + 1, w - hw - 1);
      if (cx - hw < lastR + 8) continue;
      lastR = cx + hw;
      xl.push({ text: tk.label, x: cx, y: plot.b + 14, ax: -50 });
    }
    ctx.stroke();
    writeLabels(xPool.current, s.xCache, xl);

    // Direct labels inside bands, at the thickest stretch that fits the label.
    const inItems: PlacedLabel[] = [];
    const endItems: PlacedLabel[] = [];
    const labelIn = clamp((s.enter - 0.7) / 0.3, 0, 1);
    if (rb - ra >= 2 && kL > 0.02) {
      // Pixels per drawn point, to turn the label's half width into a reach in points.
      const per = (xs[rb] - xs[ra]) / Math.max(1, rb - ra);
      const stride = Math.max(1, Math.floor((rb - ra) / 90));
      for (let i = 0; i < S; i++) {
        if (s.vis[i] < 0.5 || c.hiddenSet.has(D[i].id)) continue;
        const text = D[i].label;
        const half = tw(alphaFont, text) / 2 + 5;
        const reach = Math.max(1, Math.round(half / Math.max(0.1, per)));
        let best = -1;
        let bestT = 0;
        for (let j = ra + 1; j < rb; j += stride) {
          const x = xs[j];
          if (x - half < plot.l + 2 || x + half > plot.r - 2) continue;
          const a = Math.max(ra, j - reach);
          const b = Math.min(rb, j + reach);
          const o = i * N;
          const ma = (a + j) >> 1;
          const mb = (j + b) >> 1;
          const t = Math.min(los[o + a] - his[o + a], los[o + ma] - his[o + ma], los[o + j] - his[o + j], los[o + mb] - his[o + mb], los[o + b] - his[o + b]);
          if (t > bestT) {
            bestT = t;
            best = j;
          }
        }
        if (best >= 0 && bestT >= 16) {
          inItems.push({
            text,
            x: xs[best],
            y: (los[i * N + best] + his[i * N + best]) / 2,
            ax: -50,
            opacity: kL * labelIn * (s.emph[i] < 0.95 ? 0.5 : 1),
          });
        }
      }
    }
    // Lines mode: labels at the right end, pushed apart, when there are few enough lines.
    if (s.lines > 0.02 && visibleCountOf(c.hiddenSet, D) <= 4 && rb > ra) {
      let jEnd = rb;
      while (jEnd > ra && xs[jEnd] > plot.r) jEnd--;
      const ys: { text: string; y: number; o: number }[] = [];
      for (let i = 0; i < S; i++) {
        if (s.vis[i] < 0.5 || c.hiddenSet.has(D[i].id)) continue;
        ys.push({ text: D[i].label, y: his[i * N + jEnd] - 9, o: s.emph[i] < 0.95 ? 0.5 : 1 });
      }
      ys.sort((a, b) => a.y - b.y);
      for (let k = 1; k < ys.length; k++) if (ys[k].y - ys[k - 1].y < 13) ys[k].y = ys[k - 1].y + 13;
      const over = ys.length ? ys[ys.length - 1].y - (plot.b - 8) : 0;
      for (const it of ys) {
        const y = Math.max(plot.t + 4, it.y - Math.max(0, over));
        endItems.push({ text: it.text, x: plot.r - 4, y, ax: -100, opacity: s.lines * labelIn * it.o });
      }
    }
    writeLabels(inPool.current, s.inCache, inItems);
    writeLabels(endPool.current, s.endCache, endItems);

    // Crosshair: rule, a dot on each visible top edge, tooltip beside it.
    const tip = tipRef.current;
    const col = s.col;
    if (col !== null && col >= 0 && col < N && R > 0 && T[col] >= s.vs - span * 1e-6 && T[col] <= s.ve + span * 1e-6) {
      const x = xOf(T[col]);
      // Dots sit on the drawn edge: the exact point, or the resampled curve when bucketed.
      let rr = 0;
      while (rr < rb && xs[rr + 1] < x) rr++;
      const f = rr < rb && xs[rr + 1] > xs[rr] ? clamp((x - xs[rr]) / (xs[rr + 1] - xs[rr]), 0, 1) : 0;
      ctx.strokeStyle = withAlpha(p.text, 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(crisp(x) - 0.5, plot.t - 4);
      ctx.lineTo(crisp(x) - 0.5, plot.b);
      ctx.stroke();
      for (let i = 0; i < S; i++) {
        if (s.vis[i] < 0.5) continue;
        ctx.beginPath();
        ctx.arc(x, his[i * N + rr] + (rr < rb ? (his[i * N + rr + 1] - his[i * N + rr]) * f : 0), 3, 0, Math.PI * 2);
        ctx.fillStyle = c.colors[i];
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = p.stage;
        ctx.stroke();
      }
      if (tip?.el) {
        tip.el.style.visibility = "visible";
        const pos = placeTooltip(x, plot.t + 6, tip.size.w, tip.size.h, w, Math.max(plot.b + 8, plot.t + 6 + tip.size.h), 14);
        tip.el.style.transform = `translate3d(${pos.x}px, ${Math.max(plot.t, pos.y)}px, 0)`;
      }
    } else if (tip?.el) tip.el.style.visibility = "hidden";

    // Overview strip: the total over the whole axis, with the brushed window.
    if (brushOn) {
      const oT = ot;
      const oH = ob - ot;
      ctx.fillStyle = withAlpha(p.text, 0.03);
      ctx.beginPath();
      roundRectPath(ctx, plot.l, oT, pW, oH, 6, 6);
      ctx.fill();
      const oxOf = (t: number) => plot.l + ((t - d0) / full) * pW;
      let maxTot = 0;
      for (let j = 0; j < N; j++) {
        let tot = 0;
        for (let i = 0; i < S; i++) tot += D[i].values[j] * s.vis[i];
        s.tot[j] = tot;
        if (tot > maxTot) maxTot = tot;
      }
      const base = ob - 2;
      const oy = (v: number) => base - (maxTot > 0 ? v / maxTot : 0) * (oH - 8);
      // One vertex per pixel column, keeping each column's peak.
      const tracePeaks = () => {
        let px = -1;
        let pm = 0;
        let started = false;
        for (let j = 0; j < N; j++) {
          const x = Math.round(oxOf(T[j]));
          if (x !== px) {
            if (px >= 0) {
              if (!started) {
                ctx.moveTo(px, oy(pm));
                started = true;
              } else ctx.lineTo(px, oy(pm));
            }
            px = x;
            pm = s.tot[j];
          } else if (s.tot[j] > pm) pm = s.tot[j];
        }
        if (!started) ctx.moveTo(px, oy(pm));
        else ctx.lineTo(px, oy(pm));
      };
      ctx.beginPath();
      tracePeaks();
      ctx.lineTo(plot.r, base);
      ctx.lineTo(plot.l, base);
      ctx.closePath();
      ctx.fillStyle = withAlpha(p.text, 0.1);
      ctx.fill();
      ctx.beginPath();
      tracePeaks();
      ctx.strokeStyle = withAlpha(p.text, 0.32);
      ctx.lineWidth = 1;
      ctx.stroke();

      const bx0 = oxOf(s.vs);
      const bx1 = oxOf(s.ve);
      const whole = s.vs <= d0 + full * 1e-6 && s.ve >= d1 - full * 1e-6;
      if (!whole) {
        ctx.fillStyle = withAlpha(p.stage, 0.62);
        ctx.fillRect(plot.l, oT, bx0 - plot.l, oH);
        ctx.fillRect(bx1, oT, plot.r - bx1, oH);
      }
      ctx.fillStyle = withAlpha(p.accent, whole ? 0.05 : 0.08);
      ctx.fillRect(bx0, oT, bx1 - bx0, oH);
      ctx.strokeStyle = withAlpha(p.accentInk, whole ? 0.45 : 0.9);
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(bx0) + 0.5, oT + 0.5, Math.max(1, Math.round(bx1 - bx0) - 1), oH - 1);
      for (const gx of [bx0, bx1]) {
        ctx.fillStyle = p.accent;
        ctx.beginPath();
        roundRectPath(ctx, gx - 2.5, oT + oH / 2 - 8, 5, 16, 2.5, 2.5);
        ctx.fill();
      }
      const hs = startRef.current;
      const he = endRef.current;
      const hb = bodyRef.current;
      if (hs) hs.style.transform = `translate3d(${(bx0 - 8).toFixed(1)}px, ${oT}px, 0)`;
      if (he) he.style.transform = `translate3d(${(bx1 - 8).toFixed(1)}px, ${oT}px, 0)`;
      if (hb) {
        hb.style.transform = `translate3d(${bx0.toFixed(1)}px, ${oT}px, 0)`;
        hb.style.width = `${Math.max(0, bx1 - bx0).toFixed(1)}px`;
      }
    }

    return moving || s.enter < 1 || !!s.drag;
  });

  // Fonts landing changes every measurement.
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;
    let live = true;
    document.fonts.ready.then(() => {
      if (!live) return;
      const s = st.current;
      s.widths.clear();
      s.fonts = null;
      s.gutterKey = "";
      s.legendW = -1;
      wake();
    });
    return () => {
      live = false;
    };
  }, [wake]);

  const syncAria = () => {
    const s = st.current;
    const [d0, d1] = domain;
    const set = (el: HTMLElement | null, now: number, text: string) => {
      if (!el) return;
      el.setAttribute("aria-valuemin", String(Math.round(d0)));
      el.setAttribute("aria-valuemax", String(Math.round(d1)));
      el.setAttribute("aria-valuenow", String(Math.round(now)));
      el.setAttribute("aria-valuetext", text);
    };
    set(startRef.current, s.ts, formatTime(s.ts));
    set(endRef.current, s.te, formatTime(s.te));
    set(bodyRef.current, s.ts, `${formatTime(s.ts)} to ${formatTime(s.te)}`);
  };

  const scheduleTable = () => {
    if (tableTimer.current) clearTimeout(tableTimer.current);
    tableTimer.current = setTimeout(() => {
      const s = st.current;
      setTableRange((prev) => (prev[0] === s.ts && prev[1] === s.te ? prev : [s.ts, s.te]));
    }, 160);
  };
  useEffect(
    () => () => {
      if (tableTimer.current) clearTimeout(tableTimer.current);
    },
    [],
  );

  const setView = (a: number, b: number, commit: boolean) => {
    const s = st.current;
    [s.ts, s.te] = clampWindow(a, b, domain[0], domain[1], minSpan);
    syncAria();
    if (commit) {
      onRangeChange?.([s.ts, s.te]);
      scheduleTable();
    }
    wake();
  };

  // Controlled window.
  useEffect(() => {
    if (!range) return;
    const s = st.current;
    [s.ts, s.te] = clampWindow(range[0], range[1], domain[0], domain[1], minSpan);
    syncAria();
    scheduleTable();
    wake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.[0], range?.[1], wake]);

  // A new axis keeps the window inside it.
  useEffect(() => {
    const s = st.current;
    [s.ts, s.te] = clampWindow(s.ts, s.te, domain[0], domain[1], minSpan);
    if (s.col !== null && s.col >= n) s.col = null;
    syncAria();
    scheduleTable();
    wake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, minSpan, n, wake]);

  const visibleRows = (j: number) => {
    let tot = 0;
    for (const sr of data) if (!hiddenSet.has(sr.id)) tot += sr.values[j] ?? 0;
    return { tot, rows: data.map((sr, i) => ({ sr, i, v: sr.values[j] ?? 0 })).filter((r) => !hiddenSet.has(r.sr.id)) };
  };

  const tooltipFor = (j: number): TooltipContent | null => {
    if (j < 0 || j >= n) return null;
    const { tot, rows } = visibleRows(j);
    const out: TooltipRow[] = [...rows].reverse().map(({ sr, i, v }) => ({
      key: sr.id,
      label: sr.label,
      value: mode === "percent" ? formatShare(tot > 0 ? v / tot : 0) : formatValue(v),
      color: colors[i],
    }));
    out.push({ key: "__total", label: "Total", value: formatValue(tot) });
    return { key: `${j}|${mode}|${[...hiddenSet].join(",")}|${pal.text}|${data.length}`, title: formatTime(times[j]), rows: out };
  };

  const describe = (j: number) => {
    const { tot, rows } = visibleRows(j);
    const parts = [...rows].reverse().map(({ sr, v }) => `${sr.label} ${mode === "percent" ? formatShare(tot > 0 ? v / tot : 0) : formatValue(v)}`);
    return `${formatTime(times[j])}. Total ${formatValue(tot)}. ${parts.join(", ")}`;
  };

  const setCursor = (j: number | null, source: Run["source"]) => {
    const s = st.current;
    const changed = s.col !== j;
    s.col = j;
    s.source = j === null ? null : source;
    if (changed) tipRef.current?.set(j === null ? null : tooltipFor(j));
    if (changed && j !== null && source === "keyboard") announcer.current?.say(describe(j));
    wake();
  };

  // Refresh an open tooltip when what it shows changes.
  useEffect(() => {
    const s = st.current;
    if (s.col !== null) tipRef.current?.set(tooltipFor(s.col));
    s.gutterKey = "";
    wake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, colors, hiddenSet, mode, pal, reduce, formatValue, formatTime, brush, wake]);

  // Posed crosshair.
  useEffect(() => {
    if (activeIndex === undefined && activeTime === undefined) return;
    const j = activeIndex != null ? clamp(Math.round(activeIndex), 0, n - 1) : activeTime != null ? nearestIndex(times, activeTime) : null;
    setCursor(j !== null && j >= 0 && n ? j : null, "prop");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, activeTime, times, n]);

  useEffect(() => {
    syncAria();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formatTime, brush]);

  const local = (e: PointerEvent<HTMLDivElement>) => {
    const r = rectRef.current ?? wrapperRef.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : null;
  };
  const brushOn = brush && n > 1;
  const inBrush = (x: number, y: number) => {
    const P = st.current.plot;
    return brushOn && y >= P.ot - 6 && y <= P.ob + 4 && x >= P.l - 12 && x <= P.r + 12;
  };
  const brushHit = (x: number, touch: boolean): "left" | "right" | "move" | null => {
    const s = st.current;
    const P = s.plot;
    const [d0, d1] = domain;
    const ox = (t: number) => P.l + ((t - d0) / (d1 - d0)) * (P.r - P.l);
    const bx0 = ox(s.ts);
    const bx1 = ox(s.te);
    const slop = touch ? 16 : 9;
    const dl = Math.abs(x - bx0);
    const dr = Math.abs(x - bx1);
    if (dl <= slop && dl <= dr) return "left";
    if (dr <= slop) return "right";
    if (x > bx0 && x < bx1) return "move";
    return null;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (wrapperRef.current) rectRef.current = wrapperRef.current.getBoundingClientRect();
    const pt = local(e);
    if (!pt) return;
    const s = st.current;
    if (inBrush(pt.x, pt.y)) {
      let mode = brushHit(pt.x, e.pointerType === "touch");
      if (!mode) {
        // Click outside the window: centre it there, then keep dragging it.
        const P = s.plot;
        const t = domain[0] + ((pt.x - P.l) / Math.max(1, P.r - P.l)) * (domain[1] - domain[0]);
        const wv = s.te - s.ts;
        setView(t - wv / 2, t + wv / 2, false);
        mode = "move";
      }
      s.drag = { mode, x: pt.x, vs: s.ts, ve: s.te, id: e.pointerId };
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.style.cursor = mode === "move" ? "grabbing" : "ew-resize";
      if (s.source === "pointer") setCursor(null, null);
      wake();
      return;
    }
    if (e.pointerType === "touch") onPointerMove(e);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const pt = local(e);
    if (!pt) return;
    const s = st.current;
    const P = s.plot;
    const pW = Math.max(1, P.r - P.l);
    if (s.drag && s.drag.id === e.pointerId) {
      const dT = ((pt.x - s.drag.x) / pW) * (domain[1] - domain[0]);
      const { vs, ve } = s.drag;
      if (s.drag.mode === "move") setView(vs + dT, ve + dT, false);
      else if (s.drag.mode === "left") setView(Math.min(vs + dT, ve - minSpan), ve, false);
      else setView(vs, Math.max(ve + dT, vs + minSpan), false);
      return;
    }
    const el = e.currentTarget;
    if (inBrush(pt.x, pt.y)) {
      const hit = brushHit(pt.x, false);
      el.style.cursor = hit === "move" ? "grab" : hit ? "ew-resize" : "pointer";
      if (s.source === "pointer") setCursor(null, null);
      return;
    }
    if (pt.x < P.l || pt.x > P.r || pt.y < P.t - 6 || pt.y > P.b + 4 || !n) {
      el.style.cursor = "";
      if (s.source === "pointer") setCursor(null, null);
      return;
    }
    el.style.cursor = "crosshair";
    const t = s.vs + ((pt.x - P.l) / pW) * (s.ve - s.vs);
    let j = nearestIndex(times, t);
    const a = lowerBound(times, s.vs);
    const b = lowerBound(times, s.ve + 1e-6) - 1;
    if (a <= b) j = clamp(j, a, b);
    setCursor(j, "pointer");
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const s = st.current;
    if (s.drag && s.drag.id === e.pointerId) {
      s.drag = null;
      e.currentTarget.style.cursor = "";
      setView(s.ts, s.te, true);
    }
  };

  const onDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    const r = wrapperRef.current?.getBoundingClientRect();
    if (!r) return;
    if (inBrush(e.clientX - r.left, e.clientY - r.top)) setView(domain[0], domain[1], true);
  };

  // Moves the window so point j is inside it.
  const ensureVisible = (j: number) => {
    const s = st.current;
    const t = times[j];
    const wv = s.te - s.ts;
    if (t < s.ts) setView(t, t + wv, true);
    else if (t > s.te) setView(t - wv, t, true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || !n) return;
    const s = st.current;
    const a = Math.min(n - 1, lowerBound(times, s.ts));
    const b = Math.max(a, lowerBound(times, s.te + 1e-6) - 1);
    const page = Math.max(1, Math.round((b - a + 1) * 0.1));
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") next = s.col === null || s.source === "pointer" ? (e.key === "ArrowRight" ? a : b) : s.col + (e.key === "ArrowRight" ? 1 : -1);
    else if (e.key === "PageUp" || e.key === "PageDown") next = (s.col ?? (e.key === "PageUp" ? a : b)) + (e.key === "PageUp" ? page : -page);
    else if (e.key === "Home") next = a;
    else if (e.key === "End") next = b;
    else if (e.key === "Escape") {
      if (s.col === null) return;
      e.preventDefault();
      setCursor(null, null);
      return;
    }
    if (next === null) return;
    e.preventDefault();
    next = clamp(next, 0, n - 1);
    ensureVisible(next);
    setCursor(next, "keyboard");
  };

  const onSliderKey = (which: "start" | "end" | "window", e: KeyboardEvent<HTMLDivElement>) => {
    const s = st.current;
    const [d0, d1] = domain;
    const big = (d1 - d0) * 0.1;
    let d = 0;
    let to: "min" | "max" | null = null;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") d = -stepMs;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") d = stepMs;
    else if (e.key === "PageDown") d = -big;
    else if (e.key === "PageUp") d = big;
    else if (e.key === "Home") to = "min";
    else if (e.key === "End") to = "max";
    else return;
    e.preventDefault();
    e.stopPropagation();
    const wv = s.te - s.ts;
    if (which === "start") {
      const v = to === "min" ? d0 : to === "max" ? s.te - minSpan : clamp(s.ts + d, d0, s.te - minSpan);
      setView(v, s.te, true);
    } else if (which === "end") {
      const v = to === "min" ? s.ts + minSpan : to === "max" ? d1 : clamp(s.te + d, s.ts + minSpan, d1);
      setView(s.ts, v, true);
    } else {
      const v = to === "min" ? d0 : to === "max" ? d1 - wv : s.ts + d;
      setView(v, v + wv, true);
    }
  };

  const toggle = (id: string) => {
    const off = hiddenSet.has(id);
    if (!off && visibleCount <= 1) return;
    const next = off ? hiddenList.filter((x) => x !== id) : [...hiddenList.filter((x) => x !== id), id];
    if (hiddenProp === undefined) setHiddenState(next);
    onHiddenChange?.(next);
  };

  // Legend hover and focus emphasise a band without re-rendering the chart.
  const emphasise = (id: string | null) => {
    const s = st.current;
    const target = id && !hiddenSet.has(id) ? id : null;
    if (s.focusId === target) return;
    s.focusId = target;
    data.forEach((sr, i) => {
      const el = legendBtns.current[i];
      if (el) el.dataset.dim = target && sr.id !== target ? "true" : "false";
    });
    wake();
  };

  const tableCols = useMemo(() => ["Date", ...data.filter((s) => !hiddenSet.has(s.id)).map((s) => s.label), "Total"], [data, hiddenSet]);
  const { tableRows, tableCaption } = useMemo(() => {
    const vis = data.filter((s) => !hiddenSet.has(s.id));
    const a = lowerBound(times, tableRange[0]);
    const b = lowerBound(times, tableRange[1] + 1e-6) - 1;
    const count = Math.max(0, b - a + 1);
    const rows: (string | number)[][] = [];
    if (count <= TABLE_MAX_ROWS) {
      for (let j = a; j <= b; j++) {
        let tot = 0;
        const cells = vis.map((s) => {
          tot += s.values[j];
          return formatValue(s.values[j]);
        });
        rows.push([formatTime(times[j]), ...cells, formatValue(tot)]);
      }
      return { tableRows: rows, tableCaption: `${ariaLabel}, ${count} points` };
    }
    // Too many rows to read: roll up by week (Monday start) or by month.
    const byMonth = times[b] - times[a] > 182 * DAY;
    const keyOf = (t: number) => {
      if (byMonth) {
        const d = new Date(t);
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
      }
      return Math.floor((t - 4 * DAY) / (7 * DAY)) * 7 * DAY + 4 * DAY;
    };
    let j = a;
    while (j <= b) {
      const k = keyOf(times[j]);
      let end = j;
      while (end + 1 <= b && keyOf(times[end + 1]) === k) end++;
      let tot = 0;
      const cells = vis.map((s) => {
        let v = 0;
        if (tableAggregate === "last") v = s.values[end];
        else {
          for (let q = j; q <= end; q++) v += s.values[q];
          if (tableAggregate === "mean") v /= end - j + 1;
        }
        tot += v;
        return formatValue(v);
      });
      rows.push([byMonth ? monthFmt.format(k) : `Week of ${weekFmt.format(Math.max(k, times[j]))}`, ...cells, formatValue(tot)]);
      j = end + 1;
    }
    const how = tableAggregate === "mean" ? "averages" : tableAggregate === "sum" ? "totals" : "closing values";
    return { tableRows: rows, tableCaption: `${ariaLabel}, ${byMonth ? "monthly" : "weekly"} ${how}` };
  }, [data, hiddenSet, times, tableRange, tableAggregate, formatValue, formatTime, ariaLabel]);

  const summary = useMemo(() => {
    if (!n || !data.length) return `${ariaLabel}: no data`;
    const j = n - 1;
    let tot = 0;
    let best = -1;
    let bestV = -1;
    data.forEach((sr, i) => {
      if (hiddenSet.has(sr.id)) return;
      tot += sr.values[j];
      if (sr.values[j] > bestV) {
        bestV = sr.values[j];
        best = i;
      }
    });
    const lead = best >= 0 && tot > 0 ? `, largest ${data[best].label} at ${formatShare(bestV / tot)}` : "";
    return `${ariaLabel}: ${visibleCount} series from ${formatTime(times[0])} to ${formatTime(times[n - 1])}. Latest total ${formatValue(tot)}${lead}.`;
  }, [n, data, hiddenSet, times, ariaLabel, visibleCount, formatTime, formatValue]);

  const keyShape = mode === "lines" ? "line" : "rect";

  return (
    <div ref={rootRef} data-loop="idle" className={cn("relative w-full select-none text-[color:var(--bjork-text)]", className)} style={{ ...vars, height }}>
      <div ref={legendRef} role="group" aria-label="Series" className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-x-2 gap-y-1">
        {data.map((sr, i) => {
          const off = hiddenSet.has(sr.id);
          const locked = !off && visibleCount <= 1;
          return (
            <button
              key={sr.id}
              ref={(el) => {
                legendBtns.current[i] = el;
              }}
              type="button"
              aria-pressed={!off}
              aria-disabled={locked || undefined}
              onClick={() => toggle(sr.id)}
              onPointerEnter={() => emphasise(sr.id)}
              onPointerLeave={() => emphasise(null)}
              onFocus={() => emphasise(sr.id)}
              onBlur={() => emphasise(null)}
              className={cn(
                "pointer-events-auto inline-flex items-center gap-1.5 rounded-[6px] px-1 py-1 font-bjork-alpha text-[11px] font-medium leading-3 text-[color:var(--bjork-text-medium)] transition-opacity duration-150 ease-out hover:text-[color:var(--bjork-text)] data-[dim=true]:opacity-50",
                off && "opacity-45",
                locked ? "cursor-default" : "cursor-pointer",
                chartFocusRing,
              )}
            >
              {off ? (
                <span aria-hidden="true" className="inline-block size-2 rounded-[2px] border" style={{ borderColor: colors[i] }} />
              ) : (
                <LegendKey color={colors[i]} shape={keyShape} />
              )}
              {sr.label}
            </button>
          );
        })}
      </div>
      <div
        ref={wrapperRef}
        role="group"
        aria-roledescription="chart"
        aria-label={`${ariaLabel}. Left and right step through points, Page Up and Page Down jump, Home and End go to the ends of the window, Escape clears.`}
        tabIndex={0}
        onPointerEnter={() => {
          if (wrapperRef.current) rectRef.current = wrapperRef.current.getBoundingClientRect();
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={(e) => {
          // A touch tap or scrub fires leave on lift; keep the crosshair until the next touch.
          if (e.pointerType !== "touch" && st.current.source === "pointer") setCursor(null, null);
        }}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        className={cn("absolute inset-0 touch-pan-y rounded-[10px]", chartFocusRing)}
      >
        <div ref={hostRef} className="pointer-events-none absolute inset-0">
          <canvas ref={canvasRef} role="img" aria-label={summary} className="pointer-events-none absolute left-0 top-0" />
        </div>
        <LabelPool count={Y_LABELS} pool={yPool} />
        <LabelPool count={X_LABELS} pool={xPool} />
        <LabelPool
          count={MAX_SERIES}
          pool={inPool}
          className="font-bjork-alpha text-[11px] font-medium leading-none text-[color:var(--bjork-text)] [text-box:trim-both_cap_alphabetic]"
        />
        <LabelPool
          count={MAX_SERIES}
          pool={endPool}
          className="font-bjork-alpha text-[11px] font-medium leading-none text-[color:var(--bjork-text-medium)] [text-box:trim-both_cap_alphabetic] [text-shadow:0_0_3px_var(--bjork-chart-bg),0_0_3px_var(--bjork-chart-bg)]"
        />
        {brushOn && (
          <>
            <div
              ref={startRef}
              role="slider"
              tabIndex={0}
              aria-label="Window start"
              aria-orientation="horizontal"
              onKeyDown={(e) => onSliderKey("start", e)}
              aria-valuenow={Math.round(initWindow[0])}
              className={cn("absolute left-0 top-0 z-[1] w-4 rounded-[6px]", chartFocusRing)}
              style={{ height: BRUSH_H }}
            />
            <div
              ref={bodyRef}
              role="slider"
              tabIndex={0}
              aria-label="Brushed window"
              aria-orientation="horizontal"
              onKeyDown={(e) => onSliderKey("window", e)}
              aria-valuenow={Math.round(initWindow[0])}
              className={cn("absolute left-0 top-0 rounded-[4px]", chartFocusRing)}
              style={{ height: BRUSH_H }}
            />
            <div
              ref={endRef}
              role="slider"
              tabIndex={0}
              aria-label="Window end"
              aria-orientation="horizontal"
              onKeyDown={(e) => onSliderKey("end", e)}
              aria-valuenow={Math.round(initWindow[1])}
              className={cn("absolute left-0 top-0 z-[1] w-4 rounded-[6px]", chartFocusRing)}
              style={{ height: BRUSH_H }}
            />
          </>
        )}
        <HoverTooltip ref={tipRef} onMeasure={wake} />
      </div>
      <ChartTable caption={tableCaption} columns={tableCols} rows={tableRows} />
      <ChartAnnouncer ref={announcer} />
    </div>
  );
}

function visibleCountOf(hidden: Set<string>, data: Clean[]): number {
  let k = 0;
  for (const d of data) if (!hidden.has(d.id)) k++;
  return k;
}
