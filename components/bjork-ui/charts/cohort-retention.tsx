"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useChartCanvas, easeOut, roundRectPath } from "@/components/bjork-ui/charts/_kit/canvas";
import {
  useChartTheme,
  chartFocusRing,
  ChartTable,
  HoverTooltip,
  ChartAnnouncer,
  type TooltipHandle,
  type AnnouncerHandle,
  type TooltipContent,
} from "@/components/bjork-ui/charts/_kit/chrome";
import { clamp, formatCompact, formatNumber, formatPercent, formatSigned, niceTicks } from "@/components/bjork-ui/charts/_kit/scale";
import { rampColor, rampInk } from "@/components/bjork-ui/charts/_kit/series";

export interface RetentionCohort {
  id: string;
  /** Row label, e.g. "Mar 2026". */
  label: string;
  /** Users who signed up in the cohort: the denominator for every period. */
  size: number;
  /**
   * One entry per period since signup, period 0 first. Read as active counts or as fractions of
   * `size`, depending on `valueType`. A shorter row is a cohort that hasn't reached the later periods
   * yet (the triangle). `null`, `undefined`, non-finite and negative entries are missing: drawn
   * empty, skipped by the average and by keyboard navigation, never treated as zero.
   */
  values: (number | null | undefined)[];
}

export interface CohortRetentionProps {
  cohorts: RetentionCohort[];
  /** How `values` are read: active user counts (default) or fractions of the cohort size (0.42). */
  valueType?: "count" | "fraction";
  /** What the cells print: retained percent (default) or active users. The All cohorts row always prints percent. */
  display?: "percent" | "count";
  /**
   * Retention range mapped onto the colour ramp, as fractions. Defaults to 0 up to the highest
   * retention at period 1 or later (rounded up to 5%), so period 0's 100% doesn't flatten the
   * scale; cells above the top of the domain take the strongest step.
   */
  domain?: [number, number];
  /** Period names: `short` for column headers ("M3"), `long` for the tooltip and table ("Month 3"). */
  formatPeriod?: (period: number, style: "short" | "long") => string;
  /** Caption over the period columns. */
  periodTitle?: string;
  /** Formats user counts (sizes, active users). */
  formatCount?: (v: number) => string;
  /** Label of the size-weighted average row. */
  averageLabel?: string;
  /** Posed hover: [row, period]. Row `cohorts.length` is the All cohorts row. */
  activeCell?: [number, number] | null;
  /** Row height in px. Ignored when `height` is set. */
  rowHeight?: number;
  /** Total height in px; rows fit into it (minimum 16px each). Default: grows with the cohorts. */
  height?: number;
  ariaLabel?: string;
  tone?: BjorkTone;
  className?: string;
}

const HEAD = 40;
const GAP = 2;
const AVG_GAP = 10;
const MIN_CELL = 32;
const MAX_CELL = 64;
const SCROLL_PAD = 16;
const LEGEND_GAP = 14;
const LEGEND_H = 24;
const RAMP_W = 112;
const ENTER_MS = 900;
const CELL_MS = 380;
const DIM = 0.42;
// Geist Mono at 10px advances 0.6em per glyph; a hair over to stay on the safe side.
const CHAR_W = 6.15;

const defaultFormatCount = (v: number) => (Math.abs(v) >= 10000 ? formatCompact(v, 1) : formatNumber(v, 0));
const defaultFormatPeriod = (p: number, style: "short" | "long") => (style === "long" ? `Period ${p}` : String(p));

interface Matrix {
  R: number;
  P: number;
  /** (R + 1) x P, row R is the average. NaN marks a missing cell. */
  rate: Float64Array;
  count: Float64Array;
  /** Per period: users and cohorts behind the average. */
  avgSize: Float64Array;
  avgN: Int32Array;
  totalSize: number;
  /** Highest retention at period >= 1 (falls back to period 0), NaN when there is none. */
  maxLater: number;
}

