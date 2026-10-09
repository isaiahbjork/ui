"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useChartCanvas, easeOut, hatchPattern } from "@/components/bjork-ui/charts/_kit/canvas";
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
  type TooltipRow,
} from "@/components/bjork-ui/charts/_kit/chrome";
import { clamp, crisp, damp, withAlpha, formatNumber, formatPercent, formatSigned } from "@/components/bjork-ui/charts/_kit/scale";

export interface FunnelStep {
  id: string;
  label: string;
  /** People (or sessions, accounts) who reached this step. Negative and non-finite values count as 0. */
  value: number;
}

export interface FunnelChartProps {
  /** Ordered steps, first (widest) at the top. Bars share one zero baseline; length is the count. */
  steps: FunnelStep[];
  /** Counts for a comparison period keyed by step id. Each step gets a ghost marker and a change in pp. */
  previous?: Record<string, number> | null;
  /** Name of the comparison period, used in the legend, tooltip and table. */
  previousLabel?: string;
  /** Header over the count column and the first tooltip row. */
  valueLabel?: string;
  /** Formats counts. Defaults to grouped integers (12,480). */
  formatValue?: (v: number) => string;
  /** Formats conversion rates given as a fraction (0.464). Defaults to one decimal percent. */
  formatRate?: (r: number) => string;
  /** Marks the step with the lowest step conversion in the accent with a short annotation. */
  highlightWorst?: boolean;
  /** The annotation beside the worst step's conversion. */
  worstLabel?: string;
  /** Posed focus (step id), e.g. for previews. `null` clears it. */
  activeId?: string | null;
  /** Fixed height. Bars and gutters scale (within limits) to fill it. Defaults to the natural height. */
  height?: number;
  ariaLabel?: string;
  tone?: BjorkTone;
  className?: string;
}

// Layout, in px. Wide: label gutter | bars | count | overall. Narrow: label line above each bar.
const NARROW = 480;
const HEADER_H = 30;
const PAD_B = 6;
const W_BAR = 26;
const W_GUT = 26;
const N_LABEL = 18;
const N_BAR = 16;
const N_GUT = 22;
const COL_GAP = 16;
const PLOT_GAP = 18;
const SEG_GAP = 2;
const R_END = 4;

const STEP_MS = 480;
const STAGGER_MS = 110;
const LOSS_MS = 320;
const VAL_TAU = 0.14;

const defaultFormatValue = (v: number) => formatNumber(v, 0);
const defaultFormatRate = (r: number) => formatPercent(r, 1);
const formatPP = (d: number) => `${formatSigned(d * 100, (n) => formatNumber(n, 1))} pp`;

interface Row {
  id: string;
  label: string;
  value: number;
  /** Fraction of the previous step that reached this one. null for the first step or an empty previous step. */
  conv: number | null;
  /** Fraction of the first step. */
  overall: number | null;
  lost: number;
  prev: number | null;
  prevConv: number | null;
  prevOverall: number | null;
}

const count = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0);

function buildRows(steps: FunnelStep[], previous: FunnelChartProps["previous"]): Row[] {
  const out: Row[] = [];
  const first = steps.length ? count(steps[0].value) : 0;
  const prevOf = (id: string) => (previous && id in previous ? count(previous[id]) : null);
  const firstPrev = steps.length ? prevOf(steps[0].id) : null;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const v = count(s.value);
    const before = i > 0 ? out[i - 1].value : null;
    const prev = prevOf(s.id);
    const prevBefore = i > 0 ? out[i - 1].prev : null;
    out.push({
      id: s.id,
      label: s.label,
      value: v,
      conv: before !== null && before > 0 ? v / before : null,
      overall: first > 0 ? v / first : null,
      lost: before !== null ? Math.max(0, before - v) : 0,
      prev,
      prevConv: prev !== null && prevBefore !== null && prevBefore > 0 ? prev / prevBefore : null,
      prevOverall: prev !== null && firstPrev ? prev / firstPrev : null,
    });
  }
  return out;
}

// The step with the largest relative drop (lowest step conversion), if anything was lost at all.
function worstStep(rows: Row[]): number {
  let at = -1;
  let lo = 1;
  for (let i = 1; i < rows.length; i++) {
    const c = rows[i].conv;
    if (c !== null && c < lo) {
      lo = c;
      at = i;
    }
  }
  return at;
}

