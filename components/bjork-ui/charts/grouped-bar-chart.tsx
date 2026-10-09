"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import { BJORK_PALETTE, type BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useChartCanvas, writeLabels } from "@/components/bjork-ui/charts/_kit/canvas";
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
  type TooltipRow,
} from "@/components/bjork-ui/charts/_kit/chrome";
import { clamp, crisp, damp, niceDomain, niceTicks, parseColor, withAlpha, formatCompact, formatPercent } from "@/components/bjork-ui/charts/_kit/scale";
import { seriesColor, foldSeries, CHART_OTHER, MAX_SERIES } from "@/components/bjork-ui/charts/_kit/series";

export interface BarCategory {
  id: string;
  label: string;
}

export interface BarSeries {
  id: string;
  label: string;
  /** One value per category, in `categories` order. Missing or non-finite values count as zero. */
  values: number[];
}

export type BarMode = "grouped" | "stacked" | "percent";
export type BarOrientation = "vertical" | "horizontal" | "auto";

export interface GroupedBarChartProps {
  categories: BarCategory[];
  /**
   * Up to six series; colour follows each series' index in this array. Past six, the tail folds
   * into one neutral "Other" series.
   */
  series: BarSeries[];
  /**
   * "grouped" sets bars side by side, "stacked" piles them (positives up, negatives down from zero),
   * "percent" shows each series' share of its category. Percent is for non-negative data: negative
   * values count as zero there (the tooltip and table still show the real value).
   */
  mode?: BarMode;
  /** "auto" (default) turns horizontal when vertical bands get too narrow for the bars or labels. */
  orientation?: BarOrientation;
  /** Hidden series ids (controlled). The last visible series can never be hidden. */
  hidden?: string[];
  defaultHidden?: string[];
  onHiddenChange?: (hidden: string[]) => void;
  /** Net total at the end of each stack (stacked mode only), when it fits. Default true. */
  showTotals?: boolean;
  /** A value on every bar or segment, when it fits. Default false. */
  showValues?: boolean;
  /** Series legend with toggles above the plot (shown for two or more series). Default true. */
  legend?: boolean;
  formatValue?: (v: number) => string;
  /** Posed hover by category and series id. */
  active?: { category: string; series: string } | null;
  height?: number;
  ariaLabel?: string;
  tone?: BjorkTone;
  className?: string;
}

const GAP = 2;
const RADIUS = 4;
const TAU = 0.13;
const PHASE_MS = 180;
const STAGGER_MS = 45;
const STAGGER_MAX_MS = 360;
const TICK_POOL = 10;
const MAX_GROUP_FRAC = 0.74;
const BAR_MAX = 56;
const BAR_STEP = 30;
const CAT_FALLBACK = "500 11px system-ui, sans-serif";
const MONO_FALLBACK = "400 10px ui-monospace, monospace";
const INK_DARK = BJORK_PALETTE.light.text;
const INK_LIGHT = "#ffffff";

const defaultFormatValue = (v: number) => formatCompact(v, 1);

// --- Text measurement (layout is budgeted, never assumed) ----------------------------------------

let measureCtx: CanvasRenderingContext2D | null = null;
const widthCache = new Map<string, number>();
function textWidth(font: string, text: string): number {
  const key = `${font}|${text}`;
  const hit = widthCache.get(key);
  if (hit !== undefined) return hit;
  if (!measureCtx) {
    if (typeof document === "undefined") return text.length * 6.5;
    measureCtx = document.createElement("canvas").getContext("2d");
    if (!measureCtx) return text.length * 6.5;
  }
  measureCtx.font = font;
  const w = measureCtx.measureText(text).width;
  if (widthCache.size > 4000) widthCache.clear();
  widthCache.set(key, w);
  return w;
}

function fontOf(el: HTMLElement | null, fallback: string): string {
  if (!el || typeof getComputedStyle === "undefined") return fallback;
  const cs = getComputedStyle(el);
  if (!cs.fontFamily) return fallback;
  return `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
}

// Rect with a rounded data end and square baseline, in either orientation.
function barPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, end: "top" | "bottom" | "left" | "right") {
  if (w <= 0 || h <= 0) return;
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  const tl = end === "top" || end === "left" ? rr : 0;
  const tr = end === "top" || end === "right" ? rr : 0;
  const br = end === "bottom" || end === "right" ? rr : 0;
  const bl = end === "bottom" || end === "left" ? rr : 0;
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  if (tr) ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  if (br) ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  if (bl) ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  if (tl) ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

// Writes one overlay label without allocating: text only when it changes, position by transform.
// `rot` turns the label to read bottom-to-top (its origin is the top-left corner).
function putLabel(el: HTMLElement | null | undefined, cache: string[], k: number, text: string | null, x = 0, y = 0, ax = -50, ay = -50, color?: string, rot = false) {
  if (!el) return;
  if (text === null) {
    if (el.style.opacity !== "0") el.style.opacity = "0";
    return;
  }
  if (cache[k] !== text) {
    cache[k] = text;
    el.textContent = text;
  }
  if (color !== undefined && el.style.color !== color) el.style.color = color;
  el.style.opacity = "1";
  el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)${rot ? " rotate(-90deg)" : ""} translate(${ax}%, ${ay}%)`;
}

// --- Model ---------------------------------------------------------------------------------------

interface Ser {
  id: string;
  label: string;
  color: string;
  /** Ink for labels drawn on the bar itself. */
  ink: string;
  values: number[];
}

