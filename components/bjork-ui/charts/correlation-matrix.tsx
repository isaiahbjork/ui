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
import { clamp, damp, mixColor, gaussian } from "@/components/bjork-ui/charts/_kit/scale";

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

function cellFill(pal: ChartPalette, r: number): { fill: string; strong: boolean } {
  // Power-curve intensity, capped below full so the grid never turns into solid blocks.
  const a = 0.05 + 0.7 * Math.pow(clamp(Math.abs(r), 0, 1), 0.8);
  if (r >= 0) return { fill: mixColor(pal.stage, pal.accent, a), strong: a > 0.5 };
  return { fill: mixColor(pal.stage, pal.text, a * 0.62), strong: false };
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
  const { pal, reduce, vars } = useChartTheme(toneProp);
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

  const cfg = useRef({ matrix, slot, triangle, reduce, pal, formatValue, attract, n });
  useEffect(() => {
    cfg.current = { matrix, slot, triangle, reduce, pal, formatValue, attract, n };
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
          const { fill } = cellFill(p, r);
          ctx.fillStyle = fill;
          ctx.fill();
        }
        if (isHov) {
          ctx.globalAlpha = 1;
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = p.text;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // Values inside cells big enough to hold them.
        if (i !== j && cell >= 30) {
          const el = valueRefs.current[vi++];
          if (el) {
            const text = c.formatValue(r);
            if (el.textContent !== text) el.textContent = text;
            el.dataset.strong = cellFill(p, r).strong ? "1" : "0";
            el.style.opacity = String(clamp((g - 0.6) / 0.4, 0, 1) * dim);
            el.style.transform = `translate3d(${(x + cell / 2).toFixed(1)}px, ${(y + cell / 2).toFixed(1)}px, 0) translate(-50%, -50%)`;
          }
        }
      }
    }
    for (let k = vi; k < valueRefs.current.length; k++) {
      const el = valueRefs.current[k];
      if (el && el.style.opacity !== "0") el.style.opacity = "0";
    }

    // Labels ride their slots.
    for (let i = 0; i < N; i++) {
      const on = !hov || hov[0] === i || hov[1] === i;
      const R = rowRefs.current[i];
      if (R) {
        R.style.transform = `translate3d(${(ox - 8).toFixed(1)}px, ${(oy + s.pos[i] * cell + cell / 2).toFixed(1)}px, 0) translate(-100%, -50%)`;
        R.dataset.on = on ? "1" : "0";
        R.style.opacity = String(Math.min(1, s.enter * 2));
      }
      const C = colRefs.current[i];
      if (C) {
        C.style.transform = `translate3d(${(ox + s.pos[i] * cell + cell / 2).toFixed(1)}px, ${(oy + N * cell + 8).toFixed(1)}px, 0) translateX(-100%) rotate(-40deg)`;
        C.dataset.on = on ? "1" : "0";
        C.style.opacity = String(Math.min(1, s.enter * 2));
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
      rows: [{ key: "r", label: i === j ? "self" : describeR(r), value: `r ${formatValue(r)}`, color: i === j ? undefined : cellFill(pal, r).fill }],
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
    if (!e.key.startsWith("Arrow")) return;
    e.preventDefault();
    // Navigate in displayed slots.
    let ry = s.hover ? slot[s.hover[0]] : n - 1;
    let cx = s.hover ? slot[s.hover[1]] : 0;
    if (s.hover && s.source !== "attract") {
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

  return (
    <div ref={rootRef} data-loop="idle" className={cn("relative w-full select-none text-[color:var(--bjork-text)]", className)} style={{ ...vars, height }}>
      <div aria-hidden="true" className="pointer-events-none absolute right-0 top-[3px] flex items-center gap-1.5 font-mono text-[10px] leading-none tabular-nums text-[color:var(--bjork-text-soft)]">
        <span className="[text-box:trim-both_cap_alphabetic]">{"−"}1</span>
        <span
          className="inline-block h-[6px] w-24 rounded-full"
          style={{ background: `linear-gradient(90deg, ${mixColor(pal.stage, pal.text, 0.48)}, ${mixColor(pal.stage, pal.text, 0.03)} 50%, ${mixColor(pal.stage, pal.accent, 0.05)} 50%, ${mixColor(pal.stage, pal.accent, 0.75)})` }}
        />
        <span className="[text-box:trim-both_cap_alphabetic]">+1</span>
      </div>
      <div
        ref={wrapperRef}
        role="group"
        aria-roledescription="chart"
        aria-label={`${ariaLabel}. Arrow keys move between cells, O switches between the original and clustered order.`}
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
          <canvas ref={canvasRef} role="img" aria-label={`${ariaLabel}: ${n} variables, ${orderMode === "cluster" ? "clustered" : "original"} order`} className="pointer-events-none absolute left-0 top-0" />
        </div>
        {labels.map((l, i) => (
          <span
            key={`r-${l}`}
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
            key={`c-${l}`}
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
            className="pointer-events-none absolute left-0 top-0 font-mono text-[10px] leading-none tabular-nums text-[color:var(--bjork-text-medium)] opacity-0 [text-box:trim-both_cap_alphabetic] data-[strong=1]:text-[color:var(--bjork-accent-foreground)]"
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
