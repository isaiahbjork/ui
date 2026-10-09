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
import { clamp, crisp, damp, niceDomain, niceTicks, timeTicks, withAlpha, formatCompact, formatPercent, gaussian } from "@/components/bjork-ui/charts/_kit/scale";

export interface EquityPoint {
  t: number;
  v: number;
}

export interface DrawdownEpisode {
  peak: number; // index
  trough: number;
  recovery: number | null;
  depth: number; // negative fraction
}

export interface DrawdownChartProps {
  data: EquityPoint[];
  benchmark?: EquityPoint[];
  benchmarkLabel?: string;
  /** How many of the deepest drawdowns get a chip. */
  topN?: number;
  /** Selected episode rank (0 = deepest). Uncontrolled by default. */
  selected?: number | null;
  defaultSelected?: number | null;
  onSelectedChange?: (rank: number | null) => void;
  /** Posed crosshair index. */
  index?: number | null;
  formatValue?: (v: number) => string;
  formatTime?: (t: number) => string;
  height?: number;
  ariaLabel?: string;
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

const TOP = 34;
const PAD_LEFT = 52;
const PAD_RIGHT = 10;
const AXIS_H = 22;
const GAP = 16;
const UNDER_FRAC = 0.34;
const ENTER_MS = 1000;
const BRACKET_TAU = 0.12;
const Y_LABELS = 6;
const U_LABELS = 4;
const X_LABELS = 12;
const DAY = 86400000;
const ATTRACT_STEP_MS = 3000;
const ATTRACT_IDLE_MS = 4000;

const clock = () => performance.now();
// Sign before the currency: −$1.2K, never $−1.2K.
const defaultFormatValue = (v: number) => `${v < 0 ? "−" : ""}$${formatCompact(Math.abs(v), 1)}`;
// Multi-year series: the tooltip and table need the year.
const dateYear = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const defaultFormatTime = (t: number) => dateYear.format(t);

// Running drawdown and the distinct episodes, deepest first.
export function computeDrawdowns(data: EquityPoint[]): { dd: number[]; peak: number[]; episodes: DrawdownEpisode[] } {
  const dd: number[] = [];
  const peak: number[] = [];
  const episodes: DrawdownEpisode[] = [];
  let pk = -Infinity;
  let pkIdx = 0;
  let cur: DrawdownEpisode | null = null;
  data.forEach((p, i) => {
    if (p.v >= pk) {
      if (cur) {
        cur.recovery = i;
        episodes.push(cur);
        cur = null;
      }
      pk = p.v;
      pkIdx = i;
    }
    const d = pk > 0 ? p.v / pk - 1 : 0;
    dd.push(d);
    peak.push(pk);
    if (d < 0) {
      if (!cur) cur = { peak: pkIdx, trough: i, recovery: null, depth: d };
      if (d < cur.depth) {
        cur.depth = d;
        cur.trough = i;
      }
    }
  });
  if (cur) episodes.push(cur);
  episodes.sort((a, b) => a.depth - b.depth);
  return { dd, peak, episodes };
}

interface Run {
  enter: number;
  bracket: { x0: number; x1: number; x2: number; y0: number; y1: number; ok: boolean };
  ready: boolean;
  hover: number | null;
  source: "pointer" | "keyboard" | "prop" | "attract" | null;
  plot: { l: number; r: number; t: number; b: number; ut: number; ub: number };
  yCache: string[];
  uCache: string[];
  xCache: string[];
  lastInput: number;
  attractAt: number;
}

export function DrawdownChart({
  data,
  benchmark,
  benchmarkLabel = "Benchmark",
  topN = 3,
  selected: selectedProp,
  defaultSelected = 0,
  onSelectedChange,
  index,
  formatValue = defaultFormatValue,
  formatTime = defaultFormatTime,
  height = 400,
  ariaLabel = "Equity and drawdown",
  tone: toneProp,
  attract = false,
  className,
}: DrawdownChartProps) {
  const { pal, reduce, vars } = useChartTheme(toneProp);
  const announcer = useRef<AnnouncerHandle>(null);
  const tipRef = useRef<TooltipHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLSpanElement>(null);
  const yPool = useRef<(HTMLSpanElement | null)[]>([]);
  const uPool = useRef<(HTMLSpanElement | null)[]>([]);
  const xPool = useRef<(HTMLSpanElement | null)[]>([]);
  const rectRef = useRef<DOMRect | null>(null);
  const [selState, setSelState] = useState<number | null>(defaultSelected);
  const selected = selectedProp !== undefined ? selectedProp : selState;

  const dd = useMemo(() => computeDrawdowns(data), [data]);
  const top = useMemo(() => dd.episodes.slice(0, topN), [dd, topN]);
  // Deepest point, once per data change rather than spread over the array every frame.
  const minDD = useMemo(() => dd.dd.reduce((m, d) => (d < m ? d : m), -0.01), [dd]);

  const cfg = useRef({ data, benchmark, dd, minDD, top, selected, reduce, pal, formatValue, formatTime, attract });
  useEffect(() => {
    cfg.current = { data, benchmark, dd, minDD, top, selected, reduce, pal, formatValue, formatTime, attract };
  });

  const st = useRef<Run>({
    enter: 0,
    bracket: { x0: 0, x1: 0, x2: 0, y0: 0, y1: 0, ok: false },
    ready: false,
    hover: index ?? null,
    source: index != null ? "prop" : null,
    plot: { l: 0, r: 0, t: 0, b: 0, ut: 0, ub: 0 },
    yCache: [],
    uCache: [],
    xCache: [],
    lastInput: 0,
    attractAt: 0,
  });
  const selectRef = useRef<(rank: number | null, announce: boolean) => void>(() => {});

  const { rootRef, hostRef, canvasRef, wake } = useChartCanvas(({ ctx, w, h, dt }) => {
    const s = st.current;
    const c = cfg.current;
    const p = c.pal;
    const D = c.data;
    const n = D.length;
    if (n < 2) return false;
    const inner = h - TOP - AXIS_H - GAP;
    const uh = Math.round(inner * UNDER_FRAC);
    const plot = { l: PAD_LEFT, r: w - PAD_RIGHT, t: TOP, b: TOP + inner - uh, ut: 0, ub: 0 };
    plot.ut = plot.b + GAP;
    plot.ub = plot.ut + uh;
    s.plot = plot;
    const t0 = D[0].t;
    const t1 = D[n - 1].t;
    const xOf = (t: number) => plot.l + ((t - t0) / Math.max(1, t1 - t0)) * (plot.r - plot.l);

    // Equity domain, including the benchmark.
    let lo = Infinity;
    let hi = -Infinity;
    for (const pt of D) {
      lo = Math.min(lo, pt.v);
      hi = Math.max(hi, pt.v);
    }
    for (const pt of c.benchmark ?? []) {
      lo = Math.min(lo, pt.v);
      hi = Math.max(hi, pt.v);
    }
    const [y0, y1] = niceDomain(lo, hi, 5);
    const yOf = (v: number) => plot.b - ((v - y0) / Math.max(1e-12, y1 - y0)) * (plot.b - plot.t);
    const [u0] = niceDomain(c.minDD * 1.05, 0, 3);
    const uOf = (d: number) => plot.ut + (d / Math.min(-1e-9, u0)) * (plot.ub - plot.ut);

    s.enter = c.reduce ? 1 : Math.min(1, s.enter + (dt * 1000) / ENTER_MS);
    const revealX = plot.l + (plot.r - plot.l) * easeOut(s.enter);

    // Grid and labels.
    const yt = niceTicks(y0, y1, 4);
    const ut = niceTicks(u0, 0, 3);
    ctx.strokeStyle = p.hair;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const v of yt) {
      ctx.moveTo(plot.l, crisp(yOf(v)));
      ctx.lineTo(plot.r, crisp(yOf(v)));
    }
    for (const v of ut) {
      if (Math.abs(v) < 1e-12) continue;
      ctx.moveTo(plot.l, crisp(uOf(v)));
      ctx.lineTo(plot.r, crisp(uOf(v)));
    }
    ctx.stroke();
    writeLabels(yPool.current, s.yCache, yt.map((v) => ({ text: c.formatValue(v), x: plot.l - 8, y: yOf(v), ax: -100 })));
    writeLabels(uPool.current, s.uCache, ut.map((v) => ({ text: Math.abs(v) < 1e-12 ? "0%" : formatPercent(v, 0), x: plot.l - 8, y: uOf(v), ax: -100 })));
    // Tighter spacing on narrow plots, so a two-year series keeps more than one year label.
    const xt = timeTicks(t0, t1, plot.r - plot.l, plot.r - plot.l < 480 ? 48 : 80);
    writeLabels(
      xPool.current,
      s.xCache,
      xt.filter((tk) => xOf(tk.t) > plot.l + 16 && xOf(tk.t) < plot.r - 16).map((tk) => ({ text: tk.label, x: xOf(tk.t), y: plot.ub + 13, ax: -50 })),
    );

    // Selected episode: a band through both panes.
    const ep = c.selected !== null && c.selected !== undefined ? c.top[c.selected] : null;
    if (ep) {
      const xa = xOf(D[ep.peak].t);
      const xb = xOf(D[ep.recovery ?? n - 1].t);
      ctx.fillStyle = withAlpha(p.accent, 0.06);
      ctx.fillRect(xa, plot.t, xb - xa, plot.b - plot.t);
      ctx.fillRect(xa, plot.ut, xb - xa, plot.ub - plot.ut);
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, revealX, h);
    ctx.clip();
    // Running peak: a dashed ghost of where equity would be with no drawdown.
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = p.textFaint;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = xOf(D[i].t);
      const y = yOf(c.dd.peak[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    if (c.benchmark?.length) {
      ctx.strokeStyle = p.textSoft;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      c.benchmark.forEach((pt, i) => (i === 0 ? ctx.moveTo(xOf(pt.t), yOf(pt.v)) : ctx.lineTo(xOf(pt.t), yOf(pt.v))));
      ctx.stroke();
    }
    ctx.lineJoin = "round";
    ctx.lineWidth = 1.75;
    ctx.strokeStyle = withAlpha(p.text, 0.88);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = xOf(D[i].t);
      const y = yOf(D[i].v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Underwater: the drawdown below zero.
    ctx.beginPath();
    ctx.moveTo(xOf(D[0].t), uOf(0));
    for (let i = 0; i < n; i++) ctx.lineTo(xOf(D[i].t), uOf(c.dd.dd[i]));
    ctx.lineTo(xOf(D[n - 1].t), uOf(0));
    ctx.closePath();
    ctx.fillStyle = withAlpha(p.error, 0.16);
    ctx.fill();
    ctx.strokeStyle = withAlpha(p.error, 0.85);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = xOf(D[i].t);
      const y = uOf(c.dd.dd[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = p.textFaint;
    ctx.beginPath();
    ctx.moveTo(plot.l, crisp(uOf(0)));
    ctx.lineTo(plot.r, crisp(uOf(0)));
    ctx.stroke();

    // Bracket: peak to trough on the equity line, eased between episodes.
    let moving = false;
    const note = noteRef.current;
    if (ep) {
      const tgt = { x0: xOf(D[ep.peak].t), x1: xOf(D[ep.trough].t), x2: xOf(D[ep.recovery ?? n - 1].t), y0: yOf(D[ep.peak].v), y1: yOf(D[ep.trough].v) };
      const b = s.bracket;
      if (!b.ok || c.reduce) Object.assign(b, tgt, { ok: true });
      else {
        for (const k of ["x0", "x1", "x2", "y0", "y1"] as const) {
          b[k] = damp(b[k], tgt[k], BRACKET_TAU, dt);
          if (Math.abs(b[k] - tgt[k]) > 0.2) moving = true;
          else b[k] = tgt[k];
        }
      }
      const a = clamp((s.enter - 0.7) / 0.3, 0, 1);
      ctx.globalAlpha = a;
      ctx.strokeStyle = p.accentInk;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      // Horizontal from the peak to above the trough, then down to the trough.
      ctx.moveTo(b.x0, crisp(b.y0));
      ctx.lineTo(b.x1, crisp(b.y0));
      ctx.moveTo(crisp(b.x1), b.y0);
      ctx.lineTo(crisp(b.x1), b.y1);
      ctx.stroke();
      for (const [x, y] of [
        [b.x0, b.y0],
        [b.x1, b.y1],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = p.accent;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = p.stage;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (note) {
        const days = ep.recovery !== null ? Math.round((D[ep.recovery].t - D[ep.trough].t) / DAY) : null;
        const text = `${formatPercent(ep.depth, 1)} · ${days !== null ? `${days}d to recover` : "not recovered"}`;
        if (note.textContent !== text) {
          note.textContent = text;
          note.dataset.w = String(note.offsetWidth);
        }
        const nw = Number(note.dataset.w) || 0;
        const ux = clamp(b.x1 - nw / 2, plot.l, plot.r - nw);
        note.style.opacity = String(a);
        note.style.transform = `translate3d(${ux.toFixed(1)}px, ${(uOf(ep.depth) + 6).toFixed(1)}px, 0)`;
      }
    } else {
      s.bracket.ok = false;
      if (note) note.style.opacity = "0";
    }

    // Crosshair through both panes.
    const tip = tipRef.current;
    if (s.hover !== null && s.hover >= 0 && s.hover < n) {
      const i = s.hover;
      const x = crisp(xOf(D[i].t) - 0.5);
      ctx.strokeStyle = p.textSoft;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, plot.t);
      ctx.lineTo(x, plot.b);
      ctx.moveTo(x, plot.ut);
      ctx.lineTo(x, plot.ub);
      ctx.stroke();
      for (const [y, col] of [
        [yOf(D[i].v), p.text],
        [uOf(c.dd.dd[i]), p.error],
      ] as [number, string][]) {
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = p.stage;
        ctx.stroke();
      }
      if (tip?.el) {
        const pos = placeTooltip(x, yOf(D[i].v), tip.size.w, tip.size.h, w, h, 14);
        tip.el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      }
    }

    if (c.attract && !c.reduce && c.top.length && (!s.lastInput || clock() - s.lastInput > ATTRACT_IDLE_MS)) {
      if (clock() - s.attractAt > ATTRACT_STEP_MS) {
        s.attractAt = clock();
        selectRef.current(((c.selected ?? -1) + 1) % c.top.length, false);
      }
      return true;
    }
    return moving || s.enter < 1;
  });

  const tooltipFor = (i: number): TooltipContent | null => {
    const pt = data[i];
    if (!pt) return null;
    const d = dd.dd[i];
    // Days since the running peak.
    let k = i;
    while (k > 0 && data[k - 1].v < dd.peak[i]) k--;
    const since = d < 0 ? Math.round((pt.t - data[Math.max(0, k - 1)].t) / DAY) : 0;
    const bm = benchmark?.find((b) => b.t === pt.t);
    return {
      key: `${i}|${pal.text}`,
      title: formatTime(pt.t),
      rows: [
        { key: "v", label: "Equity", value: formatValue(pt.v), color: pal.text },
        ...(bm ? [{ key: "b", label: benchmarkLabel, value: formatValue(bm.v), color: pal.textSoft, strong: false }] : []),
        { key: "d", label: "Drawdown", value: d < 0 ? formatPercent(d, 1) : "at peak", color: pal.error },
        ...(d < 0 ? [{ key: "s", label: "Under water", value: `${since}d`, strong: false }] : []),
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
      const d = dd.dd[i];
      announcer.current?.say(`${formatTime(data[i].t)}: ${formatValue(data[i].v)}, ${d < 0 ? `${formatPercent(-d, 1)} below peak` : "at a new peak"}`);
    }
    wake();
  };

  const select = (rank: number | null, announce = true) => {
    if (selectedProp === undefined) setSelState(rank);
    onSelectedChange?.(rank);
    const ep = rank !== null ? top[rank] : null;
    if (announce && ep) {
      const days = ep.recovery !== null ? Math.round((data[ep.recovery].t - data[ep.trough].t) / DAY) : null;
      announcer.current?.say(`Drawdown ${rank! + 1}: ${formatPercent(ep.depth, 1)} from ${formatTime(data[ep.peak].t)} to ${formatTime(data[ep.trough].t)}, ${days !== null ? `recovered in ${days} days` : "not yet recovered"}`);
    }
    wake();
  };
  useEffect(() => {
    selectRef.current = select;
  });

  useEffect(() => {
    wake();
  }, [data, benchmark, dd, top, selected, pal, reduce, attract, wake]);

  useEffect(() => {
    if (index === undefined) return;
    setHover(index, index === null ? null : "prop");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, pal]);

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    st.current.lastInput = clock();
    const rect = rectRef.current ?? wrapperRef.current?.getBoundingClientRect();
    if (!rect || data.length < 2) return;
    const s = st.current;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < s.plot.l || x > s.plot.r || y < s.plot.t || y > s.plot.ub) {
      setHover(null, null);
      return;
    }
    const t = data[0].t + ((x - s.plot.l) / (s.plot.r - s.plot.l)) * (data[data.length - 1].t - data[0].t);
    let lo = 0;
    let hi = data.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (data[mid].t < t) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(data[lo - 1].t - t) < Math.abs(data[lo].t - t)) lo--;
    setHover(lo, "pointer");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = st.current;
    s.lastInput = clock();
    const n = data.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const step = (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 10 : 1);
      setHover(s.hover === null || s.source === "attract" ? n - 1 : clamp(s.hover + step, 0, n - 1), "keyboard");
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setHover(e.key === "Home" ? 0 : n - 1, "keyboard");
    } else if (/^[1-9]$/.test(e.key) && Number(e.key) <= top.length) {
      e.preventDefault();
      const rank = Number(e.key) - 1;
      select(rank);
      setHover(top[rank].trough, "keyboard");
    } else if (e.key === "Escape") setHover(null, null);
  };

  const tableRows = useMemo(() => top.map((ep, r) => [`#${r + 1}`, formatPercent(ep.depth, 1), formatTime(data[ep.peak].t), formatTime(data[ep.trough].t), ep.recovery !== null ? formatTime(data[ep.recovery].t) : "Not recovered"]), [top, data, formatTime]);
  const tableCols = useMemo(() => ["Rank", "Depth", "Peak", "Trough", "Recovered"], []);
  const last = data[data.length - 1];

  return (
    <div ref={rootRef} data-loop="idle" className={cn("relative w-full select-none text-[color:var(--bjork-text)]", className)} style={{ ...vars, height }}>
      {/* Episode chips: real buttons. */}
      <div className="absolute left-0 top-0 z-10 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-[9px] uppercase leading-none tracking-[0.1em] text-[color:var(--bjork-text-soft)]">Worst</span>
        {top.map((ep, r) => {
          const on = selected === r;
          return (
            <button
              key={r}
              type="button"
              aria-pressed={on}
              onClick={() => select(on ? null : r)}
              className={cn(
                "inline-flex h-[22px] items-center gap-1.5 rounded-[7px] border px-2 font-mono text-[11px] leading-none tabular-nums transition-[background-color,border-color,color,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)] active:scale-[0.97]",
                on
                  ? "border-transparent bg-[color:var(--bjork-accent-fill)] text-[color:var(--bjork-accent-foreground)]"
                  : "border-[color:var(--bjork-border)] text-[color:var(--bjork-text-medium)] hover:bg-[color:var(--bjork-surface-hover)]",
              )}
            >
              <span className="opacity-60">{r + 1}</span>
              <span className="[text-box:trim-both_cap_alphabetic]">{formatPercent(ep.depth, 1)}</span>
            </button>
          );
        })}
      </div>
      <div
        ref={wrapperRef}
        role="group"
        aria-roledescription="chart"
        aria-label={`${ariaLabel}. Left and right move through time, number keys jump to the worst drawdowns.`}
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
        className={cn("absolute inset-0 cursor-crosshair touch-pan-y rounded-[10px]", chartFocusRing)}
      >
        <div ref={hostRef} className="absolute inset-0">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`${ariaLabel}: ending at ${last ? formatValue(last.v) : ""}, worst drawdown ${top[0] ? formatPercent(top[0].depth, 1) : "none"}`}
            className="pointer-events-none absolute left-0 top-0"
          />
        </div>
        <LabelPool count={Y_LABELS} pool={yPool} />
        <LabelPool count={U_LABELS} pool={uPool} />
        <LabelPool count={X_LABELS} pool={xPool} />
        <span
          ref={noteRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-[6px] bg-[color:var(--bjork-chart-bg)] px-1.5 py-1 font-mono text-[10px] leading-none tabular-nums text-[color:var(--bjork-accent-ink)] opacity-0 [text-box:trim-both_cap_alphabetic]"
        />
        <HoverTooltip ref={tipRef} onMeasure={wake} />
      </div>
      <ChartTable caption={`${ariaLabel}: worst drawdowns`} columns={tableCols} rows={tableRows} />
      <ChartAnnouncer ref={announcer} />
    </div>
  );
}

// Seeded equity curve for demos: drift, volatility regimes and a couple of real drawdowns.
export function createEquityCurve(seed: number, days = 756, start = Date.UTC(2022, 0, 3)): { equity: EquityPoint[]; benchmark: EquityPoint[] } {
  const rnd = mulberry32(seed);
  let v = 100000;
  let b = 100000;
  let vol = 0.009;
  const equity: EquityPoint[] = [];
  const benchmark: EquityPoint[] = [];
  for (let i = 0; i < days; i++) {
    const shock = rnd() < 0.006 ? -0.035 : 0;
    vol = clamp(vol * (0.97 + rnd() * 0.06) + (shock ? 0.004 : 0), 0.005, 0.03);
    const m = gaussian(rnd);
    // One deliberate regime: a sharp slide around 40% of the way in, then a slower recovery.
    const f = i / days;
    const regime = f > 0.4 && f < 0.44 ? -0.0085 : f >= 0.44 && f < 0.6 ? 0.0034 : 0;
    v *= 1 + 0.0006 + regime + m * vol * (f > 0.85 ? 0.6 : 1) + shock;
    b *= 1 + 0.0003 + (m * 0.6 + gaussian(rnd) * 0.8) * 0.008;
    equity.push({ t: start + i * DAY, v });
    benchmark.push({ t: start + i * DAY, v: b });
  }
  return { equity, benchmark };
}
