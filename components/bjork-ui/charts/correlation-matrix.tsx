"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
import { mulberry32 } from "@/components/bjork-ui/_core/random";
import { useChartCanvas, easeOut, hatchPattern, roundRectPath } from "@/components/bjork-ui/charts/_kit/canvas";
import {
  useChartTheme,
  chartFocusRing,
  ChartTable,
  placeTooltip,
  HoverTooltip,
  ChartAnnouncer,
  type ChartPalette,
  type TooltipHandle,
  type AnnouncerHandle,
  type TooltipContent,
} from "@/components/bjork-ui/charts/_kit/chrome";
import { clamp, damp, mixColor, parseColor, gaussian } from "@/components/bjork-ui/charts/_kit/scale";
import { seriesColor } from "@/components/bjork-ui/charts/_kit/series";

export interface CorrelationMatrixProps {
  labels: string[];
  /** Symmetric matrix of coefficients in [-1, 1]. */
  matrix: number[][];
  order?: "input" | "cluster";
  defaultOrder?: "input" | "cluster";
  onOrderChange?: (order: "input" | "cluster") => void;
  triangle?: "lower" | "full";
  formatValue?: (r: number) => string;
  /** Posed hover cell, by label index. */
  activeCell?: [number, number] | null;
  ariaLabel?: string;
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

const LABEL_W = 84;
const BOTTOM_LABELS = 64;
const TOP = 26;
const GAP = 2;
const VALUE_MIN_CELL = 30; // cells narrower than this hide their numbers
const MOVE_TAU = 0.15;
const ENTER_MS = 900;
const CELL_MS = 360;
const ATTRACT_STEP_MS = 3400;
const ATTRACT_IDLE_MS = 4000;

const clock = () => performance.now();
const defaultFormatValue = (r: number) => `${r < 0 ? "−" : ""}${Math.abs(r).toFixed(2).replace(/^0/, "")}`;

// Average-linkage agglomerative clustering on 1 - r, returning the leaf order.
export function clusterOrder(matrix: number[][]): number[] {
  const n = matrix.length;
  let clusters: { items: number[] }[] = Array.from({ length: n }, (_, i) => ({ items: [i] }));
  const dist = (a: number[], b: number[]) => {
    let s = 0;
    for (const i of a) for (const j of b) s += 1 - (matrix[i]?.[j] ?? 0);
    return s / (a.length * b.length);
  };
  while (clusters.length > 1) {
    let best = [0, 1];
    let bd = Infinity;
    for (let i = 0; i < clusters.length; i++)
      for (let j = i + 1; j < clusters.length; j++) {
        const d = dist(clusters[i].items, clusters[j].items);
        if (d < bd) {
          bd = d;
          best = [i, j];
        }
      }
    const [a, b] = best;
    // Orient the merge so the closest ends meet.
    const A = clusters[a].items;
    const B = clusters[b].items;
    const opts = [
      [...A, ...B],
      [...A, ...[...B].reverse()],
      [...[...A].reverse(), ...B],
      [...B, ...A],
    ];
    const joinCost = (seq: number[]) => 1 - (matrix[seq[A.length - 1]]?.[seq[A.length]] ?? 0);
    const merged = opts.reduce((m, o) => (joinCost(o) < joinCost(m) ? o : m), opts[0]);
    clusters = clusters.filter((_, k) => k !== a && k !== b);
    clusters.push({ items: merged });
  }
  return clusters[0]?.items ?? [];
}

// Diverging scale: two poles (accent for positive, the series blue for negative, a CVD-safe pair)
// meeting at the stage colour at zero.
function poles(pal: ChartPalette, tone: BjorkTone) {
  return { pos: pal.accent, neg: seriesColor(tone, 1), mid: pal.stage };
}

function cellFill(pal: ChartPalette, tone: BjorkTone, r: number): { fill: string; ink: string } {
  // Power-curve intensity, capped below full so the grid never turns into solid blocks.
  const a = 0.05 + 0.7 * Math.pow(clamp(Math.abs(r), 0, 1), 0.8);
  const { pos, neg, mid } = poles(pal, tone);
  const fill = mixColor(mid, r >= 0 ? pos : neg, a);
  return { fill, ink: inkOn(fill) };
}

// Dark or light text for a cell, from the fill's relative luminance.
const INK_DARK = "rgba(23,23,23,0.86)";
const INK_LIGHT = "rgba(237,237,237,0.9)";
function inkOn(fill: string): string {
  const [r, g, b] = parseColor(fill);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  // The crossover where both inks give the same contrast ratio.
  return L > 0.18 ? INK_DARK : INK_LIGHT;
}

function describeR(r: number): string {
  const a = Math.abs(r);
  const s = a >= 0.7 ? "strong" : a >= 0.4 ? "moderate" : a >= 0.2 ? "weak" : "negligible";
  return a < 0.2 ? s : `${s} ${r > 0 ? "positive" : "negative"}`;
}

interface Run {
  pos: number[]; // displayed slot per label
  ready: boolean;
  enter: number;
  hover: [number, number] | null;
  source: "pointer" | "keyboard" | "prop" | "attract" | null;
  cell: number;
  ox: number;
  oy: number;
  lastInput: number;
  attractAt: number;
}

// Style writes from the draw loop only when the value changes: a hover frame touches ~90 spans,
// and rewriting identical styles still costs a recalc on each of them.
const written = new WeakMap<HTMLElement, { opacity?: string; transform?: string; color?: string }>();
function put(el: HTMLElement, prop: "opacity" | "transform" | "color", value: string) {
  let w = written.get(el);
  if (!w) written.set(el, (w = {}));
  if (w[prop] === value) return;
  w[prop] = value;
  el.style[prop] = value;
}

export function CorrelationMatrix({
  labels,
  matrix,
  order: orderProp,
  defaultOrder = "input",
  onOrderChange,
  triangle = "lower",
  formatValue = defaultFormatValue,
  activeCell,
  ariaLabel = "Correlation matrix",
  tone: toneProp,
  attract = false,
  className,
}: CorrelationMatrixProps) {
  const { tone, pal, reduce, vars } = useChartTheme(toneProp);
  const announcer = useRef<AnnouncerHandle>(null);
  const tipRef = useRef<TooltipHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const colRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const valueRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rectRef = useRef<DOMRect | null>(null);
  const [orderState, setOrderState] = useState<"input" | "cluster">(defaultOrder);
  const [attractOrder, setAttractOrder] = useState<"input" | "cluster" | null>(null);
  const orderMode = attract && attractOrder ? attractOrder : (orderProp ?? orderState);
  const n = labels.length;

  const clustered = useMemo(() => clusterOrder(matrix), [matrix]);
  const order = useMemo(() => (orderMode === "cluster" ? clustered : labels.map((_, i) => i)), [orderMode, clustered, labels]);
  const slot = useMemo(() => {
    const s = new Array<number>(n);
    order.forEach((li, k) => (s[li] = k));
    return s;
  }, [order, n]);

  const cfg = useRef({ matrix, slot, triangle, reduce, pal, tone, formatValue, attract, n });
  useEffect(() => {
    cfg.current = { matrix, slot, triangle, reduce, pal, tone, formatValue, attract, n };
  });

  const st = useRef<Run>({ pos: [], ready: false, enter: 0, hover: null, source: null, cell: 20, ox: LABEL_W, oy: TOP, lastInput: 0, attractAt: 0 });
  const orderSetter = useRef<(o: "input" | "cluster") => void>(() => {});

  const { rootRef, hostRef, canvasRef, size, wake } = useChartCanvas(({ ctx, w, h, dt }) => {
    const s = st.current;
    const c = cfg.current;
    const p = c.pal;
    const N = c.n;
    const cell = Math.max(10, Math.floor((w - LABEL_W - 4) / Math.max(1, N)));
    s.cell = cell;
    const ox = LABEL_W;
    const oy = TOP;
    s.ox = ox;
    s.oy = oy;

    let moving = false;
    for (let i = 0; i < N; i++) {
      if (!s.ready || c.reduce || s.pos[i] === undefined) s.pos[i] = c.slot[i];
      else {
        s.pos[i] = damp(s.pos[i], c.slot[i], MOVE_TAU, dt);
        if (Math.abs(s.pos[i] - c.slot[i]) > 0.002) moving = true;
        else s.pos[i] = c.slot[i];
      }
    }
    s.pos.length = N;
    s.ready = true;
    s.enter = c.reduce ? 1 : Math.min(1, s.enter + (dt * 1000) / ENTER_MS);
    const ms = s.enter * ENTER_MS;
    const growOf = (a: number, b: number) => (s.enter >= 1 ? 1 : easeOut(clamp((ms - ((a + b) / Math.max(1, 2 * N - 2)) * (ENTER_MS - CELL_MS)) / CELL_MS, 0, 1)));

    const hov = s.hover;
    const hatch = hatchPattern(ctx, mixColor(p.stage, p.text, 0.16), 4, 1);
    let vi = 0;
    // Row and column bands behind the hovered cell.
    if (hov) {
      const [hr, hc] = hov;
      ctx.fillStyle = mixColor(p.stage, p.text, 0.035);
      // In the lower triangle the bands stop at the diagonal.
      const lower = c.triangle === "lower";
      ctx.fillRect(ox, oy + s.pos[hr] * cell, cell * (lower ? s.pos[hr] + 1 : N), cell);
      ctx.fillRect(ox + s.pos[hc] * cell, oy + (lower ? s.pos[hc] * cell : 0), cell, cell * (lower ? N - s.pos[hc] : N));
    }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        // Lower triangle uses displayed slots, so a cell moves across the diagonal smoothly.
        if (c.triangle === "lower" && c.slot[j] > c.slot[i]) continue;
        const r = c.matrix[i]?.[j] ?? 0;
        const x = ox + s.pos[j] * cell;
        const y = oy + s.pos[i] * cell;
        const g = growOf(c.slot[i], c.slot[j]);
        if (g <= 0) continue;
        const inset = GAP / 2 + (1 - g) * (cell / 2 - 1);
        const isHov = !!hov && hov[0] === i && hov[1] === j;
        const dim = hov && !isHov && hov[0] !== i && hov[1] !== j ? 0.55 : 1;
        ctx.globalAlpha = dim;
        ctx.beginPath();
        roundRectPath(ctx, x + inset, y + inset, cell - inset * 2, cell - inset * 2, Math.min(3, cell / 6), Math.min(3, cell / 6));
        if (i === j) {
          ctx.fillStyle = mixColor(p.stage, p.text, 0.05);
          ctx.fill();
          if (hatch) {
            ctx.fillStyle = hatch;
            ctx.fill();
          }
        } else {
          const { fill, ink } = cellFill(p, c.tone, r);
          ctx.fillStyle = fill;
          ctx.fill();
          // Without numbers, sign must not rest on hue alone: negative cells carry a minus bar.
          if (cell < VALUE_MIN_CELL && r < 0 && g > 0.6) {
            const bw = Math.max(4, Math.round(cell * 0.34));
            ctx.fillStyle = ink;
            ctx.fillRect(Math.round(x + cell / 2 - bw / 2), Math.round(y + cell / 2) - 0.75, bw, 1.5);
          }
        }
        if (isHov) {
          ctx.globalAlpha = 1;
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = p.text;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // Values inside cells big enough to hold them.
        if (i !== j && cell >= VALUE_MIN_CELL) {
          const el = valueRefs.current[vi++];
          if (el) {
            const text = c.formatValue(r);
            if (el.textContent !== text) el.textContent = text;
            put(el, "color", cellFill(p, c.tone, r).ink);
            put(el, "opacity", String(clamp((g - 0.6) / 0.4, 0, 1) * dim));
            put(el, "transform", `translate3d(${(x + cell / 2).toFixed(1)}px, ${(y + cell / 2).toFixed(1)}px, 0) translate(-50%, -50%)`);
          }
        }
      }
    }
    for (let k = vi; k < valueRefs.current.length; k++) {
      const el = valueRefs.current[k];
      if (el) put(el, "opacity", "0");
    }

    // Labels ride their slots.
    for (let i = 0; i < N; i++) {
      const on = !hov || hov[0] === i || hov[1] === i;
      const R = rowRefs.current[i];
      if (R) {
        put(R, "transform", `translate3d(${(ox - 8).toFixed(1)}px, ${(oy + s.pos[i] * cell + cell / 2).toFixed(1)}px, 0) translate(-100%, -50%)`);
        if (R.dataset.on !== (on ? "1" : "0")) R.dataset.on = on ? "1" : "0";
        put(R, "opacity", String(Math.min(1, s.enter * 2)));
      }
      const C = colRefs.current[i];
      if (C) {
        put(C, "transform", `translate3d(${(ox + s.pos[i] * cell + cell / 2).toFixed(1)}px, ${(oy + N * cell + 8).toFixed(1)}px, 0) translateX(-100%) rotate(-40deg)`);
        if (C.dataset.on !== (on ? "1" : "0")) C.dataset.on = on ? "1" : "0";
        put(C, "opacity", String(Math.min(1, s.enter * 2)));
      }
    }

    const tip = tipRef.current;
    if (tip?.el && hov) {
      const pos = placeTooltip(ox + s.pos[hov[1]] * cell + cell, oy + s.pos[hov[0]] * cell, tip.size.w, tip.size.h, w, h, 8);
      tip.el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
    }

    if (c.attract && !c.reduce && (!s.lastInput || clock() - s.lastInput > ATTRACT_IDLE_MS)) {
      if (clock() - s.attractAt > ATTRACT_STEP_MS) {
        s.attractAt = clock();
        orderSetter.current(c.slot.every((v, i) => v === i) ? "cluster" : "input");
      }
      return true;
    }
    return moving || s.enter < 1;
  });

