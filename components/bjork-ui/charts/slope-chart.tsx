"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useChartCanvas, easeOut } from "@/components/bjork-ui/charts/_kit/canvas";
import {
  useChartTheme,
  chartFocusRing,
  ChartTable,
  placeTooltip,
  HoverTooltip,
  ChartAnnouncer,
  type TooltipHandle,
  type AnnouncerHandle,
  type TooltipContent,
} from "@/components/bjork-ui/charts/_kit/chrome";
import { clamp, damp, niceDomain, withAlpha, formatNumber, formatSigned, formatPercent } from "@/components/bjork-ui/charts/_kit/scale";

export interface SlopeItem {
  id: string;
  label: string;
  a: number;
  b: number;
}

export interface SlopeChartProps {
  items: SlopeItem[];
  /** Column headings for the two ends, e.g. ["2023", "2025"]. */
  labels?: [string, string];
  /** Pinned item drawn in the accent. Uncontrolled by default. */
  highlightId?: string | null;
  defaultHighlightId?: string | null;
  onHighlightChange?: (id: string | null) => void;
  /** Dim the items that do not match. */
  filter?: "all" | "up" | "down";
  domain?: [number, number];
  formatValue?: (v: number) => string;
  /** How the change reads in the tooltip: absolute difference or relative change. */
  formatChange?: (a: number, b: number) => string;
  height?: number;
  ariaLabel?: string;
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

const PAD_TOP = 40;
const PAD_BOTTOM = 14;
const LABEL_GAP = 10;
const MIN_SPACING = 17;
const ENTER_MS = 900;
const LINE_MS = 520;
const ALPHA_TAU = 0.1;
const VALUE_TAU = 0.14;
const ATTRACT_STEP_MS = 1800;
const ATTRACT_IDLE_MS = 4000;

const DEFAULT_LABELS: [string, string] = ["Before", "After"];
const clock = () => performance.now();
// Intl prints a hyphen-minus; values carry a true minus.
const defaultFormatValue = (v: number) => `${v < 0 ? "−" : ""}${formatNumber(Math.abs(v), 1)}%`;
const defaultFormatChange = (a: number, b: number) => `${formatSigned(b - a, (n) => formatNumber(n, 1))} pts · ${formatSigned(a ? (b - a) / Math.abs(a) : 0, (n) => formatPercent(n, 0))}`;

// Spreads label centres so neighbours sit at least `gap` apart, staying as close to their targets as possible.
function relax(targets: number[], gap: number, lo: number, hi: number): number[] {
  const idx = targets.map((_, i) => i).sort((a, b) => targets[a] - targets[b]);
  const pos = targets.slice();
  for (let iter = 0; iter < 60; iter++) {
    let moved = false;
    for (let k = 1; k < idx.length; k++) {
      const a = idx[k - 1];
      const b = idx[k];
      const d = pos[b] - pos[a];
      if (d < gap) {
        const push = (gap - d) / 2;
        pos[a] -= push;
        pos[b] += push;
        moved = true;
      }
    }
    for (const i of idx) pos[i] = clamp(pos[i], lo, hi);
    if (!moved) break;
  }
  // Final pass: a strict sweep so clamping never leaves overlaps.
  for (let k = 1; k < idx.length; k++) if (pos[idx[k]] - pos[idx[k - 1]] < gap) pos[idx[k]] = pos[idx[k - 1]] + gap;
  for (let k = idx.length - 2; k >= 0; k--) if (pos[idx[k + 1]] > hi && pos[idx[k + 1]] - pos[idx[k]] < gap) pos[idx[k]] = pos[idx[k + 1]] - gap;
  return pos;
}

interface Run {
  mKey: string;
  lw: number;
  rw: number;
  enter: number;
  da: number[];
  db: number[];
  alpha: number[];
  hover: number | null;
  source: "pointer" | "keyboard" | "attract" | null;
  geo: { xa: number; xb: number; ya: number[]; yb: number[] };
  lastInput: number;
  attractAt: number;
  ready: boolean;
}

export function SlopeChart({
  items,
  labels = DEFAULT_LABELS,
  highlightId: highlightProp,
  defaultHighlightId = null,
  onHighlightChange,
  filter = "all",
  domain,
  formatValue = defaultFormatValue,
  formatChange = defaultFormatChange,
  height = 380,
  ariaLabel = "Slope chart",
  tone: toneProp,
  attract = false,
  className,
}: SlopeChartProps) {
  const { pal, reduce, vars } = useChartTheme(toneProp);
  const announcer = useRef<AnnouncerHandle>(null);
  const tipRef = useRef<TooltipHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const leftRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rightRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rectRef = useRef<DOMRect | null>(null);
  const headARef = useRef<HTMLSpanElement>(null);
  const headBRef = useRef<HTMLSpanElement>(null);
  const [hlState, setHlState] = useState<string | null>(defaultHighlightId);
  const highlightId = highlightProp !== undefined ? highlightProp : hlState;

  const dom = useMemo<[number, number]>(() => {
    if (domain) return domain;
    let lo = Infinity;
    let hi = -Infinity;
    for (const it of items) {
      lo = Math.min(lo, it.a, it.b);
      hi = Math.max(hi, it.a, it.b);
    }
    return Number.isFinite(lo) ? niceDomain(Math.min(0, lo), hi, 5) : [0, 1];
  }, [items, domain]);

  const cfg = useRef({ items, dom, highlightId, filter, reduce, pal, attract });
  useEffect(() => {
    cfg.current = { items, dom, highlightId, filter, reduce, pal, attract };
  });

  const st = useRef<Run>({
    mKey: "",
    lw: 0,
    rw: 0,
    enter: 0,
    da: [],
    db: [],
    alpha: [],
    hover: null,
    source: null,
    geo: { xa: 0, xb: 0, ya: [], yb: [] },
    lastInput: 0,
    attractAt: 0,
    ready: false,
  });
  const hoverRef = useRef<(i: number | null, source: Run["source"]) => void>(() => {});

  const { rootRef, hostRef, canvasRef, wake } = useChartCanvas(({ ctx, w, h, dt }) => {
    const s = st.current;
    const c = cfg.current;
    const p = c.pal;
    const I = c.items;
    const n = I.length;

    // Label columns: the widest rendered label, measured when the items or width change.
    const mKey = `${n}|${w}|${I[0]?.id}|${I[n - 1]?.id}`;
    if (s.mKey !== mKey || !s.lw) {
      s.lw = 0;
      s.rw = 0;
      for (let i = 0; i < n; i++) {
        s.lw = Math.max(s.lw, leftRefs.current[i]?.offsetWidth ?? 0);
        s.rw = Math.max(s.rw, rightRefs.current[i]?.offsetWidth ?? 0);
      }
      s.mKey = mKey;
    }
    const lw = s.lw;
    const rw = s.rw;
    const xa = Math.round(lw + LABEL_GAP + 6) + 0.5;
    const xb = Math.round(w - rw - LABEL_GAP - 6) + 0.5;
    const top = PAD_TOP;
    const bot = h - PAD_BOTTOM;
    const yOf = (v: number) => bot - ((v - c.dom[0]) / Math.max(1e-12, c.dom[1] - c.dom[0])) * (bot - top);

    let moving = false;
    for (let i = 0; i < n; i++) {
      const it = I[i];
      const match = c.filter === "all" || (c.filter === "up" ? it.b >= it.a : it.b < it.a);
      const target = match ? 1 : 0.12;
      if (!s.ready || c.reduce || s.da[i] === undefined) {
        s.da[i] = it.a;
        s.db[i] = it.b;
        s.alpha[i] = target;
        continue;
      }
      s.da[i] = damp(s.da[i], it.a, VALUE_TAU, dt);
      s.db[i] = damp(s.db[i], it.b, VALUE_TAU, dt);
      s.alpha[i] = damp(s.alpha[i], target, ALPHA_TAU, dt);
      if (Math.abs(s.da[i] - it.a) + Math.abs(s.db[i] - it.b) > 1e-4 * (c.dom[1] - c.dom[0]) || Math.abs(s.alpha[i] - target) > 1e-3) moving = true;
    }
    s.da.length = n;
    s.db.length = n;
    s.alpha.length = n;
    s.ready = true;

    s.enter = c.reduce ? 1 : Math.min(1, s.enter + (dt * 1000) / ENTER_MS);
    const growOf = (i: number) => (s.enter >= 1 ? 1 : easeOut(clamp((s.enter * ENTER_MS - (i / Math.max(1, n)) * (ENTER_MS - LINE_MS)) / LINE_MS, 0, 1)));

    // Axes, with their headings centred above them.
    if (headARef.current) headARef.current.style.transform = `translate3d(${xa.toFixed(1)}px, 0, 0) translateX(-50%)`;
    if (headBRef.current) headBRef.current.style.transform = `translate3d(${xb.toFixed(1)}px, 0, 0) translateX(-50%)`;
    ctx.strokeStyle = p.textFaint;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xa, top - 10);
    ctx.lineTo(xa, bot + 6);
    ctx.moveTo(xb, top - 10);
    ctx.lineTo(xb, bot + 6);
    ctx.stroke();

    const ya = s.da.map(yOf);
    const yb = s.db.map(yOf);
    s.geo = { xa, xb, ya, yb };
    const hl = I.findIndex((it) => it.id === c.highlightId);
    const focus = s.hover ?? (hl >= 0 ? hl : null);

    // Lines, quiet ones first, then the hovered and pinned ones on top.
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => (a === focus ? 1 : b === focus ? -1 : a === hl ? 1 : b === hl ? -1 : 0));
    for (const i of order) {
      const g = growOf(i);
      if (g <= 0) continue;
      const isHl = i === hl;
      const isFocus = i === focus;
      const strong = isHl || isFocus;
      const a = s.alpha[i] * (focus !== null && !strong ? 0.5 : 1);
      const x1 = xa + (xb - xa) * g;
      const y1 = ya[i] + (yb[i] - ya[i]) * g;
      ctx.beginPath();
      ctx.moveTo(xa, ya[i]);
      ctx.lineTo(x1, y1);
      ctx.lineCap = "round";
      ctx.lineWidth = strong ? 2 : 1.25;
      ctx.strokeStyle = isHl ? p.accent : isFocus ? p.text : withAlpha(p.text, 0.38 * a);
      ctx.stroke();
      for (const [x, y, show] of [
        [xa, ya[i], true],
        [xb, yb[i], g >= 1],
      ] as [number, number, boolean][]) {
        if (!show) continue;
        ctx.beginPath();
        ctx.arc(x, y, strong ? 4 : 3, 0, Math.PI * 2);
        ctx.fillStyle = isHl ? p.accent : strong ? p.text : withAlpha(p.text, 0.6 * a);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = p.stage;
        ctx.stroke();
      }
    }

    // Labels: relaxed apart, with leader lines when a label leaves its point.
    const la = relax(ya, MIN_SPACING, top - 4, bot + 4);
    const lb = relax(yb, MIN_SPACING, top - 4, bot + 4);
    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const g = growOf(i);
      const strong = i === hl || i === focus;
      const a = s.alpha[i] * (focus !== null && !strong ? 0.55 : 1);
      const L = leftRefs.current[i];
      const R = rightRefs.current[i];
      if (L) {
        L.style.opacity = String(Math.min(1, g * 2) * (strong ? 1 : 0.35 + 0.65 * a));
        L.style.transform = `translate3d(${(xa - LABEL_GAP - 6).toFixed(1)}px, ${la[i].toFixed(1)}px, 0) translate(-100%, -50%)`;
        if (strong) L.dataset.strong = i === hl ? "accent" : "ink";
        else delete L.dataset.strong;
      }
      if (R) {
        R.style.opacity = String(clamp((g - 0.85) / 0.15, 0, 1) * (strong ? 1 : 0.35 + 0.65 * a));
        R.style.transform = `translate3d(${(xb + LABEL_GAP + 6).toFixed(1)}px, ${lb[i].toFixed(1)}px, 0) translateY(-50%)`;
        if (strong) R.dataset.strong = i === hl ? "accent" : "ink";
        else delete R.dataset.strong;
      }
      ctx.strokeStyle = withAlpha(p.text, strong ? 0.5 : 0.18 * a);
      if (Math.abs(la[i] - ya[i]) > 2 && g > 0) {
        ctx.beginPath();
        ctx.moveTo(xa - 5, ya[i]);
        ctx.lineTo(xa - LABEL_GAP + 1, la[i]);
        ctx.stroke();
      }
      if (Math.abs(lb[i] - yb[i]) > 2 && g >= 1) {
        ctx.beginPath();
        ctx.moveTo(xb + 5, yb[i]);
        ctx.lineTo(xb + LABEL_GAP - 1, lb[i]);
        ctx.stroke();
      }
    }