// Horizontal bar: square baseline on the left, rounded data end on the right.
function hBarPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (w <= 0 || h <= 0) return;
  const rr = Math.min(r, w, h / 2);
  ctx.moveTo(x, y);
  ctx.lineTo(x + w - rr, y);
  if (rr) ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  if (rr) ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

interface Layout {
  narrow: boolean;
  plotL: number;
  plotR: number;
  labelW: number;
  labelH: number;
  barH: number;
  gutH: number;
  countR: number;
  n: number;
}

interface Run {
  enter: number;
  dv: number[];
  dp: number[];
  dmax: number;
  ready: boolean;
  hover: number | null;
  source: "pointer" | "keyboard" | "prop" | null;
  lay: Layout;
}

const rowTop = (L: Layout, i: number) => HEADER_H + i * (L.labelH + L.barH + L.gutH);
const barTop = (L: Layout, i: number) => rowTop(L, i) + L.labelH;
const barBottom = (L: Layout, i: number) => barTop(L, i) + L.barH;

export function FunnelChart({
  steps,
  previous = null,
  previousLabel = "Previous period",
  valueLabel = "Count",
  formatValue = defaultFormatValue,
  formatRate = defaultFormatRate,
  highlightWorst = true,
  worstLabel = "Biggest drop",
  activeId,
  height: heightProp,
  ariaLabel = "Conversion funnel",
  tone: toneProp,
  className,
}: FunnelChartProps) {
  const { pal, reduce, vars } = useChartTheme(toneProp);
  const announcer = useRef<AnnouncerHandle>(null);
  const tipRef = useRef<TooltipHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const nameRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const countRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const pctRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const gutRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const hCountRef = useRef<HTMLSpanElement>(null);
  const hPctRef = useRef<HTMLSpanElement>(null);
  const rectRef = useRef<DOMRect | null>(null);
  // Measured text widths, so gutters are budgeted from the real labels rather than guessed.
  const meas = useRef({ label: 0, count: 0, pct: 0, hCount: 0, hPct: 0, gut: [] as number[] });

  const rows = useMemo(() => buildRows(steps, previous), [steps, previous]);
  const hasPrev = rows.some((r) => r.prev !== null);
  const worst = highlightWorst ? worstStep(rows) : -1;
  const n = rows.length;

  const cfg = useRef({ rows, worst, reduce, pal });
  useEffect(() => {
    cfg.current = { rows, worst, reduce, pal };
  });

  const st = useRef<Run>({
    enter: 0,
    dv: [],
    dp: [],
    dmax: 1,
    ready: false,
    hover: null,
    source: null,
    lay: { narrow: false, plotL: 0, plotR: 0, labelW: 0, labelH: 0, barH: W_BAR, gutH: W_GUT, countR: 0, n: 0 },
  });

  const { rootRef, hostRef, canvasRef, size, wake } = useChartCanvas(({ ctx, w, h, dt }) => {
    const s = st.current;
    const c = cfg.current;
    const p = c.pal;
    const R = c.rows;
    const N = R.length;
    const m = meas.current;

    // --- Layout -----------------------------------------------------------------------------
    const narrow = w < NARROW;
    const countW = Math.max(m.count, narrow ? 0 : m.hCount);
    const pctW = Math.max(m.pct, narrow ? 0 : m.hPct);
    const labelH = narrow ? N_LABEL : 0;
    const bar0 = narrow ? N_BAR : W_BAR;
    const gut0 = narrow ? N_GUT : W_GUT;
    // Bars and gutters stretch (0.7x to 1.5x) to fill a fixed height; label lines never do.
    const flex = N * bar0 + Math.max(0, N - 1) * gut0;
    const k = flex > 0 ? clamp((h - HEADER_H - PAD_B - N * labelH) / flex, 0.7, 1.5) : 1;
    const L: Layout = { narrow, plotL: 0, plotR: w, labelW: 0, labelH, barH: bar0 * k, gutH: gut0 * k, countR: 0, n: N };
    if (narrow) {
      L.countR = w - pctW - 10;
      L.labelW = Math.max(40, L.countR - countW - 12);
    } else {
      L.labelW = Math.min(Math.max(m.label, 40), clamp(w * 0.26, 90, 200));
      L.plotL = L.labelW + 14;
      L.plotR = Math.max(L.plotL + 60, w - pctW - COL_GAP - countW - PLOT_GAP);
      L.countR = L.plotR + PLOT_GAP + countW;
    }
    s.lay = L;

    // --- Values (damped) and domain ------------------------------------------------------------
    let moving = false;
    let max = 0;
    for (let i = 0; i < N; i++) {
      const tv = R[i].value;
      const tp = R[i].prev ?? 0;
      max = Math.max(max, tv, tp);
      if (!s.ready || c.reduce) {
        s.dv[i] = tv;
        s.dp[i] = tp;
        continue;
      }
      // Steps added after mount grow in from zero.
      if (s.dv[i] === undefined) s.dv[i] = 0;
      if (s.dp[i] === undefined) s.dp[i] = tp;
      s.dv[i] = damp(s.dv[i], tv, VAL_TAU, dt);
      s.dp[i] = damp(s.dp[i], tp, VAL_TAU, dt);
      const tol = 1e-4 * Math.max(1, s.dmax);
      if (Math.abs(s.dv[i] - tv) + Math.abs(s.dp[i] - tp) > tol) moving = true;
    }
    s.dv.length = N;
    s.dp.length = N;
    if (!(max > 0)) max = 1;
    if (!s.ready || c.reduce) s.dmax = max;
    else {
      s.dmax = damp(s.dmax, max, VAL_TAU, dt);
      if (Math.abs(s.dmax - max) > 1e-4 * max) moving = true;
    }
    s.ready = true;
    const span = Math.max(1, L.plotR - L.plotL);
    const xOf = (v: number) => L.plotL + (v / s.dmax) * span;

    // --- Entrance: each bar grows in turn, then its loss runs out to the previous bar's end ------
    const total = Math.max(0, N - 1) * STAGGER_MS + STEP_MS + LOSS_MS;
    s.enter = c.reduce ? 1 : Math.min(1, s.enter + (dt * 1000) / total);
    const ms = s.enter * total;
    const growOf = (i: number) => (s.enter >= 1 ? 1 : easeOut(clamp((ms - i * STAGGER_MS) / STEP_MS, 0, 1)));
    const lossOf = (i: number) => (s.enter >= 1 ? 1 : easeOut(clamp((ms - i * STAGGER_MS - STEP_MS * 0.6) / LOSS_MS, 0, 1)));

    // Focused step band, including the gutter above it (the drop into it).
    if (s.hover !== null && s.hover < N) {
      const i = s.hover;
      const y0 = i > 0 ? barBottom(L, i - 1) + 3 : rowTop(L, 0) - 4;
      const y1 = barBottom(L, i) + 4;
      ctx.fillStyle = withAlpha(p.text, 0.045);
      ctx.beginPath();
      ctx.roundRect(narrow ? -4 : 0, y0, narrow ? w + 8 : w, y1 - y0, 6);
      ctx.fill();
    }

    const barFill = withAlpha(p.text, 0.5);
    const barFillHot = withAlpha(p.text, 0.72);
    const lossHatch = hatchPattern(ctx, withAlpha(p.text, 0.34), 4, 1);
    const worstHatch = hatchPattern(ctx, withAlpha(p.accent, 0.85), 4, 1);

    for (let i = 0; i < N; i++) {
      const g = growOf(i);
      const hov = s.hover === i;
      const dim = s.hover !== null && !hov ? 0.5 : 1;
      const isWorst = i === c.worst;
      const yT = barTop(L, i);
      const bh = L.barH;
      const v = s.dv[i] * g;
      const xEnd = xOf(v);

      ctx.globalAlpha = dim;
      if (v > 0) {
        ctx.beginPath();
        hBarPath(ctx, L.plotL, yT, Math.max(1, xEnd - L.plotL), bh, R_END);
        ctx.fillStyle = hov ? barFillHot : barFill;
        ctx.fill();
      }

      // The lost share: a hatched continuation of the previous bar, 2px clear of this one.
      if (i > 0) {
        const lg = lossOf(i);
        const before = s.dv[i - 1];
        const lx0 = xEnd + (v > 0 ? SEG_GAP : 0);
        const lx1 = xOf(s.dv[i] + Math.max(0, before - s.dv[i]) * lg);
        if (lg > 0 && lx1 - lx0 > 1) {
          ctx.beginPath();
          hBarPath(ctx, lx0 + 0.5, yT + 0.5, lx1 - lx0 - 1, bh - 1, R_END);
          ctx.fillStyle = isWorst ? withAlpha(p.accent, hov ? 0.16 : 0.1) : withAlpha(p.text, 0.035);
          ctx.fill();
          const hp = isWorst ? worstHatch : lossHatch;
          if (hp) {
            ctx.fillStyle = hp;
            ctx.fill();
          }
          ctx.lineWidth = 1;
          ctx.strokeStyle = isWorst ? withAlpha(p.accent, hov ? 1 : 0.85) : withAlpha(p.text, hov ? 0.42 : 0.26);
          ctx.stroke();
        }
      }

      // Comparison period: a ghost tick at the previous count, haloed so it reads on or off the bar.
      if (R[i].prev !== null && g > 0) {
        const px = Math.round(xOf(s.dp[i] * g)) + 0.5;
        ctx.globalAlpha = dim * Math.min(1, g * 1.5);
        ctx.lineCap = "round";
        ctx.strokeStyle = p.stage;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(px, yT - 3);
        ctx.lineTo(px, yT + bh + 3);
        ctx.stroke();
        ctx.strokeStyle = withAlpha(p.text, 0.88);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.lineCap = "butt";
      }
      ctx.globalAlpha = 1;

      // DOM labels.
      const nm = nameRefs.current[i];
      if (nm) {
        nm.style.opacity = String(Math.min(1, g * 2) * dim);
        nm.style.maxWidth = `${L.labelW.toFixed(0)}px`;
        if (narrow) {
          nm.style.textAlign = "left";
          nm.style.transform = `translate3d(0px, ${(rowTop(L, i) + labelH / 2 - 1).toFixed(1)}px, 0) translate(0, -50%)`;
        } else {
          nm.style.textAlign = "right";
          nm.style.transform = `translate3d(${L.labelW.toFixed(1)}px, ${(yT + bh / 2).toFixed(1)}px, 0) translate(-100%, -50%)`;
        }
      }
      const yVal = narrow ? rowTop(L, i) + labelH / 2 - 1 : yT + bh / 2;
      const vo = String(clamp((g - 0.4) / 0.6, 0, 1) * dim);
      const cn_ = countRefs.current[i];
      if (cn_) {
        cn_.style.opacity = vo;
        cn_.style.transform = `translate3d(${L.countR.toFixed(1)}px, ${yVal.toFixed(1)}px, 0) translate(-100%, -50%)`;
      }
      const pc = pctRefs.current[i];
      if (pc) {
        pc.style.opacity = vo;
        pc.style.transform = `translate3d(${w.toFixed(1)}px, ${yVal.toFixed(1)}px, 0) translate(-100%, -50%)`;
      }
      const gu = gutRefs.current[i];
      if (gu && i > 0) {
        const gy = (barBottom(L, i - 1) + rowTop(L, i)) / 2;
        gu.style.opacity = String(lossOf(i) * (s.hover !== null && !hov ? 0.5 : 1));
        gu.style.maxWidth = `${(w - (narrow ? 0 : L.plotL + 8)).toFixed(0)}px`;
        gu.style.transform = `translate3d(${(narrow ? 0 : L.plotL + 8).toFixed(1)}px, ${gy.toFixed(1)}px, 0) translate(0, -50%)`;
      }
    }

    // The shared zero baseline.
    if (N && !narrow) {
      ctx.strokeStyle = p.textFaint;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(crisp(L.plotL) - 1, barTop(L, 0) - 4);
      ctx.lineTo(crisp(L.plotL) - 1, barBottom(L, N - 1) + 4);
      ctx.stroke();
    }

    // Column headers (wide only; narrow rows carry their numbers on the label line).
    const hc = hCountRef.current;
    if (hc) {
      hc.style.opacity = narrow || !N ? "0" : "1";
      hc.style.transform = `translate3d(${L.countR.toFixed(1)}px, 0, 0) translate(-100%, 0)`;
    }
    const hp = hPctRef.current;
    if (hp) hp.style.opacity = narrow || !N ? "0" : "1";

    // Tooltip: beside the focused step, in the clear space right of whatever rows it overlaps.
    const tip = tipRef.current;
    if (tip?.el && s.hover !== null && s.hover < N) {
      const i = s.hover;
      const { w: tw, h: th } = tip.size;
      const limit = narrow ? w : L.plotR;
      const extentIn = (y0: number, y1: number) => {
        let e = L.plotL;
        for (let j = 0; j < N; j++) {
          const top = rowTop(L, j);
          if (top <= y1 && barBottom(L, j) >= y0) {
            const reach = Math.max(s.dv[j], j > 0 ? s.dv[j - 1] : 0, R[j].prev !== null ? s.dp[j] : 0);
            e = Math.max(e, xOf(reach));
            if (narrow) e = w; // the label line spans the row
          }
          if (j > 0) {
            const gy0 = barBottom(L, j - 1);
            if (gy0 <= y1 && top >= y0) e = Math.max(e, (narrow ? 0 : L.plotL + 8) + (m.gut[j] ?? 0));
          }
        }
        return e;
      };
      const downY = clamp(barTop(L, i) - 4, 0, Math.max(0, h - th));
      const upY = clamp(barBottom(L, i) + 4 - th, 0, Math.max(0, h - th));
      // Then fully below or above the step, so its own bar and loss stay uncovered.
      const belowY = clamp(barBottom(L, i) + 6, 0, Math.max(0, h - th));
      const aboveY = clamp(barTop(L, i) - 6 - th, 0, Math.max(0, h - th));
      let pos: { x: number; y: number } | null = null;
      for (const y of [downY, upY, belowY, aboveY]) {
        const x = extentIn(y, y + th) + 12;
        if (x + tw <= limit) {
          pos = { x: Math.round(x), y: Math.round(y) };
          break;
        }
      }
      if (!pos) pos = placeTooltip(xOf(s.dv[i]), barTop(L, i), tw, th, w, h, 10);
      tip.el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
    }

    return moving || s.enter < 1;
  });

  // Measure the text the layout budgets for. Runs before paint and again once web fonts settle.
  useLayoutEffect(() => {
    const measure = () => {
      const max = (els: (HTMLElement | null)[], f: (el: HTMLElement) => number) => els.slice(0, n).reduce((a, el) => (el ? Math.max(a, f(el)) : a), 0);
      meas.current = {
        label: Math.ceil(max(nameRefs.current, (el) => el.scrollWidth)),
        count: Math.ceil(max(countRefs.current, (el) => el.offsetWidth)),
        pct: Math.ceil(max(pctRefs.current, (el) => el.offsetWidth)),
        hCount: hCountRef.current?.offsetWidth ?? 0,
        hPct: hPctRef.current?.offsetWidth ?? 0,
        gut: gutRefs.current.slice(0, n).map((el) => (el ? el.scrollWidth : 0)),
      };
      wake();
    };
    measure();
    let live = true;
    document.fonts?.ready.then(() => {
      if (live) measure();
    });
    return () => {
      live = false;
    };
  }, [rows, n, formatValue, formatRate, valueLabel, worst, wake]);

  const tooltipFor = (i: number): TooltipContent | null => {
    const r = rows[i];
    if (!r) return null;
    const out: TooltipRow[] = [{ key: "v", label: valueLabel, value: formatValue(r.value), color: withAlpha(pal.text, 0.6) }];
    if (i > 0) {
      out.push({ key: "c", label: "Of previous step", value: r.conv !== null ? formatRate(r.conv) : "–" });
      out.push({ key: "o", label: "Of first step", value: r.overall !== null ? formatRate(r.overall) : "–" });
      out.push({ key: "l", label: "Lost", value: r.lost > 0 ? `−${formatValue(r.lost)}` : formatValue(0), strong: false, color: i === worst ? pal.accent : undefined });
    }
    if (r.prev !== null) {
      out.push({ key: "p", label: previousLabel, value: formatValue(r.prev), strong: false });
      if (r.conv !== null && r.prevConv !== null) out.push({ key: "dc", label: "Step change", value: formatPP(r.conv - r.prevConv), strong: false });
      if (i > 0 && r.overall !== null && r.prevOverall !== null) out.push({ key: "do", label: "Overall change", value: formatPP(r.overall - r.prevOverall), strong: false });
    }
    return {
      key: `${r.id}|${r.value}|${r.prev}|${i === worst}|${pal.text}`,
      title: i === worst ? `${r.label} · ${worstLabel}` : r.label,
      rows: out,
    };
  };

  const describe = (i: number) => {
    const r = rows[i];
    let msg = `Step ${i + 1} of ${n}, ${r.label}: ${formatValue(r.value)}`;
    if (i > 0) msg += `, ${r.conv !== null ? formatRate(r.conv) : "no"} of the previous step, ${r.overall !== null ? formatRate(r.overall) : "none"} overall, ${formatValue(r.lost)} lost`;
    if (i === worst) msg += `. ${worstLabel}`;
    if (r.prev !== null) {
      msg += `. ${previousLabel} ${formatValue(r.prev)}`;
      if (r.conv !== null && r.prevConv !== null) msg += `, step conversion ${formatPP(r.conv - r.prevConv)}`;
    }
    return msg;
  };

  const setHover = (i: number | null, source: Run["source"]) => {
    const s = st.current;
    if (s.hover === i && s.source === source) return;
    s.hover = i;
    s.source = i === null ? null : source;
    tipRef.current?.set(i === null ? null : tooltipFor(i));
    if (i !== null && source === "keyboard") announcer.current?.say(describe(i));
    wake();
  };

  useEffect(() => {
    // Data or theme changed under a focused step: refresh its tooltip (the key carries the values).
    const s = st.current;
    if (s.hover !== null) {
      if (s.hover >= rows.length) setHover(null, null);
      else tipRef.current?.set(tooltipFor(s.hover));
    }
    wake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, worst, pal, reduce, wake]);

  useEffect(() => {
    if (activeId === undefined) return;
    const i = rows.findIndex((r) => r.id === activeId);
    setHover(i >= 0 ? i : null, i >= 0 ? "prop" : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, rows]);

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const rect = rectRef.current ?? wrapperRef.current?.getBoundingClientRect();
    if (!rect || !n) return;
    const L = st.current.lay;
    const y = e.clientY - rect.top;
    // Each step owns its bar, its label line and the gutter above it (the drop into it).
    if (y < rowTop(L, 0) - 4 || y > barBottom(L, n - 1) + 6) {
      setHover(null, null);
      return;
    }
    let i = 0;
    for (let j = 1; j < n; j++) if (y >= barBottom(L, j - 1) + 2) i = j;
    setHover(i, "pointer");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!n) return;
    const s = st.current;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const down = e.key === "ArrowDown";
      const next = s.hover === null ? (down ? 0 : n - 1) : clamp(s.hover + (down ? 1 : -1), 0, n - 1);
      setHover(next, "keyboard");
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setHover(e.key === "Home" ? 0 : n - 1, "keyboard");
    } else if (e.key === "Escape") setHover(null, null);
  };

  const tableCols = useMemo(
    () => ["Step", valueLabel, "Of previous step", "Of first step", "Lost", ...(hasPrev ? [previousLabel, "Step conversion change", "Overall change"] : [])],
    [valueLabel, hasPrev, previousLabel],
  );
  const tableRows = useMemo(
    () =>
      rows.map((r, i) => [
        i === worst ? `${r.label} (${worstLabel.toLowerCase()})` : r.label,
        formatValue(r.value),
        r.conv !== null ? formatRate(r.conv) : "–",
        r.overall !== null ? formatRate(r.overall) : "–",
        i > 0 ? formatValue(r.lost) : "–",
        ...(hasPrev
          ? [
              r.prev !== null ? formatValue(r.prev) : "–",
              r.conv !== null && r.prevConv !== null ? formatPP(r.conv - r.prevConv) : "–",
              i > 0 && r.overall !== null && r.prevOverall !== null ? formatPP(r.overall - r.prevOverall) : "–",
            ]
          : []),
      ]),
    [rows, worst, worstLabel, formatValue, formatRate, hasPrev],
  );

  // Natural height from the row count; the narrow layout adds a label line per step.
  const narrowNow = size.width > 0 && size.width < NARROW;
  const natural = n
    ? HEADER_H + n * (narrowNow ? N_LABEL + N_BAR : W_BAR) + (n - 1) * (narrowNow ? N_GUT : W_GUT) + PAD_B
    : HEADER_H + 64;
  const height = heightProp ?? natural;

  const last = rows[n - 1];
  const summary = n
    ? `${ariaLabel}: ${n} steps from ${rows[0].label} (${formatValue(rows[0].value)}) to ${last.label} (${formatValue(last.value)}), ${last.overall !== null ? formatRate(last.overall) : "none"} overall.${worst >= 0 ? ` ${worstLabel}: ${rows[worst].label}, ${formatRate(rows[worst].conv ?? 0)} of the previous step.` : ""}`
    : `${ariaLabel}: no steps`;

  const hatchKey = `repeating-linear-gradient(-45deg, var(--bjork-text-muted) 0 1px, transparent 1px 3.5px)`;

  return (
    <div ref={rootRef} data-loop="idle" className={cn("relative w-full select-none text-[color:var(--bjork-text)]", className)} style={{ ...vars, height }}>
      <div
        ref={wrapperRef}
        role="group"
        aria-roledescription="chart"
        aria-label={`${ariaLabel}. Up and down move between steps.`}
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
        className={cn("absolute inset-0 touch-pan-y rounded-[10px]", chartFocusRing)}
      >
        <div ref={hostRef} className="absolute inset-0">
          <canvas ref={canvasRef} role="img" aria-label={summary} className="pointer-events-none absolute left-0 top-0" />
        </div>

        {/* Legend: keys mirror the marks. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-[4px] flex items-center gap-x-4 font-bjork-alpha text-[11px] font-medium leading-3 text-[color:var(--bjork-text-medium)]"
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-r-[2px] bg-[color:var(--bjork-text-muted)]" />
            Reached
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-r-[2px] border border-[color:var(--bjork-text-faint)]" style={{ backgroundImage: hatchKey }} />
            Lost
          </span>
          {hasPrev && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span className="inline-block h-2.5 w-[1.5px] shrink-0 rounded-full bg-[color:var(--bjork-text)]" />
              <span className="truncate">{previousLabel}</span>
            </span>
          )}
        </div>
        <span
          ref={hCountRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-[6px] whitespace-nowrap font-mono text-[9px] uppercase leading-none tracking-[0.1em] text-[color:var(--bjork-text-soft)] opacity-0 [text-box:trim-both_cap_alphabetic]"
        >
          {valueLabel}
        </span>
        <span
          ref={hPctRef}
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-[6px] whitespace-nowrap font-mono text-[9px] uppercase leading-none tracking-[0.1em] text-[color:var(--bjork-text-soft)] opacity-0 [text-box:trim-both_cap_alphabetic]"
        >
          Overall
        </span>

        {rows.map((r, i) => (
          <span
            key={`n-${r.id}`}
            ref={(el) => {
              nameRefs.current[i] = el;
            }}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 truncate font-bjork-alpha text-[12px] font-medium leading-[14px] text-[color:var(--bjork-text-medium)] opacity-0"
          >
            {r.label}
          </span>
        ))}
        {rows.map((r, i) => (
          <span
            key={`c-${r.id}`}
            ref={(el) => {
              countRefs.current[i] = el;
            }}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 whitespace-nowrap text-right font-mono text-[12px] leading-none tabular-nums text-[color:var(--bjork-text)] opacity-0 [text-box:trim-both_cap_alphabetic]"
          >
            {formatValue(r.value)}
          </span>
        ))}
        {rows.map((r, i) => (
          <span
            key={`p-${r.id}`}
            ref={(el) => {
              pctRefs.current[i] = el;
            }}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 whitespace-nowrap text-right font-mono text-[11px] leading-none tabular-nums text-[color:var(--bjork-text-muted)] opacity-0 [text-box:trim-both_cap_alphabetic]"
          >
            {r.overall !== null ? formatRate(r.overall) : "–"}
          </span>
        ))}
        {rows.map((r, i) =>
          i === 0 ? null : (
            <span
              key={`g-${r.id}`}
              ref={(el) => {
                gutRefs.current[i] = el;
              }}
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-0 flex items-center gap-2 overflow-hidden whitespace-nowrap font-mono text-[10px] leading-none tabular-nums opacity-0 [text-box:trim-both_cap_alphabetic]"
            >
              <span className={i === worst ? "text-[color:var(--bjork-accent-ink)]" : "text-[color:var(--bjork-text-medium)]"}>
                ↓ {r.conv !== null ? formatRate(r.conv) : "–"}
              </span>
              {r.conv !== null && r.prevConv !== null && <span className="text-[color:var(--bjork-text-muted)]">{formatPP(r.conv - r.prevConv)}</span>}
              {i === worst && (
                <span className="font-bjork-alpha text-[11px] font-medium text-[color:var(--bjork-accent-ink)] [text-box:trim-both_cap_alphabetic]">{worstLabel}</span>
              )}
            </span>
          ),
        )}
        {!n && (
          <span className="pointer-events-none absolute inset-x-0 top-[46px] text-center font-bjork-alpha text-[12px] text-[color:var(--bjork-text-muted)]">No steps</span>
        )}
        <HoverTooltip ref={tipRef} onMeasure={wake} />
      </div>
      <ChartTable caption={ariaLabel} columns={tableCols} rows={tableRows} />
      <ChartAnnouncer ref={announcer} />
    </div>
  );
}