function buildMatrix(cohorts: RetentionCohort[], valueType: "count" | "fraction"): Matrix {
  const R = cohorts.length;
  let P = 0;
  for (const c of cohorts) P = Math.max(P, c.values.length);
  const rate = new Float64Array((R + 1) * P).fill(NaN);
  const count = new Float64Array((R + 1) * P).fill(NaN);
  const avgSize = new Float64Array(P);
  const avgN = new Int32Array(P);
  const sumCount = new Float64Array(P);
  let totalSize = 0;
  let maxLater = NaN;
  let maxFirst = NaN;
  for (let r = 0; r < R; r++) {
    const co = cohorts[r];
    const size = Number.isFinite(co.size) && co.size > 0 ? co.size : 0;
    totalSize += size;
    for (let c = 0; c < co.values.length; c++) {
      const v = co.values[c];
      if (v === null || v === undefined || !Number.isFinite(v) || v < 0 || !(size > 0)) continue;
      const rt = valueType === "count" ? v / size : v;
      const ct = valueType === "count" ? v : v * size;
      rate[r * P + c] = rt;
      count[r * P + c] = ct;
      avgSize[c] += size;
      avgN[c] += 1;
      sumCount[c] += ct;
      if (c >= 1) maxLater = Number.isNaN(maxLater) ? rt : Math.max(maxLater, rt);
      else maxFirst = Number.isNaN(maxFirst) ? rt : Math.max(maxFirst, rt);
    }
  }
  for (let c = 0; c < P; c++) {
    if (avgSize[c] > 0) {
      rate[R * P + c] = sumCount[c] / avgSize[c];
      count[R * P + c] = sumCount[c];
    }
  }
  return { R, P, rate, count, avgSize, avgN, totalSize, maxLater: Number.isNaN(maxLater) ? maxFirst : maxLater };
}

interface Layout {
  cellW: number;
  rowH: number;
  contentW: number;
  viewW: number;
  scrollable: boolean;
  avgTop: number;
  plotH: number;
  rootH: number;
  showValues: boolean;
  headerEvery: number;
}

interface Run {
  enter: number;
  hover: [number, number] | null;
  source: "pointer" | "keyboard" | "prop" | null;
}

// Style writes from the loop only when the value changes; a hover frame touches every value span.
const written = new WeakMap<HTMLElement, string>();
function putOpacity(el: HTMLElement, value: string) {
  if (written.get(el) === value) return;
  written.set(el, value);
  el.style.opacity = value;
}

// Width of an element that may mount after the chart (empty data first, cohorts later), so the
// observer attaches through a callback ref instead of a once-only effect.
function useMeasuredWidth(): [(el: HTMLDivElement | null) => void, number, { current: HTMLDivElement | null }] {
  const [width, setWidth] = useState(0);
  const elRef = useRef<HTMLDivElement | null>(null);
  const obs = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    obs.current?.disconnect();
    obs.current = null;
    elRef.current = el;
    if (!el || typeof ResizeObserver === "undefined") return;
    obs.current = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setWidth(Math.round(box.width));
    });
    obs.current.observe(el);
  }, []);
  useEffect(() => () => obs.current?.disconnect(), []);
  return [ref, width, elRef];
}

const rowTopOf = (r: number, R: number, L: Layout) => (r < R ? HEAD + r * L.rowH : L.avgTop);

