"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
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
import { clamp, crisp, damp, niceDomain, niceTicks, withAlpha, formatCompact, formatSigned } from "@/components/bjork-ui/charts/_kit/scale";

export interface DumbbellRow {
  id: string;
  label: string;
  a: number;
  b: number;
}

export type DumbbellSort = "a" | "b" | "gap" | "label";

export interface DumbbellChartProps {
  rows: DumbbellRow[];
  /** Names of the two ends, e.g. ["2020", "2025"]. */
  labels?: [string, string];
  sort?: DumbbellSort;
  defaultSort?: DumbbellSort;
  onSortChange?: (sort: DumbbellSort) => void;
  domain?: [number, number];
  formatValue?: (v: number) => string;
  formatGap?: (gap: number, a: number, b: number) => string;
  rowHeight?: number;
  /** Posed hover row id. */
  activeId?: string | null;
  ariaLabel?: string;
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

const HEADER_H = 44;
const GAP_W = 64;
const ROW_TAU = 0.13;
const VAL_TAU = 0.12;
const ENTER_MS = 880;
const ROW_ENTER_MS = 520;
const X_LABELS = 10;
const SORTS: DumbbellSort[] = ["gap", "b", "a", "label"];
const SORT_NAMES: Record<DumbbellSort, string> = { a: "start", b: "end", gap: "gap", label: "name" };
const ATTRACT_STEP_MS = 3000;
const ATTRACT_IDLE_MS = 4000;

const DEFAULT_LABELS: [string, string] = ["Before", "After"];
const clock = () => performance.now();
const defaultFormatValue = (v: number) => formatCompact(v, 0);
const defaultFormatGap = (g: number) => formatSigned(g, (n) => formatCompact(n, 0));

function sortRows(rows: DumbbellRow[], sort: DumbbellSort): number[] {
  const idx = rows.map((_, i) => i);
  if (sort === "label") return idx.sort((x, y) => rows[x].label.localeCompare(rows[y].label));
  const key = (r: DumbbellRow) => (sort === "a" ? r.a : sort === "b" ? r.b : r.b - r.a);
  return idx.sort((x, y) => key(rows[y]) - key(rows[x]));
}

interface Run {
  enter: number;
  ys: number[]; // displayed row index (fractional while moving)
  da: number[];
  db: number[];
  ready: boolean;
  hover: number | null;
  source: "pointer" | "keyboard" | "prop" | "attract" | null;
  plot: { l: number; r: number };
  xCache: string[];
  lastInput: number;
  attractAt: number;
  attractSort: number;
}

export function DumbbellChart({
  rows,
  labels = DEFAULT_LABELS,
  sort: sortProp,
  defaultSort = "gap",
  onSortChange,
  domain,
  formatValue = defaultFormatValue,
  formatGap = defaultFormatGap,
  rowHeight = 30,
  activeId,
  ariaLabel = "Dumbbell chart",
  tone: toneProp,
  attract = false,
  className,
}: DumbbellChartProps) {
  const { pal, reduce, vars } = useChartTheme(toneProp);
  const announcer = useRef<AnnouncerHandle>(null);
  const tipRef = useRef<TooltipHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const gapRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const xPool = useRef<(HTMLSpanElement | null)[]>([]);
  const rectRef = useRef<DOMRect | null>(null);
  const [sortState, setSortState] = useState<DumbbellSort>(defaultSort);
  const sort = sortProp ?? sortState;

  const order = useMemo(() => sortRows(rows, sort), [rows, sort]);
  const dom = useMemo<[number, number]>(() => {
    if (domain) return domain;
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of rows) {
      lo = Math.min(lo, r.a, r.b);
      hi = Math.max(hi, r.a, r.b);
    }
    return Number.isFinite(lo) ? niceDomain(lo - (hi - lo) * 0.04, hi + (hi - lo) * 0.04, 5) : [0, 1];
  }, [rows, domain]);

  const cfg = useRef({ rows, order, dom, reduce, pal, attract, formatValue });
  useEffect(() => {
    cfg.current = { rows, order, dom, reduce, pal, attract, formatValue };
  });