interface Geo {
  n: number;
  m: number;
  mode: BarMode;
  /** Per bar (index c * m + i), in value space: `a` is the base side, `b` the data end. */
  a: Float64Array;
  b: Float64Array;
  /** Slot position within the group (grouped), 0 when stacked. */
  pos: Float64Array;
  /** 1 visible, 0 hidden. */
  wt: Float64Array;
  /** 1 when this bar owns the rounded outer end. */
  round: Float64Array;
  /** Share of the category's visible positive total. */
  share: Float64Array;
  net: Float64Array;
  posEnd: Float64Array;
  negEnd: Float64Array;
  k: number;
  lo: number;
  hi: number;
  visList: number[];
}

function buildGeo(ser: Ser[], n: number, mode: BarMode, vis: boolean[]): Geo {
  const m = ser.length;
  const N = n * m;
  const a = new Float64Array(N);
  const b = new Float64Array(N);
  const pos = new Float64Array(N);
  const wt = new Float64Array(N);
  const round = new Float64Array(N);
  const share = new Float64Array(N);
  const net = new Float64Array(n);
  const posEnd = new Float64Array(n);
  const negEnd = new Float64Array(n);
  const visList: number[] = [];
  for (let i = 0; i < m; i++) if (vis[i]) visList.push(i);
  let lo = 0;
  let hi = 0;
  for (let c = 0; c < n; c++) {
    let tot = 0;
    for (let i = 0; i < m; i++) if (vis[i]) tot += Math.max(0, ser[i].values[c]);
    let pb = 0;
    let nb = 0;
    let lastP = -1;
    let lastN = -1;
    let rank = 0;
    let sum = 0;
    for (let i = 0; i < m; i++) {
      const j = c * m + i;
      const on = vis[i];
      const v = ser[i].values[c];
      wt[j] = on ? 1 : 0;
      pos[j] = mode === "grouped" ? rank : 0;
      if (on) rank++;
      share[j] = on && tot > 0 ? Math.max(0, v) / tot : 0;
      if (on) sum += v;
      if (mode === "grouped") {
        a[j] = 0;
        b[j] = on ? v : 0;
        round[j] = on ? 1 : 0;
        if (on) {
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
      } else if (mode === "percent") {
        const s = share[j];
        a[j] = pb;
        b[j] = pb + s;
        pb += s;
        if (on && s > 0) lastP = i;
      } else if (v >= 0) {
        a[j] = pb;
        b[j] = pb + (on ? v : 0);
        if (on) {
          pb += v;
          if (v > 0) lastP = i;
        }
      } else {
        a[j] = nb;
        b[j] = nb + (on ? v : 0);
        if (on) {
          nb += v;
          lastN = i;
        }
      }
    }
    if (mode !== "grouped") for (let i = 0; i < m; i++) round[c * m + i] = i === lastP || i === lastN ? 1 : 0;
    net[c] = sum;
    posEnd[c] = pb;
    negEnd[c] = nb;
    if (mode === "stacked") {
      lo = Math.min(lo, nb);
      hi = Math.max(hi, pb);
    }
  }
  if (mode === "percent") {
    lo = 0;
    hi = 1;
  }
  return { n, m, mode, a, b, pos, wt, round, share, net, posEnd, negEnd, k: Math.max(1, visList.length), lo, hi, visList };
}

interface Layout {
  horiz: boolean;
  l: number;
  r: number;
  t: number;
  b: number;
  band: number;
  G: number;
  slot: number;
  gap: number;
}

interface Run {
  N: number;
  a: Float64Array;
  b: Float64Array;
  pos: Float64Array;
  wt: Float64Array;
  round: Float64Array;
  kk: number;
  lo: number;
  hi: number;
  ready: boolean;
  clock: number;
  enterAt: number;
  holdX: number;
  holdY: number;
  mode: BarMode | null;
  hover: { c: number; i: number } | null;
  source: "pointer" | "keyboard" | "prop" | null;
  legend: number | null;
  layout: Layout;
  fonts: { cat: string; mono: string } | null;
  tickCache: string[];
  valCache: string[];
  totCache: string[];
  horizShown: boolean | null;
}

export function GroupedBarChart({
  categories,
  series,
  mode = "grouped",
  orientation = "auto",
  hidden,
  defaultHidden,
  onHiddenChange,
  showTotals = true,
  showValues = false,
  legend = true,
  formatValue = defaultFormatValue,
  active,
  height = 360,
  ariaLabel = "Bar chart",
  tone: toneProp,
  className,
}: GroupedBarChartProps) {
  const { tone, pal, reduce, vars } = useChartTheme(toneProp);
  const announcer = useRef<AnnouncerHandle>(null);
  const tipRef = useRef<TooltipHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const catRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const tickPool = useRef<(HTMLSpanElement | null)[]>([]);
  const valPool = useRef<(HTMLSpanElement | null)[]>([]);
  const totPool = useRef<(HTMLSpanElement | null)[]>([]);
  const rectRef = useRef<DOMRect | null>(null);
  const [horizUI, setHorizUI] = useState(false);

  const n = categories.length;
  const ser = useMemo<Ser[]>(() => {
    const clean = series.map((s, idx) => ({
      id: s.id,
      label: s.label,
      idx,
      values: Array.from({ length: n }, (_, c) => (Number.isFinite(s.values[c]) ? s.values[c] : 0)),
    }));
    const folded = foldSeries(clean, MAX_SERIES, (rest) => ({
      id: "__other",
      label: "Other",
      idx: -1,
      values: Array.from({ length: n }, (_, c) => rest.reduce((acc, r) => acc + r.values[c], 0)),
    }));
    return folded.map((s, i) => {
      const color = s.idx < 0 ? CHART_OTHER[tone] : seriesColor(tone, i);
      const [r, g, b] = parseColor(color);
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      return { id: s.id, label: s.label, color, ink: lum > 0.5 ? INK_DARK : INK_LIGHT, values: s.values };
    });
  }, [series, n, tone]);
  const m = ser.length;

  const [hiddenState, setHiddenState] = useState<string[]>(defaultHidden ?? []);
  const hiddenIds = hidden ?? hiddenState;
  const vis = useMemo(() => {
    const set = new Set(hiddenIds);
    const v = ser.map((s) => !set.has(s.id));
    return v.some(Boolean) ? v : v.map(() => true);
  }, [ser, hiddenIds]);
  const visSig = vis.map((v) => (v ? 1 : 0)).join("");

  const geo = useMemo(() => buildGeo(ser, n, mode, vis), [ser, n, mode, vis]);

  const cfg = useRef({ geo, ser, categories, reduce, pal, formatValue, orientation, showTotals, showValues });
  useEffect(() => {
    cfg.current = { geo, ser, categories, reduce, pal, formatValue, orientation, showTotals, showValues };
  });

  const st = useRef<Run>({
    N: -1,
    a: new Float64Array(0),
    b: new Float64Array(0),
    pos: new Float64Array(0),
    wt: new Float64Array(0),
    round: new Float64Array(0),
    kk: 1,
    lo: 0,
    hi: 1,
    ready: false,
    clock: 0,
    enterAt: 0,
    holdX: 0,
    holdY: 0,
    mode: null,
    hover: null,
    source: null,
    legend: null,
    layout: { horiz: false, l: 0, r: 0, t: 0, b: 0, band: 1, G: 1, slot: 1, gap: GAP },
    fonts: null,
    tickCache: [],
    valCache: [],
    totCache: [],
    horizShown: null,
  });
  // setState is stable, so the loop can hold it directly.
  const reportHoriz = useRef(setHorizUI);

  const { rootRef, hostRef, canvasRef, wake } = useChartCanvas(({ ctx, w, h, dt }) => {
    const s = st.current;
    const c = cfg.current;
    const g = c.geo;
    const p = c.pal;
    const { n: nc, m: ms, mode: md } = g;
    if (!nc || !ms) {
      for (const el of catRefs.current) putLabel(el, [], 0, null);
      writeLabels(tickPool.current, s.tickCache, []);
      return false;
    }
    s.clock += dt * 1000;
    const now = s.clock;
    if (!s.fonts) s.fonts = { cat: fontOf(catRefs.current[0], CAT_FALLBACK), mono: fontOf(tickPool.current[0], MONO_FALLBACK) };
    const { cat: catFont, mono: monoFont } = s.fonts;

    // --- Animation state -------------------------------------------------------------------------
    const N = nc * ms;
    const jump = !s.ready || c.reduce || s.N !== N;
    if (s.N !== N) {
      s.a = new Float64Array(N);
      s.b = new Float64Array(N);
      s.pos = new Float64Array(N);
      s.wt = new Float64Array(N);
      s.round = new Float64Array(N);
    }
    if (s.mode !== null && s.mode !== md && !jump) {
      // Grouped to stacked: rise first, then close ranks. Stacked to grouped: spread first, then drop.
      if (s.mode === "grouped") s.holdX = now + PHASE_MS;
      else if (md === "grouped") s.holdY = now + PHASE_MS;
    }
    s.mode = md;
    let moving = false;
    const entering = !s.ready && !c.reduce;
    if (entering) s.enterAt = now;
    const span0 = Math.max(1e-9, s.hi - s.lo);
    const tolV = 1e-4 * span0;
    for (let j = 0; j < N; j++) {
      if (jump) {
        s.a[j] = entering ? 0 : g.a[j];
        s.b[j] = entering ? 0 : g.b[j];
        s.pos[j] = g.pos[j];
        s.wt[j] = g.wt[j];
        s.round[j] = g.round[j];
        if (entering) moving = true;
        continue;
      }
      const cat = Math.floor(j / ms);
      const yOk = now >= s.holdY && now - s.enterAt >= Math.min(STAGGER_MAX_MS, cat * STAGGER_MS);
      if (yOk) {
        s.a[j] = damp(s.a[j], g.a[j], TAU, dt);
        s.b[j] = damp(s.b[j], g.b[j], TAU, dt);
        s.round[j] = damp(s.round[j], g.round[j], TAU, dt);
      }
      if (now >= s.holdX) {
        s.pos[j] = damp(s.pos[j], g.pos[j], TAU, dt);
        s.wt[j] = damp(s.wt[j], g.wt[j], TAU, dt);
      }
      if (Math.abs(s.a[j] - g.a[j]) + Math.abs(s.b[j] - g.b[j]) > tolV || Math.abs(s.pos[j] - g.pos[j]) + Math.abs(s.wt[j] - g.wt[j]) > 1e-3) moving = true;
      else {
        s.a[j] = g.a[j];
        s.b[j] = g.b[j];
        s.pos[j] = g.pos[j];
        s.wt[j] = g.wt[j];
        s.round[j] = g.round[j];
      }
    }
    if (jump || c.reduce) s.kk = g.k;
    else if (now >= s.holdX) {
      s.kk = damp(s.kk, md === "grouped" ? g.k : 1, TAU, dt);
      if (Math.abs(s.kk - (md === "grouped" ? g.k : 1)) > 1e-3) moving = true;
    } else moving = true;
    s.N = N;

    // --- Layout ----------------------------------------------------------------------------------
    const fmtTick = md === "percent" ? (v: number) => formatPercent(v, 0) : c.formatValue;
    const labelsOn = c.showValues || (c.showTotals && md === "stacked");
    let longest = 0;
    for (let i = 0; i < nc; i++) longest = Math.max(longest, textWidth(catFont, c.categories[i].label));
    let maxValW = 0;
    if (labelsOn) {
      for (let i = 0; i < nc; i++) {
        maxValW = Math.max(maxValW, textWidth(monoFont, c.formatValue(g.net[i])), textWidth(monoFont, c.formatValue(g.posEnd[i])));
      }
      if (md === "grouped") maxValW = Math.max(maxValW, textWidth(monoFont, c.formatValue(g.hi)), textWidth(monoFont, c.formatValue(g.lo)));
    }

    // Vertical candidate first: its left gutter is the widest tick label.
    const vT = labelsOn ? 20 : 12;
    const vB = 26;
    const vPlotH = Math.max(1, h - vT - vB);
    const domainFor = (loPad: number, hiPad = 0.04): [number, number] => {
      if (md === "percent") return [0, 1];
      let lo = g.lo;
      let hi = g.hi;
      if (!(hi > lo)) return [0, 1];
      const sp = hi - lo;
      if (hi > 0) hi += sp * hiPad;
      if (lo < 0) lo -= sp * loPad;
      return niceDomain(lo, hi, 5);
    };
    // Grouped value labels may stand upright past the bar end, so budget their length as headroom.
    const uprightPad = clamp((maxValW + 10) / vPlotH, 0.04, 0.4);
    const vDom =
      c.showValues && md === "grouped" ? domainFor(uprightPad, uprightPad) : domainFor(labelsOn ? clamp(18 / vPlotH, 0.04, 0.3) : 0.04);
    const vCount = clamp(Math.floor(vPlotH / 44), 2, 8);
    let tickW = 0;
    for (const v of niceTicks(vDom[0], vDom[1], vCount)) tickW = Math.max(tickW, textWidth(monoFont, fmtTick(v)));
    const vL = Math.max(28, Math.ceil(tickW) + 12);
    const vR = 8;
    const bandV = (w - vL - vR) / nc;
    const kNow = md === "grouped" ? g.k : 1;
    const needBar = (kNow * 9 + (kNow - 1) * GAP) / MAX_GROUP_FRAC;
    const needLabel = Math.min(longest + 8, 64);
    const horiz = c.orientation === "horizontal" || (c.orientation === "auto" && bandV < Math.max(needBar, needLabel, 18));
    if (s.horizShown !== horiz) {
      s.horizShown = horiz;
      reportHoriz.current(horiz);
    }

    let L: number, R: number, T: number, Bm: number, dom: [number, number], count: number;
    if (!horiz) {
      L = vL;
      R = vR;
      T = vT;
      Bm = vB;
      dom = vDom;
      count = vCount;
    } else {
      const catW = clamp(Math.ceil(longest) + 2, 36, Math.min(150, w * 0.3));
      L = catW + 12;
      T = 6;
      Bm = 22;
      const approxW = Math.max(1, w - L - 12);
      dom = domainFor(labelsOn ? clamp((maxValW + 10) / approxW, 0.04, 0.4) : 0.04);
      let tw = 0;
      for (const v of niceTicks(dom[0], dom[1], 5)) tw = Math.max(tw, textWidth(monoFont, fmtTick(v)));
      // Room for the last tick label, centred on the right edge, and for labels past the bar ends.
      R = Math.max(12, tw / 2 + 4, labelsOn ? Math.min(maxValW + 10, w * 0.2) : 0);
      count = clamp(Math.floor(Math.max(1, w - L - R) / (tw + 28)), 2, 8);
    }
    const plot = { l: L, r: Math.max(L + 1, w - R), t: T, b: Math.max(T + 1, h - Bm) };
    const catLen = horiz ? plot.b - plot.t : plot.r - plot.l;
    const valLen = horiz ? plot.r - plot.l : plot.b - plot.t;
    const band = catLen / nc;
    const kk = Math.max(1, s.kk);
    const G = Math.max(2, Math.min(band * MAX_GROUP_FRAC, BAR_MAX + (kk - 1) * BAR_STEP));
    const gap = Math.min(GAP, (G / kk) * 0.25);
    const slot = Math.max(0.5, (G - gap * (kk - 1)) / kk);
    s.layout = { horiz, l: plot.l, r: plot.r, t: plot.t, b: plot.b, band, G, slot, gap };

    if (jump) {
      s.lo = dom[0];
      s.hi = dom[1];
    } else {
      s.lo = damp(s.lo, dom[0], TAU, dt);
      s.hi = damp(s.hi, dom[1], TAU, dt);
      if (Math.abs(s.lo - dom[0]) + Math.abs(s.hi - dom[1]) > 1e-4 * (dom[1] - dom[0])) moving = true;
      else {
        s.lo = dom[0];
        s.hi = dom[1];
      }
    }
    s.ready = true;
    const dspan = Math.max(1e-12, s.hi - s.lo);
    // Value to pixel along the value axis.
    const vp = horiz ? (v: number) => plot.l + ((v - s.lo) / dspan) * valLen : (v: number) => plot.b - ((v - s.lo) / dspan) * valLen;
    const catStart = (ci: number) => (horiz ? plot.t : plot.l) + band * ci;

    // --- Grid and ticks --------------------------------------------------------------------------
    const ticks = niceTicks(s.lo, s.hi, count);
    ctx.lineWidth = 1;
    ctx.strokeStyle = p.hair;
    ctx.beginPath();
    for (const v of ticks) {
      if (Math.abs(v) < 1e-9 * dspan) continue;
      const q = crisp(vp(v));
      if (horiz) {
        ctx.moveTo(q, plot.t);
        ctx.lineTo(q, plot.b);
      } else {
        ctx.moveTo(plot.l, q);
        ctx.lineTo(plot.r, q);
      }
    }
    ctx.stroke();
    const tp = tickPool.current;
    for (let k = 0; k < tp.length; k++) {
      const v = ticks[k];
      if (v === undefined) putLabel(tp[k], s.tickCache, k, null);
      else if (horiz) putLabel(tp[k], s.tickCache, k, fmtTick(v), vp(v), plot.b + 8, -50, 0);
      else putLabel(tp[k], s.tickCache, k, fmtTick(v), plot.l - 8, vp(v), -100, -50);
    }

    // --- Bars ------------------------------------------------------------------------------------
    const hv = s.hover;
    if (hv) {
      ctx.fillStyle = withAlpha(p.text, 0.035);
      const cs = catStart(hv.c);
      if (horiz) ctx.fillRect(plot.l, cs, valLen, band);
      else ctx.fillRect(cs, plot.t, band, valLen);
    }
    const p0 = vp(0);
    const vPool = valPool.current;
    const tPool = totPool.current;
    let tipX = 0;
    let tipY = 0;
    for (let ci = 0; ci < nc; ci++) {
      const g0 = catStart(ci) + (band - G) / 2;
      let endPos = p0;
      let endNeg = p0;
      for (let i = 0; i < ms; i++) {
        const j = ci * ms + i;
        const wt = s.wt[j];
        const pa0 = vp(s.a[j]);
        const pb = vp(s.b[j]);
        // The 2px surface gap opens on the base side of every segment that doesn't sit on zero.
        const d = pb >= pa0 ? 1 : -1;
        const pa = pa0 + d * Math.min(GAP, Math.abs(pa0 - p0));
        const len = (pb - pa) * d;
        const up = s.b[j] >= s.a[j];
        const thick = slot * wt;
        const cs = g0 + s.pos[j] * (slot + gap) + (slot - thick) / 2;
        const drawn = wt > 0.01 && len >= 0.5 && thick >= 0.3;
        const isHover = !!hv && hv.c === ci && hv.i === i;
        if (drawn) {
          let alpha = 1;
          if (hv) alpha = isHover ? 1 : hv.c === ci ? 0.5 : 0.32;
          else if (s.legend !== null) alpha = s.legend === i ? 1 : 0.28;
          ctx.globalAlpha = alpha * Math.min(1, wt * 1.5);
          ctx.fillStyle = c.ser[i].color;
          ctx.beginPath();
          const r = RADIUS * s.round[j];
          if (horiz) barPath(ctx, Math.min(pa, pb), cs, len, thick, r, d > 0 ? "right" : "left");
          else barPath(ctx, cs, Math.min(pa, pb), thick, len, r, d < 0 ? "top" : "bottom");
          ctx.fill();
          ctx.globalAlpha = 1;
          if (up) endPos = horiz ? Math.max(endPos, pb) : Math.min(endPos, pb);
          else endNeg = horiz ? Math.min(endNeg, pb) : Math.max(endNeg, pb);
        }
        if (isHover) {
          tipX = horiz ? Math.max(pa, pb) : cs + thick;
          tipY = horiz ? cs : Math.min(pa, pb);
        }

        // Value labels: outside the end when grouped, inside the segment when stacked.
        const el = vPool[j];
        if (!el) continue;
        if (!c.showValues || !drawn || g.wt[j] < 1) {
          putLabel(el, s.valCache, j, null);
          continue;
        }
        const v = c.ser[i].values[ci];
        const text = md === "percent" ? formatPercent(g.share[j], 0) : c.formatValue(v);
        const tw = textWidth(monoFont, text);
        const dim = hv ? (isHover ? 1 : 0.4) : s.legend !== null && s.legend !== i ? 0.3 : 1;
        if (md === "grouped") {
          const mid = cs + thick / 2;
          if (horiz) {
            const fits = thick >= 9 && (up ? pb + 5 + tw <= w : pb - 5 - tw >= plot.l);
            if (fits) putLabel(el, s.valCache, j, text, up ? pb + 5 : pb - 5, mid, up ? 0 : -100, -50, p.textMedium);
            else putLabel(el, s.valCache, j, null);
          } else {
            // Level when it fits the slot, turned upright along the bar when only the slot's depth does.
            if (tw <= slot + gap - 1 && (up ? pb - 15 >= 0 : pb + 15 <= plot.b)) putLabel(el, s.valCache, j, text, mid, up ? pb - 5 : pb + 5, -50, up ? -100 : 0, p.textMedium);
            else if (thick >= 10 && (up ? pb - 7 - tw >= 0 : pb + 7 + tw <= plot.b)) putLabel(el, s.valCache, j, text, mid, up ? pb - 5 : pb + 5, up ? 0 : -100, -50, p.textMedium, true);
            else putLabel(el, s.valCache, j, null);
          }
        } else {
          const fits = horiz ? len >= tw + 10 && thick >= 15 : thick >= tw + 8 && len >= 15;
          const mid = (pa + pb) / 2;
          if (fits) putLabel(el, s.valCache, j, text, horiz ? mid : cs + thick / 2, horiz ? cs + thick / 2 : mid, -50, -50, c.ser[i].ink);
          else putLabel(el, s.valCache, j, null);
        }
        if (el.style.opacity !== "0") el.style.opacity = String(dim);
      }

      // Net total at the outer end of the stack.
      const tel = tPool[ci];
      if (tel) {
        if (md !== "stacked" || !c.showTotals) putLabel(tel, s.totCache, ci, null);
        else {
          const text = c.formatValue(g.net[ci]);
          const tw = textWidth(monoFont, text) * 1.1;
          const usePos = g.posEnd[ci] > 0 || g.negEnd[ci] === 0;
          const e = usePos ? endPos : endNeg;
          const mid = g0 + G / 2;
          let fits: boolean;
          if (horiz) fits = band >= 12 && (usePos ? e + 6 + tw <= w : e - 6 - tw >= plot.l);
          else fits = tw <= band - 4 && (usePos ? e - 16 >= 0 : e + 16 <= plot.b);
          if (!fits) putLabel(tel, s.totCache, ci, null);
          else if (horiz) putLabel(tel, s.totCache, ci, text, usePos ? e + 6 : e - 6, mid, usePos ? 0 : -100, -50);
          else putLabel(tel, s.totCache, ci, text, mid, usePos ? e - 6 : e + 6, -50, usePos ? -100 : 0);
          if (tel.style.opacity !== "0" && (hv ? hv.c !== ci : s.legend !== null)) tel.style.opacity = "0.45";
        }
      }
    }

    // Zero line, emphasised, over the bars' square baselines.
    ctx.strokeStyle = p.textSoft;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const z = crisp(p0);
    if (horiz) {
      ctx.moveTo(z, plot.t - 2);
      ctx.lineTo(z, plot.b + 2);
    } else {
      ctx.moveTo(plot.l, z);
      ctx.lineTo(plot.r, z);
    }
    ctx.stroke();

    // --- Category labels ------------------------------------------------------------------------
    const minBand = horiz ? 12 : 26;
    const every = Math.max(1, Math.ceil(minBand / Math.max(1e-6, band)));
    for (let ci = 0; ci < catRefs.current.length; ci++) {
      const el = catRefs.current[ci];
      if (!el) continue;
      if (ci >= nc || ci % every !== 0) {
        if (el.style.opacity !== "0") el.style.opacity = "0";
        continue;
      }
      const mid = catStart(ci) + band / 2;
      const on = hv?.c === ci;
      el.style.opacity = "1";
      el.style.color = on ? "var(--bjork-text)" : "";
      if (horiz) {
        el.style.width = `${Math.max(0, plot.l - 12).toFixed(0)}px`;
        el.style.textAlign = "right";
        el.style.transform = `translate3d(0px, ${mid.toFixed(1)}px, 0) translateY(-50%)`;
      } else {
        el.style.width = `${Math.max(0, band * every - 4).toFixed(0)}px`;
        el.style.textAlign = "center";
        el.style.transform = `translate3d(${mid.toFixed(1)}px, ${(plot.b + 10).toFixed(1)}px, 0) translateX(-50%)`;
      }
    }

    const tip = tipRef.current;
    if (tip?.el && hv) {
      const pos = placeTooltip(tipX, tipY, tip.size.w, tip.size.h, w, h, 10);
      tip.el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
    }
    return moving;
  });

  const modeWord = mode === "percent" ? "share" : "value";
  const tooltipFor = (ci: number, i: number): TooltipContent | null => {
    const cat = categories[ci];
    if (!cat || !ser[i]) return null;
    const order = mode !== "grouped" && !st.current.layout.horiz ? [...geo.visList].reverse() : geo.visList;
    const rows: TooltipRow[] = order.map((k) => {
      const v = ser[k].values[ci];
      return {
        key: ser[k].id,
        label: ser[k].label,
        value: mode === "percent" ? `${formatPercent(geo.share[ci * m + k], 1)} · ${formatValue(v)}` : formatValue(v),
        color: ser[k].color,
        strong: k === i,
      };
    });
    if (geo.visList.length > 1) rows.push({ key: "__total", label: "Total", value: formatValue(geo.net[ci]) });
    return { key: `${ci}|${i}|${mode}|${tone}|${visSig}|${st.current.layout.horiz ? 1 : 0}`, title: cat.label, rows };
  };

  const setHover = (hv: { c: number; i: number } | null, source: Run["source"]) => {
    const s = st.current;
    if (s.hover?.c === hv?.c && s.hover?.i === hv?.i && s.source === source) return;
    s.hover = hv;
    s.source = hv ? source : null;
    tipRef.current?.set(hv ? tooltipFor(hv.c, hv.i) : null);
    if (hv && source === "keyboard") {
      const sr = ser[hv.i];
      const v = sr.values[hv.c];
      const share = mode === "percent" ? `, ${formatPercent(geo.share[hv.c * m + hv.i], 1)} of ${categories[hv.c].label}` : "";
      announcer.current?.say(`${categories[hv.c].label}, ${sr.label}: ${formatValue(v)}${share}. Total ${formatValue(geo.net[hv.c])}.`);
    }
    wake();
  };

  // Keep an open tooltip truthful when data, mode or visibility change underneath it.
  useEffect(() => {
    const s = st.current;
    if (!s.hover) return;
    if (s.hover.c >= n || s.hover.i >= m || !vis[s.hover.i]) {
      s.hover = null;
      tipRef.current?.set(null);
    } else tipRef.current?.set(tooltipFor(s.hover.c, s.hover.i));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, tone, horizUI]);

  useEffect(() => {
    wake();
  }, [geo, pal, reduce, formatValue, orientation, showTotals, showValues, wake]);

  // Web fonts change label widths: measure again once they land.
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;
    let live = true;
    document.fonts.ready.then(() => {
      if (!live) return;
      widthCache.clear();
      st.current.fonts = null;
      wake();
    });
    return () => {
      live = false;
    };
  }, [wake]);

  useEffect(() => {
    if (active === undefined) return;
    const ci = active ? categories.findIndex((c) => c.id === active.category) : -1;
    const i = active ? ser.findIndex((s) => s.id === active.series) : -1;
    setHover(ci >= 0 && i >= 0 && vis[i] ? { c: ci, i } : null, "prop");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.category, active?.series, categories, ser, visSig]);

  const pick = (px: number, py: number): { c: number; i: number } | null => {
    const L = st.current.layout;
    if (!n || !geo.visList.length) return null;
    const along = L.horiz ? py : px;
    const start = L.horiz ? L.t : L.l;
    const end = L.horiz ? L.b : L.r;
    if (along < start || along > end) return null;
    const ci = clamp(Math.floor((along - start) / L.band), 0, n - 1);
    if (mode === "grouped") {
      const off = along - (start + ci * L.band + (L.band - L.G) / 2);
      const r = clamp(Math.floor(off / (L.slot + L.gap)), 0, geo.visList.length - 1);
      return { c: ci, i: geo.visList[r] };
    }
    const s = st.current;
    const v = L.horiz ? s.lo + ((px - L.l) / Math.max(1, L.r - L.l)) * (s.hi - s.lo) : s.lo + ((L.b - py) / Math.max(1, L.b - L.t)) * (s.hi - s.lo);
    let best = geo.visList[0];
    let bestD = Infinity;
    for (const i of geo.visList) {
      const j = ci * m + i;
      const a = Math.min(geo.a[j], geo.b[j]);
      const b = Math.max(geo.a[j], geo.b[j]);
      if (b - a < 1e-12) continue;
      const d = v >= a && v <= b ? 0 : Math.min(Math.abs(v - a), Math.abs(v - b));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return { c: ci, i: best };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const rect = rectRef.current ?? wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover(pick(e.clientX - rect.left, e.clientY - rect.top), "pointer");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = st.current;
    const vl = geo.visList;
    if (!n || !vl.length) return;
    const horiz = s.layout.horiz;
    const cur = s.hover ?? null;
    const catNext = horiz ? "ArrowDown" : "ArrowRight";
    const catPrev = horiz ? "ArrowUp" : "ArrowLeft";
    const serNext = horiz ? "ArrowRight" : "ArrowUp";
    const serPrev = horiz ? "ArrowLeft" : "ArrowDown";
    const serAt = (i: number | undefined) => (i !== undefined && vl.includes(i) ? i : vl[0]);
    let next: { c: number; i: number } | null | undefined;
    if (e.key === catNext || e.key === catPrev) {
      const d = e.key === catNext ? 1 : -1;
      next = cur ? { c: clamp(cur.c + d, 0, n - 1), i: serAt(cur.i) } : { c: d > 0 ? 0 : n - 1, i: vl[0] };
    } else if (e.key === serNext || e.key === serPrev) {
      const d = e.key === serNext ? 1 : -1;
      if (!cur) next = { c: 0, i: d > 0 ? vl[0] : vl[vl.length - 1] };
      else {
        const r = vl.indexOf(serAt(cur.i));
        next = { c: cur.c, i: vl[clamp(r + d, 0, vl.length - 1)] };
      }
    } else if (e.key === "Home" || e.key === "End") {
      next = { c: e.key === "Home" ? 0 : n - 1, i: serAt(cur?.i) };
    } else if (e.key === "Escape") {
      if (cur) {
        e.preventDefault();
        setHover(null, null);
      }
      return;
    }
    if (next === undefined) return;
    e.preventDefault();
    setHover(next, "keyboard");
  };

  const toggle = (id: string) => {
    const set = new Set(hiddenIds);
    if (set.has(id)) set.delete(id);
    else {
      if (vis.filter(Boolean).length <= 1) return;
      set.add(id);
    }
    const next = ser.filter((s) => set.has(s.id)).map((s) => s.id);
    if (hidden === undefined) setHiddenState(next);
    onHiddenChange?.(next);
  };
  const emphasise = (i: number | null) => {
    st.current.legend = i;
    wake();
  };

  // The table twin carries every original series, folded or not.
  const tableCols = useMemo(() => ["Category", ...series.map((s) => s.label), "Total"], [series]);
  const tableRows = useMemo(
    () =>
      categories.map((cat, ci) => {
        let tot = 0;
        const cells = series.map((s) => {
          const v = s.values[ci];
          if (!Number.isFinite(v)) return "–";
          tot += v;
          return formatValue(v);
        });
        return [cat.label, ...cells, formatValue(tot)];
      }),
    [categories, series, formatValue],
  );

  const summary = useMemo(() => {
    if (!n || !m) return `${ariaLabel}: no data`;
    let top = 0;
    for (let c = 1; c < n; c++) if (geo.net[c] > geo.net[top]) top = c;
    const modeText = mode === "grouped" ? "grouped" : mode === "stacked" ? "stacked" : "stacked to 100 percent";
    return `${ariaLabel}: ${n} categories by ${geo.visList.length} series, ${modeText}. Highest total ${categories[top].label} at ${formatValue(geo.net[top])}.`;
  }, [ariaLabel, n, m, geo, mode, categories, formatValue]);

  const keysHint = horizUI ? "Up and down step through categories, left and right through series." : "Left and right step through categories, up and down through series.";

  return (
    <div ref={rootRef} data-loop="idle" className={cn("relative flex w-full select-none flex-col gap-3 text-[color:var(--bjork-text)]", className)} style={{ ...vars, height }}>
      {legend && m >= 2 && (
        <div role="group" aria-label="Series" className="-ml-2 flex flex-wrap items-center gap-x-0.5 gap-y-1">
          {ser.map((sr, i) => {
            const on = vis[i];
            return (
              <button
                key={sr.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(sr.id)}
                onPointerEnter={() => on && emphasise(i)}
                onPointerLeave={() => emphasise(null)}
                onFocus={() => on && emphasise(i)}
                onBlur={() => emphasise(null)}
                className={cn(
                  "inline-flex h-6 items-center gap-1.5 rounded-[7px] px-2 font-bjork-alpha text-[11px] font-medium leading-none transition-[background-color,color] duration-150 ease-out hover:bg-[color:var(--bjork-surface-hover)] active:scale-[0.97]",
                  chartFocusRing,
                  on ? "text-[color:var(--bjork-text-medium)]" : "text-[color:var(--bjork-text-soft)]",
                )}
              >
                <span
                  aria-hidden="true"
                  className="inline-block size-2 shrink-0 rounded-[2px]"
                  style={on ? { background: sr.color } : { boxShadow: `inset 0 0 0 1.5px ${sr.color}`, opacity: 0.7 }}
                />
                <span className="[text-box:trim-both_cap_alphabetic]">{sr.label}</span>
              </button>
            );
          })}
        </div>
      )}
      <div
        ref={wrapperRef}
        role="group"
        aria-roledescription="chart"
        aria-label={`${ariaLabel}. ${keysHint}`}
        tabIndex={0}
        onPointerEnter={() => {
          if (wrapperRef.current) rectRef.current = wrapperRef.current.getBoundingClientRect();
        }}
        onPointerMove={onPointerMove}
        onPointerDown={(e) => {
          if (wrapperRef.current) rectRef.current = wrapperRef.current.getBoundingClientRect();
          if (e.pointerType === "touch") onPointerMove(e);
        }}
        onPointerLeave={(e) => {
          rectRef.current = null;
          // A touch tap fires leave right after up; keep the tapped bar until the next tap.
          if (e.pointerType !== "touch") setHover(null, null);
        }}
        onKeyDown={onKeyDown}
        className={cn("relative min-h-0 flex-1 touch-pan-y rounded-[10px]", chartFocusRing)}
      >
        <div ref={hostRef} className="absolute inset-0">
          <canvas ref={canvasRef} role="img" aria-label={summary} className="pointer-events-none absolute left-0 top-0" />
        </div>
        <LabelPool count={TICK_POOL} pool={tickPool} />
        <LabelPool
          count={n * m}
          pool={valPool}
          className="pointer-events-none absolute left-0 top-0 origin-top-left whitespace-nowrap font-mono text-[10px] leading-none tabular-nums opacity-0 [text-box:trim-both_cap_alphabetic]"
        />
        <LabelPool
          count={n}
          pool={totPool}
          className="pointer-events-none absolute left-0 top-0 whitespace-nowrap font-mono text-[11px] leading-none tabular-nums text-[color:var(--bjork-text)] opacity-0 [text-box:trim-both_cap_alphabetic]"
        />
        {categories.map((cat, ci) => (
          <span
            key={cat.id}
            ref={(el) => {
              catRefs.current[ci] = el;
            }}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 truncate font-bjork-alpha text-[11px] font-medium leading-[13px] text-[color:var(--bjork-text-muted)] opacity-0"
          >
            {cat.label}
          </span>
        ))}
        {(!n || !m) && (
          <span className="absolute inset-0 grid place-items-center font-bjork-alpha text-[12px] text-[color:var(--bjork-text-soft)]">No data</span>
        )}
        <HoverTooltip ref={tipRef} onMeasure={wake} />
      </div>
      <ChartTable caption={`${ariaLabel}, ${modeWord} by category`} columns={tableCols} rows={tableRows} />
      <ChartAnnouncer ref={announcer} />
    </div>
  );
}