    const tip = tipRef.current;
    if (tip?.el && s.hover !== null) {
      const i = s.hover;
      const pos = placeTooltip((xa + xb) / 2, (ya[i] + yb[i]) / 2, tip.size.w, tip.size.h, w, h, 14);
      tip.el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
    }

    if (c.attract && !c.reduce && n && (!s.lastInput || clock() - s.lastInput > ATTRACT_IDLE_MS)) {
      if (clock() - s.attractAt > ATTRACT_STEP_MS) {
        s.attractAt = clock();
        hoverRef.current(s.hover === null ? 0 : (s.hover + 1) % n, "attract");
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
      title: it.label,
      rows: [
        { key: "a", label: labels[0], value: formatValue(it.a), strong: false },
        { key: "b", label: labels[1], value: formatValue(it.b) },
        { key: "d", label: "Change", value: formatChange(it.a, it.b) },
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
      const it = items[i];
      announcer.current?.say(`${it.label}: ${labels[0]} ${formatValue(it.a)}, ${labels[1]} ${formatValue(it.b)}, ${formatChange(it.a, it.b)}`);
    }
    wake();
  };
  useEffect(() => {
    hoverRef.current = setHover;
  });

  const pin = (id: string | null) => {
    if (highlightProp === undefined) setHlState(id);
    onHighlightChange?.(id);
  };

  useEffect(() => {
    wake();
  }, [items, dom, highlightId, filter, pal, reduce, attract, wake]);

  // Nearest line by distance to its segment, within 14px.
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    st.current.lastInput = clock();
    const rect = rectRef.current ?? wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const s = st.current;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { xa, xb, ya, yb } = s.geo;
    let best: number | null = null;
    let bd = 14;
    for (let i = 0; i < items.length; i++) {
      let d: number;
      if (x < xa - 4) d = Math.abs(y - ya[i]) + (xa - x) * 0.05;
      else if (x > xb + 4) d = Math.abs(y - yb[i]) + (x - xb) * 0.05;
      else {
        const t = clamp((x - xa) / Math.max(1, xb - xa), 0, 1);
        d = Math.abs(y - (ya[i] + (yb[i] - ya[i]) * t));
      }
      if (s.alpha[i] < 0.5) d += 8;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    setHover(best, "pointer");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = st.current;
    s.lastInput = clock();
    const order = items.map((_, i) => i).sort((a, b) => items[b].b - items[a].b);
    const cur = s.hover !== null && s.source !== "attract" ? order.indexOf(s.hover) : -1;
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const dir = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
      const next = cur < 0 ? (dir > 0 ? 0 : order.length - 1) : clamp(cur + dir, 0, order.length - 1);
      setHover(order[next], "keyboard");
    } else if ((e.key === "Enter" || e.key === " ") && s.hover !== null) {
      e.preventDefault();
      const id = items[s.hover].id;
      pin(highlightId === id ? null : id);
      announcer.current?.say(highlightId === id ? "Unpinned" : `${items[s.hover].label} pinned`);
    } else if (e.key === "Escape") {
      setHover(null, null);
    }
  };