  const st = useRef<Run>({
    enter: 0,
    ys: [],
    da: [],
    db: [],
    ready: false,
    hover: null,
    source: null,
    plot: { l: 0, r: 0 },
    xCache: [],
    lastInput: 0,
    attractAt: 0,
    attractSort: 0,
  });
  const sortRef = useRef<(s: DumbbellSort, announce: boolean) => void>(() => {});

  const { rootRef, hostRef, canvasRef, wake } = useChartCanvas(({ ctx, w, h, dt }) => {
    const s = st.current;
    const c = cfg.current;
    const p = c.pal;
    const R = c.rows;
    const n = R.length;
    const narrow = w < 480;
    const labelW = narrow ? 92 : clamp(w * 0.2, 110, 170);
    const plot = { l: labelW + 14, r: w - GAP_W - 10 };
    s.plot = plot;
    const xOf = (v: number) => plot.l + ((v - c.dom[0]) / Math.max(1e-12, c.dom[1] - c.dom[0])) * (plot.r - plot.l);

    // Row positions follow the sort with a damped glide; values glide too.
    const rank = new Array<number>(n);
    c.order.forEach((ri, k) => (rank[ri] = k));
    let moving = false;
    for (let i = 0; i < n; i++) {
      if (!s.ready || c.reduce || s.ys[i] === undefined) {
        s.ys[i] = rank[i];
        s.da[i] = R[i].a;
        s.db[i] = R[i].b;
        continue;
      }
      s.ys[i] = damp(s.ys[i], rank[i], ROW_TAU, dt);
      s.da[i] = damp(s.da[i], R[i].a, VAL_TAU, dt);
      s.db[i] = damp(s.db[i], R[i].b, VAL_TAU, dt);
      if (Math.abs(s.ys[i] - rank[i]) > 0.002 || Math.abs(s.da[i] - R[i].a) + Math.abs(s.db[i] - R[i].b) > 1e-4 * (c.dom[1] - c.dom[0])) moving = true;
      else s.ys[i] = rank[i];
    }
    s.ys.length = n;
    s.ready = true;

    s.enter = c.reduce ? 1 : Math.min(1, s.enter + (dt * 1000) / ENTER_MS);
    const growOf = (k: number) => (s.enter >= 1 ? 1 : easeOut(clamp((s.enter * ENTER_MS - (k / Math.max(1, n)) * (ENTER_MS - ROW_ENTER_MS)) / ROW_ENTER_MS, 0, 1)));
    const rowY = (f: number) => HEADER_H + f * rowHeight + rowHeight / 2;

    // Vertical grid and the value axis on top.
    const ticks = niceTicks(c.dom[0], c.dom[1], Math.max(3, Math.floor((plot.r - plot.l) / 90)));
    ctx.strokeStyle = p.hair;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const v of ticks) {
      const x = crisp(xOf(v));
      ctx.moveTo(x, HEADER_H - 6);
      ctx.lineTo(x, h - 2);
    }
    ctx.stroke();
    writeLabels(xPool.current, s.xCache, ticks.map((v) => ({ text: c.formatValue(v), x: xOf(v), y: HEADER_H - 14, ax: -50 })));

    // Hovered row band.
    if (s.hover !== null) {
      const y = rowY(s.ys[s.hover]);
      ctx.fillStyle = withAlpha(p.text, 0.045);
      ctx.beginPath();
      ctx.roundRect(0, y - rowHeight / 2 + 1, w, rowHeight - 2, 6);
      ctx.fill();
    }

    for (let i = 0; i < n; i++) {
      const y = rowY(s.ys[i]);
      const g = growOf(rank[i]);
      const xa = xOf(s.da[i]);
      const xbFull = xOf(s.db[i]);
      const xb = xa + (xbFull - xa) * g;
      const hov = s.hover === i;
      const dim = s.hover !== null && !hov ? 0.6 : 1;
      ctx.globalAlpha = dim * Math.min(1, g * 3);
      // Connector.
      ctx.strokeStyle = withAlpha(p.text, hov ? 0.55 : 0.28);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(xa, y);
      ctx.lineTo(xb, y);
      ctx.stroke();
      // Start: hollow ink ring. End: solid accent dot with a surface ring.
      ctx.beginPath();
      ctx.arc(xa, y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = p.stage;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = withAlpha(p.text, 0.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(xb, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = p.accent;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = p.stage;
      ctx.stroke();
      ctx.globalAlpha = 1;

      const L = labelRefs.current[i];
      if (L) {
        L.style.transform = `translate3d(${labelW.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-100%, -50%)`;
        L.style.opacity = String(Math.min(1, g * 2) * dim);
        L.style.maxWidth = `${labelW}px`;
      }
      const G = gapRefs.current[i];
      if (G) {
        G.style.transform = `translate3d(${w.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-100%, -50%)`;
        G.style.opacity = String(clamp((g - 0.6) / 0.4, 0, 1) * dim);
      }
    }

    const tip = tipRef.current;
    if (tip?.el && s.hover !== null) {
      const i = s.hover;
      const pos = placeTooltip(Math.max(xOf(s.da[i]), xOf(s.db[i])) + 8, rowY(s.ys[i]), tip.size.w, tip.size.h, w, h, 10);
      tip.el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
    }

    if (c.attract && !c.reduce && (!s.lastInput || clock() - s.lastInput > ATTRACT_IDLE_MS)) {
      if (clock() - s.attractAt > ATTRACT_STEP_MS) {
        s.attractAt = clock();
        s.attractSort = (s.attractSort + 1) % SORTS.length;
        sortRef.current(SORTS[s.attractSort], false);
      }
      return true;
    }
    return moving || s.enter < 1;
  });

  const tooltipFor = (i: number): TooltipContent | null => {
    const r = rows[i];
    if (!r) return null;
    return {
      key: `${r.id}|${pal.text}`,
      title: r.label,
      rows: [
        { key: "b", label: labels[1], value: formatValue(r.b), color: pal.accent },
        { key: "a", label: labels[0], value: formatValue(r.a), color: withAlpha(pal.text, 0.7), strong: false },
        { key: "g", label: "Gap", value: formatGap(r.b - r.a, r.a, r.b) },
      ],
    };
  };

  const setHover = (i: number | null, source: Run["source"]) => {
    const s = st.current;
    if (s.hover === i && s.source === source) return;
    s.hover = i;
    s.source = i === null ? null : source;
    tipRef.current?.set(i === null ? null : tooltipFor(i));
    if (i !== null && source === "keyboard") {
      const r = rows[i];
      announcer.current?.say(`${r.label}: ${labels[0]} ${formatValue(r.a)}, ${labels[1]} ${formatValue(r.b)}, gap ${formatGap(r.b - r.a, r.a, r.b)}`);
    }
    wake();
  };

  const setSort = (next: DumbbellSort, announce = true) => {
    if (sortProp === undefined) setSortState(next);
    onSortChange?.(next);
    if (announce) announcer.current?.say(`Sorted by ${SORT_NAMES[next]}`);
  };
  useEffect(() => {
    sortRef.current = setSort;
  });

  useEffect(() => {
    wake();
  }, [rows, order, dom, pal, reduce, attract, wake]);

  useEffect(() => {
    if (activeId === undefined) return;
    const i = rows.findIndex((r) => r.id === activeId);
    setHover(i >= 0 ? i : null, i >= 0 ? "prop" : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, rows]);

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    st.current.lastInput = clock();
    const rect = rectRef.current ?? wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const y = e.clientY - rect.top;
    const k = Math.floor((y - HEADER_H) / rowHeight);
    if (k < 0 || k >= rows.length) {
      setHover(null, null);
      return;
    }
    setHover(order[k], "pointer");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = st.current;
    s.lastInput = clock();
    // Rows are the only stepping axis, so left/right step through them too (right = next row).
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      if (!rows.length) return;
      const fwd = e.key === "ArrowDown" || e.key === "ArrowRight";
      const cur = s.hover !== null && s.source !== "attract" ? order.indexOf(s.hover) : -1;
      const next = cur < 0 ? (fwd ? 0 : rows.length - 1) : clamp(cur + (fwd ? 1 : -1), 0, rows.length - 1);
      setHover(order[next], "keyboard");
    } else if (e.key === "s" || e.key === "S") {
      e.preventDefault();
      setSort(SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length]);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      if (!rows.length) return;
      setHover(order[e.key === "Home" ? 0 : rows.length - 1], "keyboard");
    } else if (e.key === "Escape") {
      if (st.current.hover === null) return;
      e.preventDefault();
      setHover(null, null);
    }
  };

