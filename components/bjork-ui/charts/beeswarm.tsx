"use client";

import { useEffect, useMemo, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
import { mulberry32 } from "@/components/bjork-ui/_core/random";
import { cubicBezier } from "@/components/bjork-ui/_core/motion";
import { useChartCanvas, hatchPattern, writeLabels } from "@/components/bjork-ui/charts/_kit/canvas";
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
import { clamp, crisp, damp, niceDomain, niceTicks, quantile, withAlpha, formatNumber, gaussian } from "@/components/bjork-ui/charts/_kit/scale";

export interface SwarmItem {
  id: string;
  value: number;
  label?: string;
  group?: string;
}

export interface SwarmBand {
  from?: number;
  to?: number;
  label: string;
  /** "hatch" marks a region to discount; "accent" marks the verdict region and colours its dots. */
  style?: "hatch" | "accent";
}

export interface BeeswarmProps {
  /** One dot per item. x is the exact value; packing only moves dots off the axis, and the radius shrinks until the swarm fits the height. */
  items: SwarmItem[];
  /** "log" needs positive values; non-positive ones are left out of the plot (they stay in the table). */
  scale?: "linear" | "log";
  /** Fixed value domain. Auto by default (nice on linear, whole decades on log). */
  domain?: [number, number];
  bands?: SwarmBand[];
  /** Item drawn in the accent with a ring. */
  highlightId?: string | null;
  /** Called on click, or Enter/Space on the keyboard-focused dot. */
  onSelect?: (item: SwarmItem) => void;
  /** Preferred dot radius in px; it shrinks when the swarm would overflow. */
  radius?: number;
  formatValue?: (v: number) => string;
  height?: number;
  ariaLabel?: string;
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

const PAD_TOP = 26;
const PAD_BOTTOM = 26;
const PAD_X = 16;
const MOVE_TAU = 0.14;
const RAIN_MS = 640;
const FALL_MS = 460;
const RIPPLE_MS = 900;
const X_LABELS = 12;
const BAND_LABELS = 6;
const ATTRACT_STEP_MS = 1400;
const ATTRACT_IDLE_MS = 4000;
const OFF_PLOT = -1e5;
const settle = cubicBezier(0.34, 1.36, 0.64, 1); // a small overshoot on landing

const clock = () => performance.now();
const defaultFormatValue = (v: number) => formatNumber(v, 1);

// Two-sided swarm: each dot takes the free y offset closest to the axis. r shrinks until it fits.
function layoutSwarm(xs: Float64Array, order: number[], r0: number, halfH: number): { ys: Float64Array; r: number } {
  let r = r0;
  const ys = new Float64Array(xs.length);
  for (let attempt = 0; attempt < 8; attempt++) {
    const d = r * 2 + 0.75;
    const placed: number[] = [];
    let worst = 0;
    let head = 0;
    for (const i of order) {
      const x = xs[i];
      while (head < placed.length && x - xs[placed[head]] > d) head++;
      const blocked: [number, number][] = [];
      for (let k = head; k < placed.length; k++) {
        const j = placed[k];
        const dx = x - xs[j];
        if (Math.abs(dx) >= d) continue;
        const dy = Math.sqrt(d * d - dx * dx);
        blocked.push([ys[j] - dy, ys[j] + dy]);
      }
      let best = 0;
      if (blocked.length) {
        const cands = [0];
        for (const [a, b] of blocked) cands.push(a, b);
        cands.sort((a, b) => Math.abs(a) - Math.abs(b));
        best = cands.find((y) => blocked.every(([a, b]) => y <= a + 1e-6 || y >= b - 1e-6)) ?? 0;
      }
      ys[i] = best;
      worst = Math.max(worst, Math.abs(best));
      // Keep `placed` sorted by x for the sliding window.
      placed.push(i);
    }
    if (worst + r <= halfH || r < 1.6) return { ys, r };
    r *= 0.88;
  }
  return { ys, r };
}

interface Run {
  key: string;
  idsKey: string;
  items: SwarmItem[] | null;
  xs: Float64Array;
  ys: Float64Array;
  dx: Float64Array;
  dy: Float64Array;
  r: number;
  rank: Int32Array; // position in value order
  order: number[];
  enter: number;
  hasLayout: boolean;
  hover: number | null;
  source: "pointer" | "keyboard" | "attract" | null;
  plot: { l: number; r: number; t: number; b: number; cy: number };
  xCache: string[];
  bandCache: string[];
  grid: Map<number, number[]>;
  lastInput: number;
  attractAt: number;
}

export function Beeswarm({
  items,
  scale = "linear",
  domain,
  bands = [],
  highlightId,
  onSelect,
  radius = 4,
  formatValue = defaultFormatValue,
  height = 280,
  ariaLabel = "Beeswarm",
  tone: toneProp,
  attract = false,
  className,
}: BeeswarmProps) {
  const { pal, reduce, vars } = useChartTheme(toneProp);
  const announcer = useRef<AnnouncerHandle>(null);
  const tipRef = useRef<TooltipHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const xPool = useRef<(HTMLSpanElement | null)[]>([]);
  const bandPool = useRef<(HTMLSpanElement | null)[]>([]);
  const rectRef = useRef<DOMRect | null>(null);

  const dom = useMemo<[number, number]>(() => {
    if (domain) return domain;
    let lo = Infinity;
    let hi = -Infinity;
    for (const it of items) {
      if (!Number.isFinite(it.value) || (scale === "log" && it.value <= 0)) continue;
      lo = Math.min(lo, it.value);
      hi = Math.max(hi, it.value);
    }
    if (!Number.isFinite(lo)) return [0, 1];
    if (scale === "log") return [10 ** Math.floor(Math.log10(lo)), 10 ** Math.ceil(Math.log10(hi))];
    return niceDomain(lo, hi, 6);
  }, [items, domain, scale]);

  const cfg = useRef({ items, scale, dom, bands, highlightId, radius, reduce, pal, formatValue, attract });
  useEffect(() => {
    cfg.current = { items, scale, dom, bands, highlightId, radius, reduce, pal, formatValue, attract };
  });

  const hoverRef = useRef<(i: number | null, source: Run["source"]) => void>(() => {});
  const st = useRef<Run>({
    key: "",
    idsKey: "",
    items: null,
    xs: new Float64Array(0),
    ys: new Float64Array(0),
    dx: new Float64Array(0),
    dy: new Float64Array(0),
    r: radius,
    rank: new Int32Array(0),
    order: [],
    enter: 0,
    hasLayout: false,
    hover: null,
    source: null,
    plot: { l: 0, r: 0, t: 0, b: 0, cy: 0 },
    xCache: [],
    bandCache: [],
    grid: new Map(),
    lastInput: 0,
    attractAt: 0,
  });

  const { rootRef, hostRef, canvasRef, wake } = useChartCanvas(({ ctx, w, h, dt }) => {
    const s = st.current;
    const c = cfg.current;
    const p = c.pal;
    const I = c.items;
    const n = I.length;
    const [d0, d1] = c.dom;
    const plot = { l: PAD_X, r: w - PAD_X, t: PAD_TOP, b: h - PAD_BOTTOM, cy: 0 };
    plot.cy = (plot.t + plot.b) / 2;
    s.plot = plot;
    const log = c.scale === "log";
    const tx = (v: number) => (log ? Math.log10(Math.max(v, 1e-12)) : v);
    const t0 = tx(d0);
    const t1 = tx(d1);
    const xOf = (v: number) => plot.l + ((tx(v) - t0) / Math.max(1e-12, t1 - t0)) * (plot.r - plot.l);

    // Layout when data, scale or size change. Existing dots glide to their new places.
    const key = `${n}|${c.scale}|${d0}|${d1}|${w}|${h}|${c.radius}|${I[0]?.id}|${I[n - 1]?.id}`;
    if (key !== s.key || I !== s.items) {
      s.items = I;
      const xs = new Float64Array(n);
      // Values the scale can't place (non-finite, or non-positive on log) park far off the plot and are not drawn.
      for (let i = 0; i < n; i++) {
        const v = I[i].value;
        xs[i] = Number.isFinite(v) && (!log || v > 0) ? xOf(v) : OFF_PLOT;
      }
      const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => xs[a] - xs[b]);
      const { ys, r } = layoutSwarm(
        xs,
        order.filter((i) => xs[i] !== OFF_PLOT),
        c.radius,
        (plot.b - plot.t) / 2 - 2,
      );
      const idsKey = `${I[0]?.id}|${I[n - 1]?.id}|${n}`;
      const sameItems = s.hasLayout && s.idsKey === idsKey;
      s.idsKey = idsKey;
      if (!sameItems) {
        s.dx = Float64Array.from(xs);
        s.dy = Float64Array.from(ys);
        s.enter = c.reduce ? 1 : 0;
      }
      s.xs = xs;
      s.ys = ys;
      s.r = r;
      s.order = order;
      s.rank = new Int32Array(n);
      order.forEach((i, k) => (s.rank[i] = k));
      s.key = key;
      s.hasLayout = true;
      // Spatial hash for nearest-dot hover (24px cells).
      s.grid = new Map();
      for (let i = 0; i < n; i++) {
        const cell = Math.floor(xs[i] / 24) * 10007 + Math.floor((ys[i] + 1000) / 24);
        const list = s.grid.get(cell);
        if (list) list.push(i);
        else s.grid.set(cell, [i]);
      }
    }

    let moving = false;
    for (let i = 0; i < n; i++) {
      if (c.reduce) {
        s.dx[i] = s.xs[i];
        s.dy[i] = s.ys[i];
        continue;
      }
      s.dx[i] = damp(s.dx[i], s.xs[i], MOVE_TAU, dt);
      s.dy[i] = damp(s.dy[i], s.ys[i], MOVE_TAU, dt);
      if (Math.abs(s.dx[i] - s.xs[i]) + Math.abs(s.dy[i] - s.ys[i]) > 0.05) moving = true;
      else {
        s.dx[i] = s.xs[i];
        s.dy[i] = s.ys[i];
      }
    }
    const total = RAIN_MS + FALL_MS + RIPPLE_MS;
    s.enter = c.reduce ? 1 : Math.min(1, s.enter + (dt * 1000) / total);
    const ms = s.enter * total;

    // Bands: hatched or accent-washed regions, labelled at the top.
    const bandLabels: { text: string; x: number; y: number; ax: number }[] = [];
    const hatch = hatchPattern(ctx, withAlpha(p.text, 0.13), 5, 1);
    for (const b of c.bands) {
      const a = b.from === undefined ? plot.l : clamp(xOf(b.from), plot.l, plot.r);
      const z = b.to === undefined ? plot.r : clamp(xOf(b.to), plot.l, plot.r);
      if (z - a < 1) continue;
      if (b.style === "accent") {
        ctx.fillStyle = withAlpha(p.accentSoft, 0.45);
        ctx.fillRect(a, plot.t - 8, z - a, plot.b - plot.t + 8);
      } else if (hatch) {
        ctx.fillStyle = hatch;
        ctx.fillRect(a, plot.t - 8, z - a, plot.b - plot.t + 8);
      }
      ctx.strokeStyle = b.style === "accent" ? withAlpha(p.accentInk, 0.5) : p.textFaint;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (b.from !== undefined) {
        ctx.moveTo(crisp(a), plot.t - 8);
        ctx.lineTo(crisp(a), plot.b);
      }
      if (b.to !== undefined) {
        ctx.moveTo(crisp(z), plot.t - 8);
        ctx.lineTo(crisp(z), plot.b);
      }
      ctx.stroke();
      bandLabels.push({ text: b.label, x: b.from === undefined ? z - 6 : a + 6, y: plot.t - 16, ax: b.from === undefined ? -100 : 0 });
    }
    writeLabels(bandPool.current, s.bandCache, bandLabels);

    // Axis.
    const ticks = log ? logTicks(d0, d1) : niceTicks(d0, d1, Math.max(3, Math.floor((plot.r - plot.l) / 90)));
    ctx.strokeStyle = p.hair;
    ctx.beginPath();
    for (const v of ticks) {
      const x = crisp(xOf(v));
      ctx.moveTo(x, plot.t - 8);
      ctx.lineTo(x, plot.b);
    }
    ctx.stroke();
    ctx.strokeStyle = p.textFaint;
    ctx.beginPath();
    ctx.moveTo(plot.l, crisp(plot.b));
    ctx.lineTo(plot.r, crisp(plot.b));
    ctx.stroke();
    writeLabels(xPool.current, s.xCache, ticks.map((v) => ({ text: c.formatValue(v), x: xOf(v), y: plot.b + 13, ax: -50 })));

    // Dots: rain in by value order, landing with a small settle. Accent band dots carry the accent.
    const r = s.r;
    const inAccent = (v: number) => c.bands.some((b) => b.style === "accent" && (b.from === undefined || v >= b.from) && (b.to === undefined || v <= b.to));
    let hlIndex = -1;
    for (let i = 0; i < n; i++) {
      let y = plot.cy + s.dy[i];
      let alpha = 1;
      if (s.enter < 1) {
        const delay = (s.rank[i] / Math.max(1, n)) * RAIN_MS;
        const k = clamp((ms - delay) / FALL_MS, 0, 1);
        if (k <= 0) continue;
        y = plot.t - 20 + (y - (plot.t - 20)) * settle(k);
        alpha = Math.min(1, k * 3);
      }
      if (s.xs[i] === OFF_PLOT) continue;
      const it = I[i];
      if (it.id === c.highlightId) {
        hlIndex = i;
        continue;
      }
      const acc = inAccent(it.value);
      const hov = s.hover === i;
      ctx.beginPath();
      ctx.arc(s.dx[i], y, r, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(acc ? p.accent : p.text, (acc ? 0.78 : 0.42) * alpha);
      ctx.fill();
      if (r >= 2.5) {
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = p.stage;
        ctx.stroke();
      }
      if (hov) {
        ctx.beginPath();
        ctx.arc(s.dx[i], y, r + 2.5, 0, Math.PI * 2);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = p.text;
        ctx.stroke();
      }
    }
    // The highlighted item sits on top, with a ripple once it lands.
    if (hlIndex >= 0) {
      const i = hlIndex;
      const y = plot.cy + s.dy[i];
      const landed = (ms - RAIN_MS - FALL_MS) / RIPPLE_MS;
      if (landed > 0 && landed < 1) {
        ctx.beginPath();
        ctx.arc(s.dx[i], y, r + 2 + 14 * (1 - Math.pow(1 - landed, 3)), 0, Math.PI * 2);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = withAlpha(p.accent, 0.5 * (1 - landed));
        ctx.stroke();
      }
      if (s.enter >= 1 || landed > -0.5) {
        ctx.beginPath();
        ctx.arc(s.dx[i], y, r + 1, 0, Math.PI * 2);
        ctx.fillStyle = p.accent;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = p.stage;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(s.dx[i], y, r + 4.5, 0, Math.PI * 2);
        ctx.lineWidth = 1;
        ctx.strokeStyle = p.accentInk;
        ctx.stroke();
      }
    }

    const tip = tipRef.current;
    if (tip?.el && s.hover !== null && s.hover < n) {
      const pos = placeTooltip(s.dx[s.hover], plot.cy + s.dy[s.hover], tip.size.w, tip.size.h, w, h, 12);
      tip.el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
    }

    // Attract: hop between random dots.
    if (c.attract && !c.reduce && n && (!s.lastInput || clock() - s.lastInput > ATTRACT_IDLE_MS)) {
      if (clock() - s.attractAt > ATTRACT_STEP_MS) {
        s.attractAt = clock();
        const i = s.order[Math.floor(((s.attractAt / ATTRACT_STEP_MS) * 0.618 * n) % n)];
        hoverRef.current(i, "attract");
      }
      return true;
    }

    return moving || s.enter < 1;
  });

  const tooltipFor = (i: number): TooltipContent | null => {
    const it = items[i];
    if (!it) return null;
    return {
      key: `${it.id}|${pal.text}`,
      title: it.group,
      rows: [{ key: "v", label: it.label ?? it.id, value: formatValue(it.value) }],
    };
  };

  const setHover = (i: number | null, source: Run["source"]) => {
    const s = st.current;
    if (s.hover === i && s.source === source) return;
    s.hover = i;
    s.source = i === null ? null : source;
    tipRef.current?.set(i === null ? null : tooltipFor(i));
    if (i !== null && source === "keyboard") {
      const it = items[i];
      announcer.current?.say(`${it.label ?? it.id}${it.group ? `, ${it.group}` : ""}: ${formatValue(it.value)}, ${s.rank[i] + 1} of ${items.length}`);
    }
    wake();
  };
  useEffect(() => {
    hoverRef.current = setHover;
  });

  useEffect(() => {
    wake();
  }, [items, scale, dom, bands, highlightId, radius, pal, reduce, attract, wake]);

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    st.current.lastInput = clock();
    const rect = rectRef.current ?? wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const s = st.current;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top - s.plot.cy;
    const cx = Math.floor(x / 24);
    const cy = Math.floor((y + 1000) / 24);
    let best = -1;
    let bd = 24 * 24;
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const list = s.grid.get(gx * 10007 + gy);
        if (!list) continue;
        for (const i of list) {
          const d = (s.xs[i] - x) ** 2 + (s.ys[i] - y) ** 2;
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
      }
    }
    setHover(best >= 0 ? best : null, "pointer");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = st.current;
    s.lastInput = clock();
    const n = items.length;
    if (!n) return;
    const curRank = s.hover !== null && s.source !== "attract" ? s.rank[s.hover] : -1;
    let nextRank: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") nextRank = curRank < 0 ? (e.key === "ArrowRight" ? 0 : n - 1) : clamp(curRank + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 10 : 1), 0, n - 1);
    else if (e.key === "Home") nextRank = 0;
    else if (e.key === "End") nextRank = n - 1;
    else if ((e.key === "Enter" || e.key === " ") && s.hover !== null) {
      e.preventDefault();
      onSelect?.(items[s.hover]);
      return;
    } else if (e.key === "Escape") {
      setHover(null, null);
      return;
    }
    if (nextRank === null) return;
    e.preventDefault();
    setHover(s.order[nextRank], "keyboard");
  };

  const tableRows = useMemo(() => [...items].sort((a, b) => a.value - b.value).map((it) => [it.label ?? it.id, it.group ?? "", formatValue(it.value)]), [items, formatValue]);
  const tableCols = useMemo(() => ["Item", "Group", "Value"], []);
  const summary = useMemo(() => {
    const vs = items.map((it) => it.value).filter(Number.isFinite).sort((a, b) => a - b);
    if (!vs.length) return `${ariaLabel}: no items`;
    const parts = [`${ariaLabel}: ${items.length} items from ${formatValue(vs[0])} to ${formatValue(vs[vs.length - 1])}, median ${formatValue(quantile(vs, 0.5))}`];
    for (const b of bands) {
      const k = vs.filter((v) => (b.from === undefined || v >= b.from) && (b.to === undefined || v <= b.to)).length;
      parts.push(`${k} in ${b.label}`);
    }
    return parts.join(", ");
  }, [items, bands, formatValue, ariaLabel]);

  return (
    <div ref={rootRef} data-loop="idle" className={cn("relative w-full select-none text-[color:var(--bjork-text)]", className)} style={{ ...vars, height }}>
      <div
        ref={wrapperRef}
        role="group"
        aria-roledescription="chart"
        aria-label={`${ariaLabel}. Left and right walk the dots in value order, Enter selects.`}
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
          if (s.hover !== null) onSelect?.(items[s.hover]);
        }}
        onPointerLeave={() => setHover(null, null)}
        onKeyDown={onKeyDown}
        className={cn("absolute inset-0 cursor-crosshair touch-pan-y rounded-[10px]", chartFocusRing)}
      >
        <div ref={hostRef} className="absolute inset-0">
          <canvas ref={canvasRef} role="img" aria-label={summary} className="pointer-events-none absolute left-0 top-0" />
        </div>
        <LabelPool count={X_LABELS} pool={xPool} />
        <LabelPool count={BAND_LABELS} pool={bandPool} className="font-mono text-[9px] uppercase leading-none tracking-[0.1em] text-[color:var(--bjork-text-soft)] [text-box:trim-both_cap_alphabetic]" />
        <HoverTooltip ref={tipRef} onMeasure={wake} />
      </div>
      <ChartTable caption={ariaLabel} columns={tableCols} rows={tableRows} />
      <ChartAnnouncer ref={announcer} />
    </div>
  );
}