export function CohortRetention({
  cohorts,
  valueType = "count",
  display = "percent",
  domain,
  formatPeriod = defaultFormatPeriod,
  periodTitle = "Periods since signup",
  formatCount = defaultFormatCount,
  averageLabel = "All cohorts",
  activeCell,
  rowHeight = 28,
  height,
  ariaLabel = "Cohort retention",
  tone: toneProp,
  className,
}: CohortRetentionProps) {
  const { tone, pal, reduce, vars } = useChartTheme(toneProp);
  const announcer = useRef<AnnouncerHandle>(null);
  const tipRef = useRef<TooltipHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const fadeLRef = useRef<HTMLDivElement>(null);
  const fadeRRef = useRef<HTMLDivElement>(null);
  const valueRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rowLabelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const colLabelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [gridBoxCallback, gridWidth, gridBoxRef] = useMeasuredWidth();

  const m = useMemo(() => buildMatrix(cohorts, valueType), [cohorts, valueType]);
  const { R, P } = m;

  const [d0, d1] = useMemo<[number, number]>(() => {
    if (domain && domain[1] > domain[0]) return domain;
    const top = Number.isFinite(m.maxLater) && m.maxLater > 0 ? Math.ceil(m.maxLater * 20 - 1e-9) / 20 : 1;
    return [0, top];
  }, [domain, m.maxLater]);

  // Per cell: fill, ink and printed text. Recomputed on data, tone or display changes, never on hover.
  const cells = useMemo(() => {
    const out: { r: number; c: number; i: number; fill: string; ink: "light" | "dark"; text: string }[] = [];
    for (let r = 0; r <= R; r++)
      for (let c = 0; c < P; c++) {
        const i = r * P + c;
        const rt = m.rate[i];
        if (Number.isNaN(rt)) continue;
        const t = (rt - d0) / Math.max(1e-9, d1 - d0);
        out.push({
          r,
          c,
          i,
          fill: rampColor(tone, t),
          ink: rampInk(tone, t),
          text: display === "count" && r < R ? formatCount(m.count[i]) : formatPercent(rt, 0),
        });
      }
    return out;
  }, [m, R, P, d0, d1, tone, display, formatCount]);
  const cellIndex = useMemo(() => {
    const map = new Int32Array((R + 1) * P).fill(-1);
    cells.forEach((cl, k) => (map[cl.i] = k));
    return map;
  }, [cells, R, P]);

  const L = useMemo<Layout>(() => {
    const viewW = gridWidth;
    const cellW = P ? clamp(Math.floor(viewW / P), MIN_CELL, MAX_CELL) : MIN_CELL;
    const contentW = cellW * P;
    const scrollable = viewW > 0 && contentW > viewW + 1;
    const pad = scrollable ? SCROLL_PAD : 0;
    const rowH = height ? Math.max(16, Math.floor((height - HEAD - AVG_GAP - pad - LEGEND_GAP - LEGEND_H) / (R + 1))) : rowHeight;
    const avgTop = HEAD + R * rowH + AVG_GAP;
    const plotH = avgTop + rowH + pad;
    let maxChars = 0;
    for (const cl of cells) maxChars = Math.max(maxChars, cl.text.length);
    let maxHead = 0;
    for (let c = 0; c < P; c++) maxHead = Math.max(maxHead, formatPeriod(c, "short").length);
    return {
      cellW,
      rowH,
      contentW,
      viewW,
      scrollable,
      avgTop,
      plotH,
      rootH: plotH + LEGEND_GAP + LEGEND_H,
      showValues: rowH >= 18 && maxChars * CHAR_W + 4 <= cellW - GAP,
      headerEvery: maxHead * CHAR_W + 6 <= cellW ? 1 : 2,
    };
  }, [gridWidth, P, R, height, rowHeight, cells, formatPeriod]);

  const cfg = useRef({ m, L, cells, reduce, pal });
  useEffect(() => {
    cfg.current = { m, L, cells, reduce, pal };
  });

  const st = useRef<Run>({ enter: 0, hover: null, source: null });

  const { rootRef, hostRef, canvasRef, wake } = useChartCanvas(({ ctx, dt }) => {
    const s = st.current;
    const c = cfg.current;
    const p = c.pal;
    const { R: nR, P: nP } = c.m;
    const G = c.L;
    if (!nP || !G.viewW) return false;

    s.enter = c.reduce ? 1 : Math.min(1, s.enter + (dt * 1000) / ENTER_MS);
    const ms = s.enter * ENTER_MS;
    const span = Math.max(1, nR + nP - 1);
    // Diagonal wipe from the oldest cohort's period 0 toward the newest corner.
    const growOf = (r: number, col: number) => (s.enter >= 1 ? 1 : easeOut(clamp((ms - ((r + col) / span) * (ENTER_MS - CELL_MS)) / CELL_MS, 0, 1)));

    const hov = s.hover;
    const half = Math.min(G.cellW, G.rowH) / 2 - 1;
    const radius = Math.min(3, G.rowH / 6);
    for (let k = 0; k < c.cells.length; k++) {
      const cl = c.cells[k];
      const g = growOf(cl.r, cl.c);
      const isHov = !!hov && hov[0] === cl.r && hov[1] === cl.c;
      const dim = hov && hov[0] !== cl.r && hov[1] !== cl.c ? DIM : 1;
      const el = valueRefs.current[k];
      if (el) putOpacity(el, G.showValues ? String(+(clamp((g - 0.6) / 0.4, 0, 1) * dim).toFixed(3)) : "0");
      if (g <= 0) continue;
      const x = cl.c * G.cellW;
      const y = rowTopOf(cl.r, nR, G);
      const inset = GAP / 2 + (1 - g) * half;
      ctx.globalAlpha = dim;
      ctx.beginPath();
      roundRectPath(ctx, x + inset, y + inset, G.cellW - inset * 2, G.rowH - inset * 2, radius, radius);
      ctx.fillStyle = cl.fill;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (isHov) {
        ctx.beginPath();
        roundRectPath(ctx, x + inset + 0.75, y + inset + 0.75, G.cellW - inset * 2 - 1.5, G.rowH - inset * 2 - 1.5, radius, radius);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = p.text;
        ctx.stroke();
      }
    }

    const tip = tipRef.current;
    const box = gridBoxRef.current;
    const wrap = wrapperRef.current;
    if (tip?.el && hov && box && wrap) {
      const scrollX = scrollerRef.current?.scrollLeft ?? 0;
      const W = wrap.clientWidth;
      const H = G.rootH;
      const left = box.offsetLeft;
      const x0 = clamp(left + hov[1] * G.cellW - scrollX, left, left + G.viewW - G.cellW);
      const x1 = x0 + G.cellW;
      const y0 = rowTopOf(hov[0], nR, G);
      const y1 = y0 + G.rowH;
      const tw = tip.size.w;
      const th = tip.size.h;
      // Beside the cell, top-aligned: right of it the triangle is usually empty.
      let tx = x1 + 8;
      let ty = y0;
      if (tx + tw > W) tx = x0 - 8 - tw;
      if (tx < 0) {
        // No room either side: centre it and move off the cell's row.
        tx = clamp((x0 + x1) / 2 - tw / 2, 0, Math.max(0, W - tw));
        ty = y1 + 8;
        if (ty + th > H) ty = y0 - 8 - th;
      }
      ty = clamp(ty, 0, Math.max(0, H - th));
      tip.el.style.transform = `translate3d(${Math.round(tx)}px, ${Math.round(ty)}px, 0)`;
    }
    return s.enter < 1;
  });

  // A new data set wipes in again; display or tone changes only repaint.
  const dataKey = `${cohorts.map((c) => c.id).join("|")}#${P}`;
  useEffect(() => {
    if (!reduce) st.current.enter = 0;
    wake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);
  useEffect(() => {
    wake();
  }, [cells, L, pal, reduce, wake]);

  const syncFades = () => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const l = sc.scrollLeft > 1;
    const r = sc.scrollLeft + sc.clientWidth < sc.scrollWidth - 1;
    if (fadeLRef.current) fadeLRef.current.style.opacity = l ? "1" : "0";
    if (fadeRRef.current) fadeRRef.current.style.opacity = r ? "1" : "0";
  };
  useEffect(syncFades, [L]);

  const cohortName = (r: number) => (r < R ? cohorts[r]?.label ?? "" : averageLabel);
  const rateDigits = (v: number) => formatPercent(v, 1);
  const ppOf = (r: number, c: number) => (m.rate[r * P + c] - m.rate[R * P + c]) * 100;

  const tooltipFor = (r: number, c: number): TooltipContent | null => {
    const i = r * P + c;
    const k = cellIndex[i];
    if (k < 0) return null;
    const rt = m.rate[i];
    const size = r < R ? cohorts[r].size : m.avgSize[c];
    return {
      key: `${r}|${c}|${pal.text}|${cells[k].fill}`,
      title: `${cohortName(r)} · ${formatPeriod(c, "long")}`,
      rows: [
        { key: "rate", label: "retained", value: rateDigits(rt), color: cells[k].fill },
        { key: "count", label: "active", value: `${formatCount(m.count[i])} of ${formatCount(size)}`, strong: false },
        r < R
          ? { key: "vs", label: `vs ${averageLabel.toLowerCase()}`, value: `${formatSigned(ppOf(r, c), (v) => formatNumber(v, 1))} pp`, strong: false }
          : { key: "n", label: m.avgN[c] === 1 ? "cohort" : "cohorts", value: String(m.avgN[c]), strong: false },
      ],
    };
  };

  const describe = (r: number, c: number) => {
    const i = r * P + c;
    const size = r < R ? cohorts[r].size : m.avgSize[c];
    const base = `${cohortName(r)}, ${formatPeriod(c, "long")}: ${rateDigits(m.rate[i])} retained, ${formatCount(m.count[i])} of ${formatCount(size)} users`;
    return r < R ? `${base}, ${formatSigned(ppOf(r, c), (v) => formatNumber(v, 1))} points vs ${averageLabel.toLowerCase()}` : `${base}, across ${m.avgN[c]} cohorts`;
  };

  const markLabels = (cell: [number, number] | null, on: boolean) => {
    if (!cell) return;
    const rEl = rowLabelRefs.current[cell[0]];
    if (rEl) rEl.dataset.on = on ? "1" : "0";
    const cEl = colLabelRefs.current[cell[1]];
    if (cEl) cEl.dataset.on = on ? "1" : "0";
  };

  const revealColumn = (c: number) => {
    const sc = scrollerRef.current;
    if (!sc || !L.scrollable) return;
    const x0 = c * L.cellW;
    const x1 = x0 + L.cellW;
    if (x0 < sc.scrollLeft) sc.scrollLeft = Math.max(0, x0 - L.cellW / 2);
    else if (x1 > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = x1 - sc.clientWidth + L.cellW / 2;
  };

  const setHover = (cell: [number, number] | null, source: Run["source"]) => {
    const s = st.current;
    const valid = cell && cell[0] >= 0 && cell[0] <= R && cell[1] >= 0 && cell[1] < P && cellIndex[cell[0] * P + cell[1]] >= 0 ? cell : null;
    const same = (!valid && !s.hover) || (valid && s.hover && valid[0] === s.hover[0] && valid[1] === s.hover[1]);
    s.source = valid ? source : null;
    if (same) return;
    markLabels(s.hover, false);
    s.hover = valid;
    markLabels(valid, true);
    tipRef.current?.set(valid ? tooltipFor(valid[0], valid[1]) : null);
    if (valid && source !== "pointer") revealColumn(valid[1]);
    if (valid && source === "keyboard") announcer.current?.say(describe(valid[0], valid[1]));
    wake();
  };

  useEffect(() => {
    if (activeCell === undefined) return;
    const prev = st.current.hover;
    // Re-post the pose when the tooltip content may have changed (tone, data).
    if (prev) {
      st.current.hover = null;
      markLabels(prev, false);
    }
    setHover(activeCell, activeCell ? "prop" : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCell?.[0], activeCell?.[1], m, pal, cells]);

  const has = (r: number, c: number) => r >= 0 && r <= R && c >= 0 && c < P && cellIndex[r * P + c] >= 0;

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const box = gridBoxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < 0 || x > Math.min(L.viewW, L.contentW)) {
      setHover(null, null);
      return;
    }
    const col = Math.floor((x + (scrollerRef.current?.scrollLeft ?? 0)) / L.cellW);
    let row = -1;
    if (y >= HEAD && y < HEAD + R * L.rowH) row = Math.floor((y - HEAD) / L.rowH);
    else if (y >= L.avgTop && y < L.avgTop + L.rowH) row = R;
    setHover(has(row, col) ? [row, col] : null, "pointer");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = st.current;
    if (e.key === "Escape") {
      setHover(null, null);
      return;
    }
    const keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"];
    if (!keys.includes(e.key) || !cells.length) return;
    e.preventDefault();
    if (!s.hover) {
      // Start on the oldest cohort's first period after signup.
      const first = cells.find((cl) => cl.r === 0 && cl.c === 1) ?? cells[0];
      setHover([first.r, first.c], "keyboard");
      return;
    }
    let [r, c] = s.hover;
    const scan = (dr: number, dc: number) => {
      for (let rr = r + dr, cc = c + dc; rr >= 0 && rr <= R && cc >= 0 && cc < P; rr += dr, cc += dc) if (has(rr, cc)) return [rr, cc] as const;
      return null;
    };
    let next: readonly [number, number] | null = null;
    if (e.key === "ArrowRight") next = scan(0, 1);
    else if (e.key === "ArrowLeft") next = scan(0, -1);
    else if (e.key === "ArrowDown") next = scan(1, 0);
    else if (e.key === "ArrowUp") next = scan(-1, 0);
    else if (e.key === "Home" || e.key === "End") {
      // First or last reported period of this row.
      for (let k = 0; k < P; k++) {
        const cc = e.key === "Home" ? k : P - 1 - k;
        if (has(r, cc)) {
          next = [r, cc];
          break;
        }
      }
    } else {
      // PageUp / PageDown: oldest cohort or the average row in this column.
      for (let k = 0; k <= R; k++) {
        const rr = e.key === "PageUp" ? k : R - k;
        if (has(rr, c)) {
          next = [rr, c];
          break;
        }
      }
    }
    if (next) {
      [r, c] = next;
      setHover([r, c], "keyboard");
    } else announcer.current?.say(describe(r, c));
  };

  const tableCols = useMemo(() => ["Cohort", "Users", ...Array.from({ length: P }, (_, c) => formatPeriod(c, "long"))], [P, formatPeriod]);
  const tableRows = useMemo(
    () =>
      Array.from({ length: R + 1 }, (_, r) => [
        r < R ? cohorts[r].label : averageLabel,
        formatCount(r < R ? cohorts[r].size : m.totalSize),
        ...Array.from({ length: P }, (_, c) => {
          const i = r * P + c;
          return Number.isNaN(m.rate[i]) ? "no data" : `${formatPercent(m.rate[i], 1)} (${formatCount(m.count[i])})`;
        }),
      ]),
    [R, P, cohorts, averageLabel, formatCount, m],
  );

  const summary = useMemo(() => {
    if (!R || !P) return `${ariaLabel}: no cohorts`;
    const avg = (c: number) => m.rate[R * P + c];
    let last = -1;
    for (let c = P - 1; c >= 1; c--)
      if (!Number.isNaN(avg(c))) {
        last = c;
        break;
      }
    const parts = [`${ariaLabel}: ${R} cohorts over ${P} periods`];
    if (P > 1 && !Number.isNaN(avg(1))) parts.push(`${averageLabel.toLowerCase()} retain ${formatPercent(avg(1), 0)} at ${formatPeriod(1, "long").toLowerCase()}`);
    if (last > 1) parts.push(`${formatPercent(avg(last), 0)} at ${formatPeriod(last, "long").toLowerCase()}`);
    return parts.join(", ");
  }, [R, P, m, ariaLabel, averageLabel, formatPeriod]);

  // Ramp ticks: both ends plus the round values that keep clear of them.
  const ticks = useMemo(() => {
    const span = d1 - d0;
    return [d0, ...niceTicks(d0, d1, 3).filter((v) => v - d0 > span * 0.3 && d1 - v > span * 0.3), d1];
  }, [d0, d1]);
  const hasMissing = useMemo(() => {
    for (let i = 0; i < R * P; i++) if (Number.isNaN(m.rate[i])) return true;
    return false;
  }, [m, R, P]);
  const overflowTop = useMemo(() => {
    for (const cl of cells) if (m.rate[cl.i] > d1 + 1e-9) return true;
    return false;
  }, [cells, m, d1]);
  const rampCss = useMemo(() => `linear-gradient(90deg, ${[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => rampColor(tone, t)).join(", ")})`, [tone]);

  // Empty data keeps the whole tree mounted (hidden), so the canvas host stays observed and sizes
  // itself when cohorts arrive.
  const empty = !R || !P;

  const rowLabel = "flex shrink-0 items-center gap-3 rounded-[4px] transition-colors duration-100 data-[on=1]:text-[color:var(--bjork-text)]";

  return (
    <div
      ref={rootRef}
      data-loop="idle"
      className={cn("@container relative w-full select-none text-[color:var(--bjork-text)]", className)}
      style={{ ...vars, height: empty ? (height ?? 160) : L.rootH }}
    >
      {empty && (
        <div className="absolute inset-0 flex items-center justify-center font-bjork-alpha text-[12px] text-[color:var(--bjork-text-muted)]">No cohorts yet</div>
      )}
      <div
        ref={wrapperRef}
        role="group"
        aria-roledescription="chart"
        aria-label={`${ariaLabel}. Arrow keys move between cells, Home and End jump along a cohort, Page Up and Page Down along a period.`}
        tabIndex={empty ? -1 : 0}
        onPointerMove={onPointerMove}
        onPointerDown={(e) => {
          if (e.pointerType === "touch") onPointerMove(e);
        }}
        onPointerLeave={() => setHover(null, null)}
        onKeyDown={onKeyDown}
        aria-hidden={empty || undefined}
        className={cn("absolute inset-x-0 top-0 flex rounded-[10px]", empty && "invisible", L.scrollable ? "touch-pan-x touch-pan-y" : "touch-pan-y", chartFocusRing)}
        style={{ height: L.plotH }}
      >
        {/* Hairline above the average row, across both columns. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 h-px bg-[color:var(--bjork-hair)]" style={{ top: L.avgTop - AVG_GAP / 2 - 0.5 }} />

        {/* Sticky label column: it never scrolls; the periods scroll beside it when they don't fit. */}
        <div aria-hidden="true" className="relative flex min-w-0 max-w-[176px] shrink-0 flex-col pr-3 @max-[480px]:max-w-[112px] @max-[480px]:pr-2">
          <div className="flex shrink-0 items-end justify-between gap-3 pb-[8px] font-mono text-[10px] uppercase leading-none tracking-[0.08em] text-[color:var(--bjork-text-soft)]" style={{ height: HEAD }}>
            <span className="[text-box:trim-both_cap_alphabetic]">Cohort</span>
            <span className="[text-box:trim-both_cap_alphabetic]">Users</span>
          </div>
          {cohorts.map((co, r) => (
            <div
              key={co.id}
              ref={(el) => {
                rowLabelRefs.current[r] = el;
              }}
              data-on="0"
              className={cn(rowLabel, "text-[color:var(--bjork-text-muted)]")}
              style={{ height: L.rowH }}
            >
              <span className="min-w-0 truncate font-bjork-alpha text-[11px] font-medium leading-[13px]">{co.label}</span>
              <span className="ml-auto shrink-0 text-right font-mono text-[10px] leading-none tabular-nums [text-box:trim-both_cap_alphabetic]">{formatCount(co.size)}</span>
            </div>
          ))}
          <div className="shrink-0" style={{ height: AVG_GAP }} />
          <div
            ref={(el) => {
              rowLabelRefs.current[R] = el;
            }}
            data-on="0"
            className={cn(rowLabel, "text-[color:var(--bjork-text-medium)]")}
            style={{ height: L.rowH }}
          >
            <span className="min-w-0 truncate font-bjork-alpha text-[11px] font-semibold leading-[13px]">{averageLabel}</span>
            <span className="ml-auto shrink-0 text-right font-mono text-[10px] leading-none tabular-nums [text-box:trim-both_cap_alphabetic]">{formatCount(m.totalSize)}</span>
          </div>
        </div>

        <div ref={gridBoxCallback} className="relative min-w-0 flex-1">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-[6px] max-w-full truncate font-mono text-[10px] uppercase leading-none tracking-[0.08em] text-[color:var(--bjork-text-soft)] [text-box:trim-both_cap_alphabetic]"
          >
            {periodTitle}
          </span>
          <div
            ref={scrollerRef}
            onScroll={() => {
              syncFades();
              if (st.current.hover) wake();
            }}
            tabIndex={-1}
            className="absolute inset-0 overflow-x-auto overflow-y-hidden [scrollbar-width:thin]"
          >
            <div className="relative h-full" style={{ width: L.contentW }}>
              <div ref={hostRef} className="absolute left-0 top-0" style={{ width: L.contentW, height: L.avgTop + L.rowH }}>
                <canvas ref={canvasRef} role="img" aria-label={summary} className="pointer-events-none absolute left-0 top-0" />
              </div>
              {Array.from({ length: P }, (_, c) => (
                <span
                  key={`p${c}`}
                  ref={(el) => {
                    colLabelRefs.current[c] = el;
                  }}
                  data-on="0"
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute whitespace-nowrap font-mono text-[10px] leading-none tabular-nums text-[color:var(--bjork-text-muted)] transition-colors duration-100 [text-box:trim-both_cap_alphabetic] data-[on=1]:text-[color:var(--bjork-text)]",
                    c % L.headerEvery !== 0 && "opacity-0 data-[on=1]:opacity-100",
                  )}
                  style={{ left: c * L.cellW + L.cellW / 2, top: HEAD - 12, transform: "translate(-50%, -50%)" }}
                >
                  {formatPeriod(c, "short")}
                </span>
              ))}
              {cells.map((cl, k) => (
                <span
                  key={cl.i}
                  ref={(el) => {
                    valueRefs.current[k] = el;
                  }}
                  aria-hidden="true"
                  data-ink={cl.ink}
                  className="pointer-events-none absolute whitespace-nowrap font-mono text-[10px] leading-none tabular-nums opacity-0 [text-box:trim-both_cap_alphabetic] data-[ink=dark]:text-[rgba(23,23,23,0.84)] data-[ink=light]:text-[rgba(255,248,242,0.94)]"
                  style={{ left: cl.c * L.cellW + L.cellW / 2, top: rowTopOf(cl.r, R, L) + L.rowH / 2, transform: "translate(-50%, -50%)" }}
                >
                  {cl.text}
                </span>
              ))}
            </div>
          </div>
          <div
            ref={fadeLRef}
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 left-0 top-0 w-5 opacity-0 transition-opacity duration-150"
            style={{ background: "linear-gradient(90deg, var(--bjork-chart-bg), transparent)" }}
          />
          <div
            ref={fadeRRef}
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 right-0 top-0 w-6 opacity-0 transition-opacity duration-150"
            style={{ background: "linear-gradient(270deg, var(--bjork-chart-bg), transparent)" }}
          />
        </div>
        <HoverTooltip ref={tipRef} onMeasure={wake} />
      </div>

      {/* Footer: what a blank cell means, and the colour scale. */}
      <div
        aria-hidden="true"
        className={cn("pointer-events-none absolute inset-x-0 bottom-0 flex items-start justify-between gap-4 font-mono text-[10px] leading-none tabular-nums text-[color:var(--bjork-text-soft)]", empty && "invisible")}
        style={{ height: LEGEND_H }}
      >
        <span className={cn("flex min-w-0 items-center gap-1.5", !hasMissing && "invisible")}>
          <span className="inline-block size-2.5 shrink-0 rounded-[2px] border border-dashed border-[color:var(--bjork-border-strong)]" />
          <span className="truncate [text-box:trim-both_cap_alphabetic]">Blank: not reached yet</span>
        </span>
        <span className="flex shrink-0 items-start gap-2">
          <span className="pt-px [text-box:trim-both_cap_alphabetic]">Retained</span>
          <span className="relative block" style={{ width: RAMP_W }}>
            <span className="block h-[6px] rounded-full" style={{ background: rampCss }} />
            {ticks.map((v, k) => (
              <span
                key={v}
                className={cn(
                  "absolute top-[12px] whitespace-nowrap [text-box:trim-both_cap_alphabetic]",
                  k === 0 ? "translate-x-0" : k === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2",
                )}
                style={{ left: ((v - d0) / Math.max(1e-9, d1 - d0)) * RAMP_W }}
              >
                {formatPercent(v, 0)}
                {overflowTop && k === ticks.length - 1 ? "+" : ""}
              </span>
            ))}
          </span>
        </span>
      </div>

      <ChartTable caption={ariaLabel} columns={tableCols} rows={tableRows} />
      <ChartAnnouncer ref={announcer} />
    </div>
  );
}
