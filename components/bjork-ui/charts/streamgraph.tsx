"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
import { mulberry32 } from "@/components/bjork-ui/_core/random";
import { useChartCanvas, easeOut, writeLabels, type PlacedLabel } from "@/components/bjork-ui/charts/_kit/canvas";
import {
  useChartTheme,
  chartFocusRing,
  ChartTable,
  ChartLegend,
  LabelPool,
  placeTooltip,
  HoverTooltip,
  ChartAnnouncer,
  type TooltipHandle,
  type AnnouncerHandle,
  type TooltipContent,
} from "@/components/bjork-ui/charts/_kit/chrome";
import { clamp, crisp, damp, withAlpha, formatCompact, formatPercent, gaussian } from "@/components/bjork-ui/charts/_kit/scale";

export interface StreamSeries {
  id: string;
  label: string;
  values: number[];
}

export type StreamOffset = "wiggle" | "zero" | "expand";

export interface StreamgraphProps {
  series: StreamSeries[];
  /** One label per column, e.g. month names. */
  x: string[];
  offset?: StreamOffset;
  /** Layer drawn in the accent. */
  highlightId?: string | null;
  defaultHighlightId?: string | null;
  onHighlightChange?: (id: string | null) => void;
  formatValue?: (v: number) => string;
  /** Posed crosshair column. */
  index?: number | null;
  height?: number;
  ariaLabel?: string;
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

const PAD_TOP = 34;
const PAD_BOTTOM = 26;
const PAD_X = 6;
const MORPH_TAU = 0.16;
const ENTER_MS = 1000;
const X_LABELS = 14;
const INLINE_LABELS = 12;
// Neighbouring layers alternate between light and dark ink steps so seams read without hue.
const INK_STEPS = [0.3, 0.15, 0.24, 0.11, 0.34, 0.19, 0.27, 0.13];
const ATTRACT_STEP_MS = 2600;
const ATTRACT_IDLE_MS = 4000;
const OFFSETS: StreamOffset[] = ["wiggle", "zero", "expand"];

const clock = () => performance.now();
const defaultFormatValue = (v: number) => formatCompact(v, 1);

// Inside-out order: layers peaking early and late sit outside, big steady layers sit in the middle.
function insideOut(series: StreamSeries[]): number[] {
  const peaks = series.map((s, i) => {
    let best = 0;
    s.values.forEach((v, j) => {
      if (v > s.values[best]) best = j;
    });
    return { i, peak: best, sum: s.values.reduce((a, b) => a + b, 0) };
  });
  peaks.sort((a, b) => a.peak - b.peak);
  const top: number[] = [];
  const bottom: number[] = [];
  let topSum = 0;
  let botSum = 0;
  for (const p of peaks) {
    if (topSum < botSum) {
      top.push(p.i);
      topSum += p.sum;
    } else {
      bottom.push(p.i);
      botSum += p.sum;
    }
  }
  return [...bottom.reverse(), ...top];
}

// Lower and upper edge per layer (in stack order) per column.
function stack(series: StreamSeries[], order: number[], offset: StreamOffset, m: number): { y0: number[][]; y1: number[][]; lo: number; hi: number } {
  const n = order.length;
  const v = order.map((i) => Array.from({ length: m }, (_, j) => Math.max(0, series[i].values[j] ?? 0)));
  const base = new Array<number>(m).fill(0);
  const totals = Array.from({ length: m }, (_, j) => v.reduce((s, row) => s + row[j], 0));
  if (offset === "wiggle") {
    // Byron & Wattenberg: choose the baseline that minimises the weighted slope of every layer.
    let y = 0;
    base[0] = 0;
    for (let j = 1; j < m; j++) {
      let s1 = 0;
      let s2 = 0;
      for (let i = 0; i < n; i++) {
        const a = v[i][j];
        const b = v[i][j - 1];
        let s3 = (a - b) / 2;
        for (let k = 0; k < i; k++) s3 += v[k][j] - v[k][j - 1];
        s1 += a;
        s2 += s3 * a;
      }
      if (s1) y -= s2 / s1;
      base[j] = y;
    }
    // Centre the stream on zero.
    let mid = 0;
    for (let j = 0; j < m; j++) mid += base[j] + totals[j] / 2;
    mid /= Math.max(1, m);
    for (let j = 0; j < m; j++) base[j] -= mid;
  }
  const y0: number[][] = [];
  const y1: number[][] = [];
  let lo = Infinity;
  let hi = -Infinity;
  const run = base.slice();
  for (let i = 0; i < n; i++) {
    const a: number[] = [];
    const b: number[] = [];
    for (let j = 0; j < m; j++) {
      const val = offset === "expand" ? (totals[j] ? v[i][j] / totals[j] : 0) : v[i][j];
      a.push(run[j]);
      run[j] += val;
      b.push(run[j]);
      lo = Math.min(lo, a[j]);
      hi = Math.max(hi, b[j]);
    }
    y0.push(a);
    y1.push(b);
  }
  if (offset === "zero" || offset === "expand") lo = 0;
  if (offset === "wiggle") {
    const r = Math.max(Math.abs(lo), Math.abs(hi));
    lo = -r;
    hi = r;
  }
  return { y0, y1, lo, hi };
}

interface Run {
  legendW: number;
  legendH: number;
  key: string;
  y0: number[][];
  y1: number[][];
  lo: number;
  hi: number;
  ready: boolean;
  enter: number;
  hoverLayer: number | null; // stack index
  col: number | null;
  source: "pointer" | "keyboard" | "prop" | "attract" | null;
  plot: { l: number; r: number; t: number; b: number };
  xCache: string[];
  inCache: string[];
  lastInput: number;
  attractAt: number;
  attractK: number;
}

export function Streamgraph({
  series,
  x,
  offset = "wiggle",
  highlightId: highlightProp,
  defaultHighlightId = null,
  onHighlightChange,
  formatValue = defaultFormatValue,
  index,
  height = 340,
  ariaLabel = "Streamgraph",
  tone: toneProp,
  attract = false,
  className,
}: StreamgraphProps) {
  const { pal, reduce, vars } = useChartTheme(toneProp);
  const announcer = useRef<AnnouncerHandle>(null);
  const tipRef = useRef<TooltipHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const xPool = useRef<(HTMLSpanElement | null)[]>([]);
  const inPool = useRef<(HTMLSpanElement | null)[]>([]);
  const rectRef = useRef<DOMRect | null>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const [hlState, setHlState] = useState<string | null>(defaultHighlightId);
  const highlightId = highlightProp !== undefined ? highlightProp : hlState;
  const [legendHover, setLegendHover] = useState<string | null>(null);

  const m = x.length;
  const order = useMemo(() => insideOut(series), [series]);
  // Attract drives a local offset; the prop takes over on any real input.
  const [attractOffset, setAttractOffset] = useState<StreamOffset | null>(null);
  const effectiveOffset = attract && attractOffset ? attractOffset : offset;
  const stacked = useMemo(() => stack(series, order, effectiveOffset, m), [series, order, effectiveOffset, m]);

  const cfg = useRef({ series, order, stacked, offset, x, highlightId, legendHover, reduce, pal, attract, formatValue });
  useEffect(() => {
    cfg.current = { series, order, stacked, offset, x, highlightId, legendHover, reduce, pal, attract, formatValue };
  });

  const st = useRef<Run>({
    legendW: 0,
    legendH: 12,
    key: "",
    y0: [],
    y1: [],
    lo: 0,
    hi: 1,
    ready: false,
    enter: 0,
    hoverLayer: null,
    col: index ?? null,
    source: index != null ? "prop" : null,
    plot: { l: 0, r: 0, t: 0, b: 0 },
    xCache: [],
    inCache: [],
    lastInput: 0,
    attractAt: 0,
    attractK: 0,
  });
  const offsetSetter = useRef<(o: StreamOffset) => void>(() => {});

  const { rootRef, hostRef, canvasRef, wake } = useChartCanvas(({ ctx, w, h, dt }) => {
    const s = st.current;
    const c = cfg.current;
    const p = c.pal;
    const S = c.stacked;
    const n = S.y0.length;
    const cols = c.x.length;
    // The legend may wrap on narrow widths; the plot starts below it.
    if (s.legendW !== w) {
      s.legendW = w;
      s.legendH = legendRef.current?.offsetHeight ?? 12;
    }
    const plot = { l: PAD_X, r: w - PAD_X, t: Math.max(PAD_TOP, s.legendH + 22), b: h - PAD_BOTTOM };
    s.plot = plot;
    const xOf = (j: number) => plot.l + (j / Math.max(1, cols - 1)) * (plot.r - plot.l);

    // Layer edges glide between offsets.
    let moving = false;
    if (!s.ready || c.reduce || s.y0.length !== n || (s.y0[0]?.length ?? 0) !== cols) {
      s.y0 = S.y0.map((r) => r.slice());
      s.y1 = S.y1.map((r) => r.slice());
      s.lo = S.lo;
      s.hi = S.hi;
      s.ready = true;
    } else {
      const tol = (S.hi - S.lo) * 1e-4;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < cols; j++) {
          s.y0[i][j] = damp(s.y0[i][j], S.y0[i][j], MORPH_TAU, dt);
          s.y1[i][j] = damp(s.y1[i][j], S.y1[i][j], MORPH_TAU, dt);
          if (Math.abs(s.y0[i][j] - S.y0[i][j]) + Math.abs(s.y1[i][j] - S.y1[i][j]) > tol) moving = true;
        }
      }
      s.lo = damp(s.lo, S.lo, MORPH_TAU, dt);
      s.hi = damp(s.hi, S.hi, MORPH_TAU, dt);
      if (Math.abs(s.lo - S.lo) + Math.abs(s.hi - S.hi) > tol) moving = true;
    }
    const yOf = (v: number) => plot.b - ((v - s.lo) / Math.max(1e-12, s.hi - s.lo)) * (plot.b - plot.t);
    const midY = (plot.t + plot.b) / 2;

    s.enter = c.reduce ? 1 : Math.min(1, s.enter + (dt * 1000) / ENTER_MS);
    const e = easeOut(s.enter);
    // During the entrance every edge rises out of the centre line, the left side first.
    const yAt = (val: number, j: number) => {
      const y = yOf(val);
      if (s.enter >= 1) return y;
      const k = clamp(e * 1.4 - (j / Math.max(1, cols - 1)) * 0.4, 0, 1);
      return midY + (y - midY) * easeOut(k);
    };

    // Column gridlines at the labelled columns.
    const step = Math.max(1, Math.ceil(64 / Math.max(1, (plot.r - plot.l) / Math.max(1, cols - 1))));
    ctx.strokeStyle = p.hair;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const xl: PlacedLabel[] = [];
    for (let j = 0; j < cols; j += step) {
      const xx = crisp(xOf(j));
      ctx.moveTo(xx, plot.t);
      ctx.lineTo(xx, plot.b);
      if (xx > plot.l + 12 && xx < plot.r - 12) xl.push({ text: c.x[j], x: xx, y: plot.b + 14, ax: -50 });
    }
    ctx.stroke();
    writeLabels(xPool.current, s.xCache, xl);

    // Layers: smooth bump curves between columns, a surface seam between neighbours.
    const hlStack = c.highlightId ? c.order.findIndex((i) => c.series[i].id === c.highlightId) : -1;
    const lgStack = c.legendHover ? c.order.findIndex((i) => c.series[i].id === c.legendHover) : -1;
    const focus = lgStack >= 0 ? lgStack : s.hoverLayer;
    const trace = (edge: number[], reverse: boolean) => {
      const js = reverse ? Array.from({ length: cols }, (_, k) => cols - 1 - k) : Array.from({ length: cols }, (_, k) => k);
      js.forEach((j, k) => {
        const xx = xOf(j);
        const yy = yAt(edge[j], j);
        if (k === 0) {
          if (reverse) ctx.lineTo(xx, yy);
          else ctx.moveTo(xx, yy);
          return;
        }
        const pj = js[k - 1];
        const px = xOf(pj);
        const py = yAt(edge[pj], pj);
        const mx = (px + xx) / 2;
        ctx.bezierCurveTo(mx, py, mx, yy, xx, yy);
      });
    };
    const inline: PlacedLabel[] = [];
    for (let k = 0; k < n; k++) {
      const isHl = k === hlStack;
      const isFocus = k === focus;
      ctx.beginPath();
      trace(s.y1[k], false);
      trace(s.y0[k], true);
      ctx.closePath();
      const base = INK_STEPS[k % INK_STEPS.length];
      const dim = focus !== null && !isFocus && !isHl ? 0.55 : 1;
      ctx.fillStyle = isHl ? withAlpha(p.accent, isFocus || focus === null ? 0.72 : 0.5) : withAlpha(p.text, (isFocus ? base + 0.16 : base) * dim);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = p.stage;
      ctx.stroke();

      // Inline label at the layer's thickest column, if the layer is thick enough there.
      let bestJ = -1;
      let bestT = 0;
      for (let j = 1; j < cols - 1; j++) {
        const t = yAt(s.y0[k][j], j) - yAt(s.y1[k][j], j);
        if (t > bestT) {
          bestT = t;
          bestJ = j;
        }
      }
      if (bestJ >= 0 && bestT > 18 && s.enter > 0.8) {
        const text = c.series[c.order[k]].label;
        const half = text.length * 3.3 + 4; // Alpha 11px averages ~6.6px per character
        inline.push({
          text,
          x: clamp(xOf(bestJ), plot.l + half, plot.r - half),
          y: (yAt(s.y0[k][bestJ], bestJ) + yAt(s.y1[k][bestJ], bestJ)) / 2,
          ax: -50,
          opacity: clamp((s.enter - 0.8) * 5, 0, 1) * (focus !== null && !isFocus && !isHl ? 0.5 : 1),
        });
      }
    }
    writeLabels(inPool.current, s.inCache, inline);
    // Inline label colour follows its layer: light text on the accent, ink elsewhere.
    for (let k = 0; k < inPool.current.length; k++) {
      const el = inPool.current[k];
      const it = inline[k];
      if (!el || !it) continue;
      const strong = c.series.find((sr) => sr.label === it.text)?.id === c.highlightId;
      el.dataset.on = strong ? "accent" : "ink";
    }

    // Crosshair column.
    if (s.col !== null && s.col >= 0 && s.col < cols) {
      const xx = crisp(xOf(s.col) - 0.5);
      ctx.strokeStyle = p.text;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(xx, plot.t - 4);
      ctx.lineTo(xx, plot.b);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const tip = tipRef.current;
      if (tip?.el) {
        const pos = placeTooltip(xOf(s.col), plot.t + 10, tip.size.w, tip.size.h, w, h, 14);
        tip.el.style.transform = `translate3d(${pos.x}px, ${Math.max(plot.t, pos.y)}px, 0)`;
      }
    }

    // Attract: step the offsets.
    if (c.attract && !c.reduce && (!s.lastInput || clock() - s.lastInput > ATTRACT_IDLE_MS)) {
      if (clock() - s.attractAt > ATTRACT_STEP_MS) {
        s.attractAt = clock();
        s.attractK = (s.attractK + 1) % OFFSETS.length;
        offsetSetter.current(OFFSETS[s.attractK]);
      }
      return true;
    }
    return moving || s.enter < 1;
  });

  useEffect(() => {
    offsetSetter.current = (o) => setAttractOffset(o);
  });

  useEffect(() => {
    wake();
  }, [series, x, stacked, highlightId, legendHover, pal, reduce, attract, wake]);

  const tooltipFor = (j: number): TooltipContent => {
    const total = series.reduce((sum, sr) => sum + (sr.values[j] ?? 0), 0);
    const hl = st.current.hoverLayer;
    const rows = [...order].reverse().map((i) => {
      const sr = series[i];
      const v = sr.values[j] ?? 0;
      const stackIdx = order.indexOf(i);
      return {
        key: sr.id,
        label: sr.label,
        value: effectiveOffset === "expand" ? formatPercent(total ? v / total : 0, 0) : formatValue(v),
        color: sr.id === highlightId ? pal.accent : withAlpha(pal.text, INK_STEPS[stackIdx % INK_STEPS.length] + 0.25),
        strong: hl === null || hl === stackIdx || sr.id === highlightId,
      };
    });
    return { key: `${j}|${hl}|${effectiveOffset}|${highlightId}|${pal.text}`, title: `${x[j]} · ${formatValue(total)} total`, rows };
  };

  const setCursor = (j: number | null, layer: number | null, source: Run["source"]) => {
    const s = st.current;
    const changed = s.col !== j || s.hoverLayer !== layer;
    s.col = j;
    s.hoverLayer = layer;
    s.source = j === null ? null : source;
    if (changed) tipRef.current?.set(j === null ? null : tooltipFor(j));
    if (changed && j !== null && source === "keyboard") {
      const sr = layer !== null ? series[order[layer]] : null;
      announcer.current?.say(sr ? `${x[j]}: ${sr.label} ${formatValue(sr.values[j] ?? 0)}` : `${x[j]}: total ${formatValue(series.reduce((a, b) => a + (b.values[j] ?? 0), 0))}`);
    }
    wake();
  };

  useEffect(() => {
    if (index === undefined) return;
    setCursor(index, null, index === null ? null : "prop");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, pal]);

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    st.current.lastInput = clock();
    const rect = rectRef.current ?? wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const s = st.current;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (px < s.plot.l || px > s.plot.r || py < s.plot.t - 8 || py > s.plot.b + 4) {
      setCursor(null, null, null);
      return;
    }
    const j = clamp(Math.round(((px - s.plot.l) / (s.plot.r - s.plot.l)) * (m - 1)), 0, m - 1);
    // Layer under the pointer, from the displayed edges at that column.
    const yOf = (v: number) => s.plot.b - ((v - s.lo) / Math.max(1e-12, s.hi - s.lo)) * (s.plot.b - s.plot.t);
    let layer: number | null = null;
    for (let k = 0; k < s.y0.length; k++) {
      if (py <= yOf(s.y0[k][j]) && py >= yOf(s.y1[k][j])) layer = k;
    }
    setCursor(j, layer, "pointer");
  };

  const pin = (id: string | null) => {
    if (highlightProp === undefined) setHlState(id);
    onHighlightChange?.(id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = st.current;
    s.lastInput = clock();
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const j = s.col === null || s.source === "attract" ? m - 1 : clamp(s.col + (e.key === "ArrowLeft" ? -1 : 1), 0, m - 1);
      setCursor(j, s.hoverLayer, "keyboard");
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const n = order.length;
      const cur = s.hoverLayer ?? (e.key === "ArrowUp" ? -1 : n);
      setCursor(s.col ?? m - 1, clamp(cur + (e.key === "ArrowUp" ? 1 : -1), 0, n - 1), "keyboard");
    } else if ((e.key === "Enter" || e.key === " ") && s.hoverLayer !== null) {
      e.preventDefault();
      const id = series[order[s.hoverLayer]].id;
      pin(highlightId === id ? null : id);
    } else if (e.key === "Escape") setCursor(null, null, null);
  };

  const legend = useMemo(
    () =>
      [...order].reverse().map((i) => {
        const sr = series[i];
        const k = order.indexOf(i);
        return { id: sr.id, label: sr.label, color: sr.id === highlightId ? pal.accent : withAlpha(pal.text, INK_STEPS[k % INK_STEPS.length] + 0.18), shape: "rect" as const };
      }),
    [order, series, highlightId, pal],
  );

  const tableRows = useMemo(() => x.map((label, j) => [label, ...series.map((sr) => formatValue(sr.values[j] ?? 0))]), [x, series, formatValue]);
  const tableCols = useMemo(() => ["Period", ...series.map((sr) => sr.label)], [series]);

  return (
    <div ref={rootRef} data-loop="idle" className={cn("relative w-full select-none text-[color:var(--bjork-text)]", className)} style={{ ...vars, height }}>
      <div ref={hostRef} className="pointer-events-none absolute inset-0">
        <canvas ref={canvasRef} role="img" aria-label={`${ariaLabel}: ${series.length} layers over ${x.length} periods`} className="pointer-events-none absolute left-0 top-0" />
      </div>
      <div
        ref={wrapperRef}
        role="group"
        aria-roledescription="chart"
        aria-label={`${ariaLabel}. Left and right move through periods, up and down move between layers, Enter pins a layer.`}
        tabIndex={0}
        onPointerEnter={() => {
          if (wrapperRef.current) rectRef.current = wrapperRef.current.getBoundingClientRect();
        }}
        onPointerMove={onPointerMove}
        onPointerDown={(e) => {
          if (wrapperRef.current) rectRef.current = wrapperRef.current.getBoundingClientRect();
          if (e.pointerType === "touch") onPointerMove(e);
        }}
        onClick={() => {
          const s = st.current;
          if (s.hoverLayer === null) return;
          const id = series[order[s.hoverLayer]].id;
          pin(highlightId === id ? null : id);
        }}
        onPointerLeave={() => setCursor(null, null, null)}
        onKeyDown={onKeyDown}
        className={cn("absolute inset-0 cursor-crosshair touch-pan-y rounded-[10px]", chartFocusRing)}
      />
      <div ref={legendRef} className="absolute inset-x-0 top-0 z-10">
        <ChartLegend items={legend} onHover={setLegendHover} activeId={legendHover} />
      </div>
      <div className="pointer-events-none absolute inset-0">
        <LabelPool count={X_LABELS} pool={xPool} />
        <LabelPool
          count={INLINE_LABELS}
          pool={inPool}
          className="font-bjork-alpha text-[11px] font-medium leading-none text-[color:var(--bjork-text)] [text-box:trim-both_cap_alphabetic] data-[on=accent]:text-[color:var(--bjork-accent-foreground)]"
        />
        <HoverTooltip ref={tipRef} onMeasure={wake} />
      </div>
      <ChartTable caption={ariaLabel} columns={tableCols} rows={tableRows} />
      <ChartAnnouncer ref={announcer} />
    </div>
  );
}

// Seeded demo series: monthly listening hours by genre, each with its own season and trend.
export function createGenreSeries(seed: number, months: number): StreamSeries[] {
  const rnd = mulberry32(seed);
  const genres = ["Ambient", "Jazz", "Hip-hop", "Electronic", "Indie", "Classical", "Pop", "Folk"];
  return genres.map((label) => {
    const base = 18 + rnd() * 40;
    // One or two seasonal swells per layer, at their own times.
    const swells = Array.from({ length: 1 + Math.floor(rnd() * 2) }, () => ({ at: rnd() * months, width: months * (0.06 + rnd() * 0.12), amp: base * (1.2 + rnd() * 2.4) }));
    const trend = (rnd() - 0.45) * 2.4;
    let noise = 0;
    return {
      id: label.toLowerCase(),
      label,
      values: Array.from({ length: months }, (_, j) => {
        noise = noise * 0.6 + gaussian(rnd) * 3;
        const swell = swells.reduce((sum, sw) => sum + Math.exp(-((j - sw.at) ** 2) / (2 * sw.width * sw.width)) * sw.amp, 0);
        return Math.max(3, base + swell + trend * j + noise);
      }),
    };
  });
}