  useEffect(() => {
    orderSetter.current = (o) => setAttractOrder(o);
  });

  const cell = Math.max(10, Math.floor(((size.width || 600) - LABEL_W - 4) / Math.max(1, n)));
  const height = TOP + n * cell + BOTTOM_LABELS;

  useEffect(() => {
    wake();
  }, [matrix, slot, triangle, pal, reduce, attract, wake]);

  const tooltipFor = (i: number, j: number): TooltipContent => {
    const r = matrix[i]?.[j] ?? 0;
    return {
      key: `${i}|${j}|${pal.text}`,
      title: `${labels[i]} × ${labels[j]}`,
      rows: [{ key: "r", label: i === j ? "self" : describeR(r), value: `r ${formatValue(r)}`, color: i === j ? undefined : cellFill(pal, tone, r).fill }],
    };
  };

  const setHover = (cellIdx: [number, number] | null, source: Run["source"]) => {
    const s = st.current;
    const same = (!cellIdx && !s.hover) || (cellIdx && s.hover && cellIdx[0] === s.hover[0] && cellIdx[1] === s.hover[1]);
    s.hover = cellIdx;
    s.source = cellIdx ? source : null;
    if (!same) {
      tipRef.current?.set(cellIdx ? tooltipFor(cellIdx[0], cellIdx[1]) : null);
      if (cellIdx && source === "keyboard") {
        const r = matrix[cellIdx[0]]?.[cellIdx[1]] ?? 0;
        announcer.current?.say(`${labels[cellIdx[0]]} and ${labels[cellIdx[1]]}: r ${formatValue(r)}, ${describeR(r)}`);
      }
    }
    wake();
  };