  const tableRows = useMemo(() => order.map((i) => [rows[i].label, formatValue(rows[i].a), formatValue(rows[i].b), formatGap(rows[i].b - rows[i].a, rows[i].a, rows[i].b)]), [order, rows, formatValue, formatGap]);
  const tableCols = useMemo(() => ["Item", labels[0], labels[1], "Gap"], [labels]);
  const height = HEADER_H + rows.length * rowHeight + 4;
  const summary = useMemo(() => {
    let top = -1;
    for (let i = 0; i < rows.length; i++) if (top < 0 || Math.abs(rows[i].b - rows[i].a) > Math.abs(rows[top].b - rows[top].a)) top = i;
    const t = rows[top];
    return `${ariaLabel}: ${rows.length} rows from ${labels[0]} to ${labels[1]}${t ? `. Largest change: ${t.label}, ${formatGap(t.b - t.a, t.a, t.b)}` : ""}`;
  }, [rows, labels, ariaLabel, formatGap]);

  return (
    <div ref={rootRef} data-loop="idle" className={cn("relative w-full select-none text-[color:var(--bjork-text)]", className)} style={{ ...vars, height }}>
      <div
        ref={wrapperRef}
        role="group"
        aria-roledescription="chart"
        aria-label={`${ariaLabel}, sorted by ${SORT_NAMES[sort]}. Arrow keys move between rows, S changes the sort.`}
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
          // A touch tap fires leave right after up; keep the tapped mark until the next tap.
          if (e.pointerType !== "touch") setHover(null, null);
        }}
        onKeyDown={onKeyDown}
        className={cn("absolute inset-0 touch-pan-y rounded-[10px]", chartFocusRing)}
      >
        <div ref={hostRef} className="absolute inset-0">
          <canvas ref={canvasRef} role="img" aria-label={summary} className="pointer-events-none absolute left-0 top-0" />
        </div>
        {/* Legend: keys mirror the marks. */}
        <div aria-hidden="true" className="pointer-events-none absolute left-0 top-0 flex items-center gap-4 font-bjork-alpha text-[11px] font-medium leading-3 text-[color:var(--bjork-text-medium)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-[9px] rounded-full border-[1.5px] border-[color:var(--bjork-text-muted)]" />
            {labels[0]}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-[9px] rounded-full bg-[color:var(--bjork-accent)]" />
            {labels[1]}
          </span>
        </div>
        <span aria-hidden="true" className="pointer-events-none absolute right-0 top-[1px] font-mono text-[9px] uppercase leading-none tracking-[0.1em] text-[color:var(--bjork-text-soft)] [text-box:trim-both_cap_alphabetic]">
          Gap
        </span>
        <LabelPool count={X_LABELS} pool={xPool} />
        {rows.map((r, i) => (
          <span
            key={`l-${r.id}`}
            ref={(el) => {
              labelRefs.current[i] = el;
            }}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 truncate text-right font-bjork-alpha text-[12px] font-medium leading-[14px] text-[color:var(--bjork-text-medium)] opacity-0"
          >
            {r.label}
          </span>
        ))}
        {rows.map((r, i) => (
          <span
            key={`g-${r.id}`}
            ref={(el) => {
              gapRefs.current[i] = el;
            }}
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute left-0 top-0 whitespace-nowrap font-mono text-[11px] leading-none tabular-nums opacity-0 [text-box:trim-both_cap_alphabetic]",
              r.b - r.a >= 0 ? "text-[color:var(--bjork-text)]" : "text-[color:var(--bjork-text-muted)]",
            )}
          >
            {formatGap(r.b - r.a, r.a, r.b)}
          </span>
        ))}
        <HoverTooltip ref={tipRef} onMeasure={wake} />
      </div>
      <ChartTable caption={ariaLabel} columns={tableCols} rows={tableRows} />
      <ChartAnnouncer ref={announcer} />
    </div>
  );
}