function logTicks(d0: number, d1: number): number[] {
  const out: number[] = [];
  for (let k = Math.floor(Math.log10(d0)); k <= Math.ceil(Math.log10(d1)); k++) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** k;
      if (v >= d0 && v <= d1) out.push(v);
    }
  }
  return out;
}

// Seeded demo items: "edge" is the edge % of placed bets, "deals" is deal size in dollars.
export function createSwarmItems(seed: number, kind: "edge" | "deals", n = 280): SwarmItem[] {
  const rnd = mulberry32(seed);
  const books = ["Book A", "Book B", "Book C", "Book D"];
  return Array.from({ length: n }, (_, i) => {
    if (kind === "edge") {
      const v = clamp(0.9 + gaussian(rnd) * 1.4 + (rnd() < 0.12 ? 2.4 : 0), -3.8, 7.8);
      return { id: `b${i}`, value: v, label: `Bet #${1000 + i}`, group: books[i % books.length] };
    }
    const v = Math.exp(Math.log(18000) + gaussian(rnd) * 0.9);
    return { id: `d${i}`, value: clamp(v, 1200, 480000), label: `Deal #${400 + i}`, group: ["SMB", "Mid-market", "Enterprise"][v > 60000 ? 2 : v > 12000 ? 1 : 0] };
  });
}