  useEffect(() => {
    if (activeCell === undefined) return;
    setHover(activeCell, activeCell ? "prop" : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCell?.[0], activeCell?.[1], pal]);

  const setOrder = (o: "input" | "cluster") => {
    setAttractOrder(null);
    if (orderProp === undefined) setOrderState(o);
    onOrderChange?.(o);
    announcer.current?.say(o === "cluster" ? "Ordered by cluster" : "Original order");
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    st.current.lastInput = clock();
    const rect = rectRef.current ?? wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const s = st.current;
    const sx = Math.floor((e.clientX - rect.left - s.ox) / s.cell);
    const sy = Math.floor((e.clientY - rect.top - s.oy) / s.cell);
    if (sx < 0 || sy < 0 || sx >= n || sy >= n || (triangle === "lower" && sx > sy)) {
      setHover(null, null);
      return;
    }
    setHover([order[sy], order[sx]], "pointer");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = st.current;
    s.lastInput = clock();
    if (e.key === "o" || e.key === "O") {
      e.preventDefault();
      setOrder(orderMode === "cluster" ? "input" : "cluster");
      return;
    }
    if (e.key === "Escape") {
      setHover(null, null);
      return;
    }
    if (!e.key.startsWith("Arrow") && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    // Navigate in displayed slots. Home and End jump to the ends of the current row.
    let ry = s.hover ? slot[s.hover[0]] : n - 1;
    let cx = s.hover ? slot[s.hover[1]] : 0;
    if (e.key === "Home") cx = 0;
    else if (e.key === "End") cx = triangle === "lower" ? ry : n - 1;
    else if (s.hover && s.source !== "attract") {
      if (e.key === "ArrowUp") ry--;
      if (e.key === "ArrowDown") ry++;
      if (e.key === "ArrowLeft") cx--;
      if (e.key === "ArrowRight") cx++;
    }
    ry = clamp(ry, 0, n - 1);
    cx = clamp(cx, 0, n - 1);
    if (triangle === "lower" && cx > ry) {
      if (e.key === "ArrowRight") cx = ry;
      else ry = cx;
    }
    setHover([order[ry], order[cx]], "keyboard");
  };

  const tableRows = useMemo(() => labels.map((l, i) => [l, ...labels.map((_, j) => formatValue(matrix[i]?.[j] ?? 0))]), [labels, matrix, formatValue]);
  const tableCols = useMemo(() => ["", ...labels], [labels]);
  const valueSlots = triangle === "lower" ? (n * (n - 1)) / 2 : n * (n - 1);
  const legendRamp = useMemo(() => {
    const stops = [-1, -0.5, -0.15, 0, 0.15, 0.5, 1].map((r) => `${cellFill(pal, tone, r).fill} ${((r + 1) / 2) * 100}%`);
    return `linear-gradient(90deg, ${stops.join(", ")})`;
  }, [pal, tone]);
  const summary = useMemo(() => {
    let best: [number, number, number] | null = null;
    let worst: [number, number, number] | null = null;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < i; j++) {
        const r = matrix[i]?.[j] ?? 0;
        if (!best || r > best[2]) best = [i, j, r];
        if (!worst || r < worst[2]) worst = [i, j, r];
      }
    const say = (t: [number, number, number] | null) => (t ? `${labels[t[0]]} and ${labels[t[1]]} at ${formatValue(t[2])}` : "none");
    return `${ariaLabel}: ${n} variables, ${orderMode === "cluster" ? "clustered" : "original"} order. Strongest positive ${say(best)}; most negative ${say(worst)}.`;
  }, [matrix, n, labels, formatValue, ariaLabel, orderMode]);

  return (
    <div ref={rootRef} data-loop="idle" className={cn("relative w-full select-none text-[color:var(--bjork-text)]", className)} style={{ ...vars, height }}>
      <div aria-hidden="true" className="pointer-events-none absolute right-0 top-[3px] flex items-center gap-1.5 font-mono text-[10px] leading-none tabular-nums text-[color:var(--bjork-text-soft)]">
        <span className="[text-box:trim-both_cap_alphabetic]">{"−"}1 negative</span>
        <span className="relative inline-block h-[6px] w-24 rounded-full shadow-[inset_0_0_0_1px_var(--bjork-hair)]" style={{ background: legendRamp }}>
          <span className="absolute -bottom-[3px] -top-[3px] left-1/2 w-px -translate-x-1/2 bg-[color:var(--bjork-text-faint)]" />
        </span>
        <span className="[text-box:trim-both_cap_alphabetic]">positive +1</span>
      </div>
      <div
        ref={wrapperRef}
        role="group"
        aria-roledescription="chart"
        aria-label={`${ariaLabel}. Arrow keys move between cells, Home and End jump along the row, O switches between the original and clustered order, Escape clears.`}
        tabIndex={0}
        onPointerEnter={() => {
          if (wrapperRef.current) rectRef.current = wrapperRef.current.getBoundingClientRect();
        }}
        onPointerMove={onPointerMove}
        onPointerDown={(e) => {
          if (wrapperRef.current) rectRef.current = wrapperRef.current.getBoundingClientRect();
          if (e.pointerType === "touch") onPointerMove(e);
        }}
        onPointerLeave={() => setHover(null, null)}
        onKeyDown={onKeyDown}
        className={cn("absolute inset-0 cursor-crosshair touch-pan-y rounded-[10px]", chartFocusRing)}
      >
        <div ref={hostRef} className="absolute inset-0">
          <canvas ref={canvasRef} role="img" aria-label={summary} className="pointer-events-none absolute left-0 top-0" />
        </div>
        {labels.map((l, i) => (
          <span
            key={`r-${i}`}
            ref={(el) => {
              rowRefs.current[i] = el;
            }}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 max-w-[80px] truncate font-bjork-alpha text-[11px] font-medium leading-[13px] text-[color:var(--bjork-text-muted)] opacity-0 transition-colors duration-100 data-[on=1]:text-[color:var(--bjork-text)]"
          >
            {l}
          </span>
        ))}
        {labels.map((l, i) => (
          <span
            key={`c-${i}`}
            ref={(el) => {
              colRefs.current[i] = el;
            }}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 origin-top-right whitespace-nowrap font-bjork-alpha text-[11px] font-medium leading-[13px] text-[color:var(--bjork-text-muted)] opacity-0 transition-colors duration-100 data-[on=1]:text-[color:var(--bjork-text)]"
          >
            {l}
          </span>
        ))}
        {Array.from({ length: valueSlots }).map((_, k) => (
          <span
            key={k}
            ref={(el) => {
              valueRefs.current[k] = el;
            }}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 font-mono text-[10px] leading-none tabular-nums opacity-0 [text-box:trim-both_cap_alphabetic]"
          />
        ))}
        <HoverTooltip ref={tipRef} onMeasure={wake} />
      </div>
      <ChartTable caption={ariaLabel} columns={tableCols} rows={tableRows} />
      <ChartAnnouncer ref={announcer} />
    </div>
  );
}

// Seeded demo matrix: assets driven by a few shared factors, so clusters exist.
export function createCorrelationDemo(seed: number): { labels: string[]; matrix: number[][] } {
  const rnd = mulberry32(seed);
  const labels = ["US equities", "Gold", "EU equities", "Treasuries", "Oil", "Bitcoin", "Bunds", "Tech", "Copper", "Dollar", "Ether", "EM equities"];
  // Factor loadings: growth, rates, crypto, commodities.
  const loads: Record<string, number[]> = {
    "US equities": [0.9, -0.2, 0.2, 0.1],
    "EU equities": [0.85, -0.15, 0.1, 0.2],
    "EM equities": [0.75, -0.25, 0.15, 0.35],
    Tech: [0.88, -0.35, 0.35, 0],
    Treasuries: [-0.3, 0.9, 0, -0.1],
    Bunds: [-0.25, 0.85, 0, -0.05],
    Gold: [0, 0.35, 0.1, 0.55],
    Oil: [0.3, -0.2, 0, 0.8],
    Copper: [0.45, -0.1, 0, 0.75],
    Dollar: [-0.4, 0.2, -0.2, -0.5],
    Bitcoin: [0.35, -0.1, 0.9, 0],
    Ether: [0.38, -0.1, 0.88, 0],
  };
  const vecs = labels.map((l) => loads[l].map((v) => v + gaussian(rnd) * 0.06));
  const matrix = vecs.map((a) =>
    vecs.map((b) => {
      const dot = a.reduce((s, v, k) => s + v * b[k], 0);
      const na = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
      const nb = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
      return clamp(dot / (na * nb), -1, 1);
    }),
  );
  return { labels, matrix };
}