  const tableRows = useMemo(() => items.map((it) => [it.label, formatValue(it.a), formatValue(it.b), formatChange(it.a, it.b)]), [items, formatValue, formatChange]);
  const tableCols = useMemo(() => ["Item", labels[0], labels[1], "Change"], [labels]);
  const summary = useMemo(() => {
    const up = items.filter((it) => it.b > it.a).length;
    const down = items.filter((it) => it.b < it.a).length;
    return `${ariaLabel}: ${items.length} items from ${labels[0]} to ${labels[1]}, ${up} rose and ${down} fell`;
  }, [items, labels, ariaLabel]);

  return (
    <div ref={rootRef} data-loop="idle" className={cn("relative w-full select-none text-[color:var(--bjork-text)]", className)} style={{ ...vars, height }}>
      <div
        ref={wrapperRef}
        role="group"
        aria-roledescription="chart"
        aria-label={`${ariaLabel}. Arrow keys move between items, Enter pins one.`}
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
          if (s.hover === null) return;
          const id = items[s.hover].id;
          pin(highlightId === id ? null : id);
        }}
        onPointerLeave={() => setHover(null, null)}
        onKeyDown={onKeyDown}
        className={cn("absolute inset-0 cursor-pointer touch-pan-y rounded-[10px]", chartFocusRing)}
      >
        <div ref={hostRef} className="absolute inset-0">
          <canvas ref={canvasRef} role="img" aria-label={summary} className="pointer-events-none absolute left-0 top-0" />
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-5 font-mono text-[10px] uppercase leading-none tracking-[0.1em] text-[color:var(--bjork-text-soft)]">
          <span ref={headARef} className="absolute left-0 top-1.5 [text-box:trim-both_cap_alphabetic]">
            {labels[0]}
          </span>
          <span ref={headBRef} className="absolute left-0 top-1.5 [text-box:trim-both_cap_alphabetic]">
            {labels[1]}
          </span>
        </div>
        {items.map((it, i) => (
          <span
            key={`l-${it.id}`}
            ref={(el) => {
              leftRefs.current[i] = el;
            }}
            aria-hidden="true"
            className="group/l pointer-events-none absolute left-0 top-0 flex items-center gap-2 whitespace-nowrap opacity-0"
          >
            <span className="font-bjork-alpha text-[12px] font-medium leading-none text-[color:var(--bjork-text-medium)] group-data-[strong=accent]/l:text-[color:var(--bjork-accent-ink)] group-data-[strong=ink]/l:text-[color:var(--bjork-text)]">
              {it.label}
            </span>
            <span className="font-mono text-[11px] leading-none tabular-nums text-[color:var(--bjork-text-muted)] [text-box:trim-both_cap_alphabetic] group-data-[strong]/l:text-[color:var(--bjork-text)]">
              {formatValue(it.a)}
            </span>
          </span>
        ))}
        {items.map((it, i) => (
          <span
            key={`r-${it.id}`}
            ref={(el) => {
              rightRefs.current[i] = el;
            }}
            aria-hidden="true"
            className="group/r pointer-events-none absolute left-0 top-0 flex items-center gap-2 whitespace-nowrap opacity-0"
          >
            <span className="font-mono text-[11px] leading-none tabular-nums text-[color:var(--bjork-text-muted)] [text-box:trim-both_cap_alphabetic] group-data-[strong]/r:text-[color:var(--bjork-text)]">
              {formatValue(it.b)}
            </span>
            <span className="font-bjork-alpha text-[12px] font-medium leading-none text-[color:var(--bjork-text-medium)] group-data-[strong=accent]/r:text-[color:var(--bjork-accent-ink)] group-data-[strong=ink]/r:text-[color:var(--bjork-text)]">
              {it.label}
            </span>
          </span>
        ))}
        <HoverTooltip ref={tipRef} onMeasure={wake} />
      </div>
      <ChartTable caption={ariaLabel} columns={tableCols} rows={tableRows} />
      <ChartAnnouncer ref={announcer} />
    </div>
  );
}
