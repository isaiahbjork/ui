"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
import { mulberry32 } from "@/components/bjork-ui/_core/random";
import { useChartCanvas, easeOut, writeLabels } from "@/components/bjork-ui/charts/_kit/canvas";
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
import { clamp, crisp, damp, niceDomain, niceTicks, withAlpha, formatNumber, formatFixed, formatSigned, gaussian } from "@/components/bjork-ui/charts/_kit/scale";

export interface ScatterPoint {
  id?: string;
  x: number;
  y: number;
  label?: string;
}

export interface Brush {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface ScatterBrushProps {
  points: ScatterPoint[];
  xLabel?: string;
  yLabel?: string;
  xDomain?: [number, number];
  yDomain?: [number, number];
  /** Brush in data units. Uncontrolled by default. `null` clears it. */
  brush?: Brush | null;
  defaultBrush?: Brush | null;
  onBrushChange?: (brush: Brush | null, selected: number[]) => void;
  marginals?: boolean;
  bins?: number;
  /**
   * Least-squares trend line (y on x) over the brushed selection, or every point when nothing is
   * brushed. Drawn only across the x range it was fitted on, and adds r² to the readout.
   */
  trend?: boolean;
  formatX?: (v: number) => string;
  formatY?: (v: number) => string;
  height?: number;
  ariaLabel?: string;
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

const LEFT = 44;
const BOTTOM = 40;
const MARGIN_H = 42;
const MARGIN_GAP = 8;
const TOP_TEXT = 26;
const RADIUS = 2.4;
const ALPHA_TAU = 0.09;
const BAR_TAU = 0.1;
const ENTER_MS = 900;
const HANDLE = 8;
const X_LABELS = 10;
const Y_LABELS = 8;
const ATTRACT_IDLE_MS = 4000;

const clock = () => performance.now();
const defaultFormat = (v: number) => formatNumber(v, 1);
// Correlation with a true minus and no plus sign.
const fmtR = (v: number) => (v < 0 ? `−${formatFixed(-v, 2)}` : formatFixed(v, 2));

interface Stats {
  n: number;
  mx: number;
  my: number;
  r: number;
  /** Least-squares fit y = a + b·x, and the x range it covers. */
  a: number;
  b: number;
  xMin: number;
  xMax: number;
}

function statsOf(points: ScatterPoint[], idx: number[] | null): Stats {
  const list = idx ?? points.map((_, i) => i);
  const n = list.length;
  if (!n) return { n: 0, mx: NaN, my: NaN, r: NaN, a: NaN, b: NaN, xMin: NaN, xMax: NaN };
  let sx = 0;
  let sy = 0;
  for (const i of list) {
    sx += points[i].x;
    sy += points[i].y;
  }
  const mx = sx / n;
  const my = sy / n;
  let cxy = 0;
  let cxx = 0;
  let cyy = 0;
  let xMin = Infinity;
  let xMax = -Infinity;
  for (const i of list) {
    const dx = points[i].x - mx;
    const dy = points[i].y - my;
    cxy += dx * dy;
    cxx += dx * dx;
    cyy += dy * dy;
    if (points[i].x < xMin) xMin = points[i].x;
    if (points[i].x > xMax) xMax = points[i].x;
  }
  const b = cxx ? cxy / cxx : NaN;
  return { n, mx, my, r: cxx && cyy ? cxy / Math.sqrt(cxx * cyy) : NaN, a: my - b * mx, b, xMin, xMax };
}

function inBrush(p: ScatterPoint, b: Brush | null): boolean {
  if (!b) return true;
  return p.x >= Math.min(b.x0, b.x1) && p.x <= Math.max(b.x0, b.x1) && p.y >= Math.min(b.y0, b.y1) && p.y <= Math.max(b.y0, b.y1);
}

type DragMode = "new" | "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface Run {
  enter: number;
  alpha: Float32Array;
  order: Float32Array; // entrance delay 0..1, by distance from the centroid
  barsX: number[];
  barsY: number[];
  selX: number[];
  selY: number[];
  ready: boolean;
  plot: { l: number; r: number; t: number; b: number };
  hover: number | null;
  drag: null | { mode: DragMode; id: number; sx: number; sy: number; start: Brush | null };
  grid: Map<number, number[]>;
  gridKey: string;
  xCache: string[];
  yCache: string[];
  lastInput: number;
  attractT: number;
}

export function ScatterBrush({
  points,
  xLabel = "x",
  yLabel = "y",
  xDomain,
  yDomain,
  brush: brushProp,
  defaultBrush = null,
  onBrushChange,
  marginals = true,
  bins = 32,
  trend = false,
  formatX = defaultFormat,
  formatY = defaultFormat,
  height = 420,
  ariaLabel = "Scatter plot",
  tone: toneProp,
  attract = false,
  className,
}: ScatterBrushProps) {
  const { pal, reduce, vars } = useChartTheme(toneProp);
  const announcer = useRef<AnnouncerHandle>(null);
  const tipRef = useRef<TooltipHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const xPool = useRef<(HTMLSpanElement | null)[]>([]);
  const yPool = useRef<(HTMLSpanElement | null)[]>([]);
  const rectRef = useRef<DOMRect | null>(null);
  const [brushState, setBrushState] = useState<Brush | null>(defaultBrush);
  const brush = brushProp !== undefined ? brushProp : brushState;

  const dom = useMemo(() => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const p of points) {
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y);
    }
    if (!Number.isFinite(x0)) return { x: [0, 1] as [number, number], y: [0, 1] as [number, number] };
    return { x: xDomain ?? niceDomain(x0, x1, 6), y: yDomain ?? niceDomain(y0, y1, 6) };
  }, [points, xDomain, yDomain]);

  const selected = useMemo(() => (brush ? points.map((p, i) => (inBrush(p, brush) ? i : -1)).filter((i) => i >= 0) : null), [points, brush]);
  const stats = useMemo(() => statsOf(points, selected), [points, selected]);

  const cfg = useRef({ points, dom, brush, marginals, bins, reduce, pal, attract, trend, stats });
  useEffect(() => {
    cfg.current = { points, dom, brush, marginals, bins, reduce, pal, attract, trend, stats };
  });

  const st = useRef<Run>({
    enter: 0,
    alpha: new Float32Array(0),
    order: new Float32Array(0),
    barsX: [],
    barsY: [],
    selX: [],
    selY: [],
    ready: false,
    plot: { l: 0, r: 0, t: 0, b: 0 },
    hover: null,
    drag: null,
    grid: new Map(),
    gridKey: "",
    xCache: [],
    yCache: [],
    lastInput: 0,
    attractT: 0,
  });
  const brushSetter = useRef<(b: Brush | null, announce: boolean) => void>(() => {});

  const { rootRef, hostRef, canvasRef, wake } = useChartCanvas(({ ctx, w, h, dt }) => {
    const s = st.current;
    const c = cfg.current;
    const p = c.pal;
    const P = c.points;
    const n = P.length;
    const mH = c.marginals ? MARGIN_H + MARGIN_GAP : 0;
    const plot = { l: LEFT, r: w - mH - 6, t: TOP_TEXT + mH, b: h - BOTTOM };
    s.plot = plot;
    const [x0, x1] = c.dom.x;
    const [y0, y1] = c.dom.y;
    const xOf = (v: number) => plot.l + ((v - x0) / (x1 - x0)) * (plot.r - plot.l);
    const yOf = (v: number) => plot.b - ((v - y0) / (y1 - y0)) * (plot.b - plot.t);

    if (s.alpha.length !== n) {
      s.alpha = new Float32Array(n).fill(1);
      // Entrance order: a ripple out from the centroid.
      let cx = 0;
      let cy = 0;
      for (const pt of P) {
        cx += pt.x;
        cy += pt.y;
      }
      cx /= Math.max(1, n);
      cy /= Math.max(1, n);
      const d = P.map((pt) => Math.hypot((pt.x - cx) / (x1 - x0), (pt.y - cy) / (y1 - y0)));
      const dMax = Math.max(1e-9, ...d);
      s.order = Float32Array.from(d.map((v) => v / dMax));
      s.enter = c.reduce ? 1 : 0;
    }
    const gkey = `${n}|${w}|${h}|${x0}|${x1}|${y0}|${y1}`;
    if (gkey !== s.gridKey) {
      s.gridKey = gkey;
      s.grid = new Map();
      for (let i = 0; i < n; i++) {
        const key = Math.floor(xOf(P[i].x) / 16) * 10007 + Math.floor(yOf(P[i].y) / 16);
        const list = s.grid.get(key);
        if (list) list.push(i);
        else s.grid.set(key, [i]);
      }
    }

    // Attract: a brush that sweeps across the cloud.
    if (c.attract && !c.reduce && (!s.lastInput || clock() - s.lastInput > ATTRACT_IDLE_MS)) {
      s.attractT += dt;
      const u = 0.5 - 0.5 * Math.cos(s.attractT * 0.5);
      const bw = (x1 - x0) * 0.28;
      const bh = (y1 - y0) * 0.4;
      const bx = x0 + (x1 - x0 - bw) * u;
      const by = y0 + (y1 - y0 - bh) * (0.5 + 0.35 * Math.sin(s.attractT * 0.35));
      c.brush = { x0: bx, x1: bx + bw, y0: by, y1: by + bh };
    }
    const B = c.brush;

    let moving = false;
    for (let i = 0; i < n; i++) {
      const target = !B || inBrush(P[i], B) ? 1 : 0;
      if (c.reduce || !s.ready) s.alpha[i] = target;
      else {
        s.alpha[i] = damp(s.alpha[i], target, ALPHA_TAU, dt);
        if (Math.abs(s.alpha[i] - target) > 0.01) moving = true;
        else s.alpha[i] = target;
      }
    }

    s.enter = c.reduce ? 1 : Math.min(1, s.enter + (dt * 1000) / ENTER_MS);

    // Grid and axes.
    const xt = niceTicks(x0, x1, Math.max(3, Math.floor((plot.r - plot.l) / 90)));
    const yt = niceTicks(y0, y1, Math.max(3, Math.floor((plot.b - plot.t) / 60)));
    ctx.strokeStyle = p.hair;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const v of xt) {
      ctx.moveTo(crisp(xOf(v)), plot.t);
      ctx.lineTo(crisp(xOf(v)), plot.b);
    }
    for (const v of yt) {
      ctx.moveTo(plot.l, crisp(yOf(v)));
      ctx.lineTo(plot.r, crisp(yOf(v)));
    }
    ctx.stroke();
    writeLabels(xPool.current, s.xCache, xt.map((v) => ({ text: formatX(v), x: xOf(v), y: plot.b + 13, ax: -50 })));
    writeLabels(yPool.current, s.yCache, yt.map((v) => ({ text: formatY(v), x: plot.l - 8, y: yOf(v), ax: -100 })));

    // Marginal histograms: everything as a ghost, the selection in the accent.
    if (c.marginals) {
      const nb = c.bins;
      const cx = new Array(nb).fill(0);
      const cy = new Array(nb).fill(0);
      const sx = new Array(nb).fill(0);
      const sy = new Array(nb).fill(0);
      for (let i = 0; i < n; i++) {
        const bx = clamp(Math.floor(((P[i].x - x0) / (x1 - x0)) * nb), 0, nb - 1);
        const by = clamp(Math.floor(((P[i].y - y0) / (y1 - y0)) * nb), 0, nb - 1);
        cx[bx]++;
        cy[by]++;
        if (!B || inBrush(P[i], B)) {
          sx[bx]++;
          sy[by]++;
        }
      }
      const mx = Math.max(1, ...cx);
      const my = Math.max(1, ...cy);
      const step = (arr: number[], target: number[]) => {
        for (let k = 0; k < nb; k++) {
          if (arr[k] === undefined || c.reduce || !s.ready) arr[k] = target[k];
          else {
            arr[k] = damp(arr[k], target[k], BAR_TAU, dt);
            if (Math.abs(arr[k] - target[k]) > 0.02) moving = true;
          }
        }
        arr.length = nb;
      };
      step(s.barsX, cx);
      step(s.barsY, cy);
      step(s.selX, sx);
      step(s.selY, sy);
      const e = easeOut(s.enter);
      const bwx = (plot.r - plot.l) / nb;
      const bwy = (plot.b - plot.t) / nb;
      const topBase = plot.t - MARGIN_GAP;
      const rightBase = plot.r + MARGIN_GAP;
      for (let k = 0; k < nb; k++) {
        const x = plot.l + k * bwx + 1;
        const hAll = (s.barsX[k] / mx) * MARGIN_H * e;
        const hSel = (s.selX[k] / mx) * MARGIN_H * e;
        ctx.fillStyle = withAlpha(p.text, 0.12);
        ctx.fillRect(x, topBase - hAll, Math.max(1, bwx - 2), hAll);
        if (B) {
          ctx.fillStyle = withAlpha(p.accent, 0.66);
          ctx.fillRect(x, topBase - hSel, Math.max(1, bwx - 2), hSel);
        }
        const y = plot.b - (k + 1) * bwy + 1;
        const wAll = (s.barsY[k] / my) * MARGIN_H * e;
        const wSel = (s.selY[k] / my) * MARGIN_H * e;
        ctx.fillStyle = withAlpha(p.text, 0.12);
        ctx.fillRect(rightBase, y, wAll, Math.max(1, bwy - 2));
        if (B) {
          ctx.fillStyle = withAlpha(p.accent, 0.66);
          ctx.fillRect(rightBase, y, wSel, Math.max(1, bwy - 2));
        }
      }
    }
    s.ready = true;

    // Points: unselected first, selected on top.
    const e = s.enter;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        const a = s.alpha[i];
        if (pass === 0 ? a > 0.5 : a <= 0.5) continue;
        const k = e >= 1 ? 1 : clamp((e - s.order[i] * 0.55) / 0.45, 0, 1);
        if (k <= 0) continue;
        // No brush: all ink. With a brush: selected points in the accent, the rest fade back.
        if (!B) ctx.fillStyle = withAlpha(p.text, 0.38);
        else ctx.fillStyle = a > 0.5 ? withAlpha(p.accent, 0.3 + 0.55 * a) : withAlpha(p.text, 0.1 + 0.2 * a);
        ctx.globalAlpha = k;
        ctx.beginPath();
        ctx.arc(xOf(P[i].x), yOf(P[i].y), RADIUS * (0.6 + 0.4 * k), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Brush.
    if (B) {
      const bx0 = xOf(Math.min(B.x0, B.x1));
      const bx1 = xOf(Math.max(B.x0, B.x1));
      const by0 = yOf(Math.max(B.y0, B.y1));
      const by1 = yOf(Math.min(B.y0, B.y1));
      ctx.fillStyle = withAlpha(p.accent, 0.06);
      ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
      ctx.strokeStyle = p.accentInk;
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(bx0) + 0.5, Math.round(by0) + 0.5, Math.round(bx1 - bx0), Math.round(by1 - by0));
      ctx.fillStyle = p.accent;
      for (const [hx, hy] of [
        [bx0, by0],
        [bx1, by0],
        [bx0, by1],
        [bx1, by1],
      ]) {
        ctx.fillRect(Math.round(hx) - 3, Math.round(hy) - 3, 6, 6);
      }
      // Guides from the brush into the marginals.
      if (c.marginals) {
        ctx.strokeStyle = withAlpha(p.accentInk, 0.35);
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(crisp(bx0), by0);
        ctx.lineTo(crisp(bx0), plot.t - MARGIN_GAP - MARGIN_H);
        ctx.moveTo(crisp(bx1), by0);
        ctx.lineTo(crisp(bx1), plot.t - MARGIN_GAP - MARGIN_H);
        ctx.moveTo(bx1, crisp(by0));
        ctx.lineTo(plot.r + MARGIN_GAP + MARGIN_H, crisp(by0));
        ctx.moveTo(bx1, crisp(by1));
        ctx.lineTo(plot.r + MARGIN_GAP + MARGIN_H, crisp(by1));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Trend line: the least-squares fit over the selection, only across the x range it covers.
    // During attract the brush moves without re-rendering, so the fit is skipped there.
    const F = c.stats;
    const attracting = c.attract && !c.reduce && (!s.lastInput || clock() - s.lastInput > ATTRACT_IDLE_MS);
    if (c.trend && !attracting && F.n >= 3 && Number.isFinite(F.b) && F.xMax > F.xMin && e >= 1) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(plot.l, plot.t, plot.r - plot.l, plot.b - plot.t);
      ctx.clip();
      const ax = xOf(F.xMin);
      const ay = yOf(F.a + F.b * F.xMin);
      const bx = xOf(F.xMax);
      const by = yOf(F.a + F.b * F.xMax);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.strokeStyle = withAlpha(p.stage, 0.85);
      ctx.lineWidth = 4.5;
      ctx.stroke();
      ctx.strokeStyle = B ? p.accentInk : p.text;
      ctx.lineWidth = 1.75;
      ctx.stroke();
      ctx.restore();
    }

    // Hovered point.
    const tip = tipRef.current;
    if (s.hover !== null && P[s.hover]) {
      const hx = xOf(P[s.hover].x);
      const hy = yOf(P[s.hover].y);
      ctx.beginPath();
      ctx.arc(hx, hy, 5, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = p.text;
      ctx.stroke();
      if (tip?.el) {
        const pos = placeTooltip(hx, hy, tip.size.w, tip.size.h, w, h, 12);
        tip.el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      }
    }

    if (c.attract && !c.reduce && (!s.lastInput || clock() - s.lastInput > ATTRACT_IDLE_MS)) return true;
    return moving || s.enter < 1 || !!s.drag;
  });

  const fit = (st2: Stats) =>
    trend && Number.isFinite(st2.b) && Number.isFinite(st2.r)
      ? `, r squared ${formatFixed(st2.r * st2.r, 2)}, trend ${formatSigned(st2.b, (v) => formatNumber(v, 2))} ${yLabel} per ${xLabel}`
      : "";
  const describeStats = (st2: Stats) =>
    `${st2.n} of ${points.length} selected${st2.n ? `, mean ${xLabel} ${formatX(st2.mx)}, mean ${yLabel} ${formatY(st2.my)}${Number.isFinite(st2.r) ? `, correlation ${fmtR(st2.r)}` : ""}${fit(st2)}` : ""}`;

  const setBrush = (b: Brush | null, announce = false) => {
    if (brushProp === undefined) setBrushState(b);
    const sel = b ? points.map((p, i) => (inBrush(p, b) ? i : -1)).filter((i) => i >= 0) : [];
    onBrushChange?.(b, sel);
    cfg.current.brush = b;
    if (announce) announcer.current?.say(b ? describeStats(statsOf(points, sel)) : "Selection cleared");
    wake();
  };
  useEffect(() => {
    brushSetter.current = setBrush;
  });

  useEffect(() => {
    wake();
  }, [points, dom, brush, marginals, bins, pal, reduce, attract, trend, stats, wake]);

  const tooltipFor = (i: number): TooltipContent | null => {
    const pt = points[i];
    if (!pt) return null;
    return {
      key: `${i}|${pal.text}`,
      title: pt.label,
      rows: [
        { key: "x", label: xLabel, value: formatX(pt.x) },
        { key: "y", label: yLabel, value: formatY(pt.y) },
      ],
    };
  };

  const setHover = (i: number | null) => {
    const s = st.current;
    if (s.hover === i) return;
    s.hover = i;
    tipRef.current?.set(i === null ? null : tooltipFor(i));
    wake();
  };

  const local = (e: PointerEvent<HTMLDivElement>) => {
    const r = rectRef.current ?? wrapperRef.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : null;
  };
  const toData = (px: number, py: number) => {
    const s = st.current;
    const [x0, x1] = dom.x;
    const [y0, y1] = dom.y;
    return {
      x: clamp(x0 + ((px - s.plot.l) / (s.plot.r - s.plot.l)) * (x1 - x0), x0, x1),
      y: clamp(y0 + ((s.plot.b - py) / (s.plot.b - s.plot.t)) * (y1 - y0), y0, y1),
    };
  };
  const toPx = (b: Brush) => {
    const s = st.current;
    const [x0, x1] = dom.x;
    const [y0, y1] = dom.y;
    const X = (v: number) => s.plot.l + ((v - x0) / (x1 - x0)) * (s.plot.r - s.plot.l);
    const Y = (v: number) => s.plot.b - ((v - y0) / (y1 - y0)) * (s.plot.b - s.plot.t);
    return { l: X(Math.min(b.x0, b.x1)), r: X(Math.max(b.x0, b.x1)), t: Y(Math.max(b.y0, b.y1)), b: Y(Math.min(b.y0, b.y1)) };
  };
  const modeAt = (px: number, py: number): DragMode | null => {
    if (!brush) return null;
    const r = toPx(brush);
    const nearL = Math.abs(px - r.l) < HANDLE;
    const nearR = Math.abs(px - r.r) < HANDLE;
    const nearT = Math.abs(py - r.t) < HANDLE;
    const nearB = Math.abs(py - r.b) < HANDLE;
    const inX = px > r.l - HANDLE && px < r.r + HANDLE;
    const inY = py > r.t - HANDLE && py < r.b + HANDLE;
    if (!inX || !inY) return null;
    if (nearT && nearL) return "nw";
    if (nearT && nearR) return "ne";
    if (nearB && nearL) return "sw";
    if (nearB && nearR) return "se";
    if (nearL) return "w";
    if (nearR) return "e";
    if (nearT) return "n";
    if (nearB) return "s";
    return "move";
  };
  const cursorFor: Record<string, string> = { move: "move", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    st.current.lastInput = clock();
    if (wrapperRef.current) rectRef.current = wrapperRef.current.getBoundingClientRect();
    const pt = local(e);
    if (!pt) return;
    const s = st.current;
    if (pt.x < s.plot.l - HANDLE || pt.x > s.plot.r + HANDLE || pt.y < s.plot.t - HANDLE || pt.y > s.plot.b + HANDLE) return;
    const mode = modeAt(pt.x, pt.y) ?? "new";
    s.drag = { mode, id: e.pointerId, sx: pt.x, sy: pt.y, start: brush };
    e.currentTarget.setPointerCapture(e.pointerId);
    setHover(null);
    wake();
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    st.current.lastInput = clock();
    const pt = local(e);
    if (!pt) return;
    const s = st.current;
    const d = s.drag;
    if (d && d.id === e.pointerId) {
      const a = toData(d.sx, d.sy);
      const b = toData(pt.x, pt.y);
      if (d.mode === "new") {
        if (Math.abs(pt.x - d.sx) < 3 && Math.abs(pt.y - d.sy) < 3) return;
        setBrush({ x0: a.x, x1: b.x, y0: a.y, y1: b.y });
        return;
      }
      const sb = d.start;
      if (!sb) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const nb = { x0: Math.min(sb.x0, sb.x1), x1: Math.max(sb.x0, sb.x1), y0: Math.min(sb.y0, sb.y1), y1: Math.max(sb.y0, sb.y1) };
      if (d.mode === "move") {
        const w = nb.x1 - nb.x0;
        const hh = nb.y1 - nb.y0;
        const x0 = clamp(nb.x0 + dx, dom.x[0], dom.x[1] - w);
        const y0 = clamp(nb.y0 + dy, dom.y[0], dom.y[1] - hh);
        setBrush({ x0, x1: x0 + w, y0, y1: y0 + hh });
        return;
      }
      if (d.mode.includes("w")) nb.x0 = Math.min(nb.x1, nb.x0 + dx);
      if (d.mode.includes("e")) nb.x1 = Math.max(nb.x0, nb.x1 + dx);
      if (d.mode.includes("s")) nb.y0 = Math.min(nb.y1, nb.y0 + dy);
      if (d.mode.includes("n")) nb.y1 = Math.max(nb.y0, nb.y1 + dy);
      setBrush(nb);
      return;
    }
    if (wrapperRef.current) wrapperRef.current.style.cursor = cursorFor[modeAt(pt.x, pt.y) ?? ""] ?? "crosshair";
    // Nearest point within 16px.
    const cx = Math.floor(pt.x / 16);
    const cy = Math.floor(pt.y / 16);
    const [x0, x1] = dom.x;
    const [y0, y1] = dom.y;
    let best = -1;
    let bd = 16 * 16;
    for (let gx = cx - 1; gx <= cx + 1; gx++)
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const list = s.grid.get(gx * 10007 + gy);
        if (!list) continue;
        for (const i of list) {
          const px = s.plot.l + ((points[i].x - x0) / (x1 - x0)) * (s.plot.r - s.plot.l);
          const py = s.plot.b - ((points[i].y - y0) / (y1 - y0)) * (s.plot.b - s.plot.t);
          const dd = (px - pt.x) ** 2 + (py - pt.y) ** 2;
          if (dd < bd) {
            bd = dd;
            best = i;
          }
        }
      }
    setHover(best >= 0 ? best : null);
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const s = st.current;
    if (s.drag && s.drag.id === e.pointerId) {
      // A click without a drag on empty space clears the brush.
      const moved = Math.abs((local(e)?.x ?? s.drag.sx) - s.drag.sx) > 3 || Math.abs((local(e)?.y ?? s.drag.sy) - s.drag.sy) > 3;
      if (s.drag.mode === "new" && !moved) setBrush(null, true);
      else announcer.current?.say(describeStats(statsOf(points, brush ? points.map((p, i) => (inBrush(p, brush) ? i : -1)).filter((i) => i >= 0) : null)));
      s.drag = null;
      wake();
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    st.current.lastInput = clock();
    const [x0, x1] = dom.x;
    const [y0, y1] = dom.y;
    if (e.key === "Escape") {
      if (!brush) return;
      e.preventDefault();
      setBrush(null, true);
      return;
    }
    // Enter, or the first arrow press, drops a selection in the middle so the keys have something to move.
    if (!brush && (e.key === "Enter" || e.key.startsWith("Arrow"))) {
      e.preventDefault();
      const w = (x1 - x0) * 0.3;
      const hh = (y1 - y0) * 0.3;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      setBrush({ x0: cx - w / 2, x1: cx + w / 2, y0: cy - hh / 2, y1: cy + hh / 2 }, true);
      return;
    }
    if (!brush || !e.key.startsWith("Arrow")) return;
    e.preventDefault();
    const f = e.shiftKey ? 0.1 : 0.02;
    const dx = (e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0) * (x1 - x0) * f;
    const dy = (e.key === "ArrowDown" ? -1 : e.key === "ArrowUp" ? 1 : 0) * (y1 - y0) * f;
    const nb = { x0: Math.min(brush.x0, brush.x1), x1: Math.max(brush.x0, brush.x1), y0: Math.min(brush.y0, brush.y1), y1: Math.max(brush.y0, brush.y1) };
    if (e.altKey) {
      // Alt resizes from the top-right corner.
      nb.x1 = clamp(nb.x1 + dx, nb.x0 + (x1 - x0) * 0.02, x1);
      nb.y1 = clamp(nb.y1 + dy, nb.y0 + (y1 - y0) * 0.02, y1);
    } else {
      const w = nb.x1 - nb.x0;
      const hh = nb.y1 - nb.y0;
      nb.x0 = clamp(nb.x0 + dx, x0, x1 - w);
      nb.x1 = nb.x0 + w;
      nb.y0 = clamp(nb.y0 + dy, y0, y1 - hh);
      nb.y1 = nb.y0 + hh;
    }
    setBrush(nb, true);
  };

  const tableRows = useMemo(() => points.slice(0, 400).map((pt, i) => [pt.label ?? `#${i + 1}`, formatX(pt.x), formatY(pt.y)]), [points, formatX, formatY]);
  const tableCols = useMemo(() => ["Point", xLabel, yLabel], [xLabel, yLabel]);

  return (
    <div ref={rootRef} data-loop="idle" className={cn("relative w-full select-none text-[color:var(--bjork-text)]", className)} style={{ ...vars, height }}>
      <div
        ref={wrapperRef}
        role="group"
        aria-roledescription="chart"
        aria-label={`${ariaLabel}. Drag to select a region. Enter or an arrow key adds a selection, arrow keys move it, Shift moves it further, Alt with arrows resizes it, Escape clears.`}
        tabIndex={0}
        onPointerEnter={() => {
          if (wrapperRef.current) rectRef.current = wrapperRef.current.getBoundingClientRect();
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKeyDown}
        className={cn("absolute inset-0 cursor-crosshair touch-none rounded-[10px]", chartFocusRing)}
      >
        <div ref={hostRef} className="absolute inset-0">
          <canvas ref={canvasRef} role="img" aria-label={`${ariaLabel}: ${describeStats(stats)}`} className="pointer-events-none absolute left-0 top-0" />
        </div>
        {/* Readout: count, means and correlation of the selection (or everything). */}
        <div aria-hidden="true" className="pointer-events-none absolute left-0 top-0 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] leading-none tabular-nums text-[color:var(--bjork-text-soft)]">
          <span>
            n <span className="text-[color:var(--bjork-text)]">{formatNumber(stats.n, 0)}</span>
            <span className="text-[color:var(--bjork-text-faint)]"> / {formatNumber(points.length, 0)}</span>
          </span>
          <span>
            x&#772; <span className="text-[color:var(--bjork-text)]">{stats.n ? formatX(stats.mx) : "–"}</span>
          </span>
          <span>
            y&#772; <span className="text-[color:var(--bjork-text)]">{stats.n ? formatY(stats.my) : "–"}</span>
          </span>
          <span>
            r <span className={brush ? "text-[color:var(--bjork-accent-ink)]" : "text-[color:var(--bjork-text)]"}>{Number.isFinite(stats.r) ? fmtR(stats.r) : "–"}</span>
          </span>
          {trend && (
            <span>
              r&#178; <span className="text-[color:var(--bjork-text)]">{Number.isFinite(stats.r) ? formatFixed(stats.r * stats.r, 2) : "–"}</span>
            </span>
          )}
        </div>
        <span aria-hidden="true" className="pointer-events-none absolute bottom-0 left-11 font-mono text-[9px] uppercase leading-none tracking-[0.1em] text-[color:var(--bjork-text-soft)] [text-box:trim-both_cap_alphabetic]">
          {xLabel} {"→"}
        </span>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0 origin-top-left -rotate-90 whitespace-nowrap font-mono text-[9px] uppercase leading-none tracking-[0.1em] text-[color:var(--bjork-text-soft)] [text-box:trim-both_cap_alphabetic]"
          style={{ top: height - BOTTOM }}
        >
          {yLabel} {"→"}
        </span>
        <LabelPool count={X_LABELS} pool={xPool} />
        <LabelPool count={Y_LABELS} pool={yPool} />
        <HoverTooltip ref={tipRef} onMeasure={wake} />
      </div>
      <ChartTable caption={`${ariaLabel} (first ${Math.min(400, points.length)} points)`} columns={tableCols} rows={tableRows} />
      <ChartAnnouncer ref={announcer} />
    </div>
  );
}

// Seeded demo cloud: two overlapping clusters with different slopes.
export function createScatterCloud(seed: number, n = 1500): ScatterPoint[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, (_, i) => {
    const a = rnd() < 0.62;
    const x = a ? 3.2 + gaussian(rnd) * 1.1 : 6.6 + gaussian(rnd) * 0.9;
    const y = a ? 38 + (x - 3.2) * 7 + gaussian(rnd) * 7 : 74 - (x - 6.6) * 4 + gaussian(rnd) * 6;
    return { x: clamp(x, 0.2, 9.8), y: clamp(y, 4, 98), label: `Session ${i + 1}` };
  });
}
