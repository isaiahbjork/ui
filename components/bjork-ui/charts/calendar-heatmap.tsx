"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useChartCanvas, easeOut, roundRectPath, writeLabels, type PlacedLabel } from "@/components/bjork-ui/charts/_kit/canvas";
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
import { clamp, formatNumber, formatDateUTC, mixColor, quantile, withAlpha } from "@/components/bjork-ui/charts/_kit/scale";
import { rampColor } from "@/components/bjork-ui/charts/_kit/series";

export interface CalendarDatum {
  /** A UTC calendar day: "YYYY-MM-DD", or a UTC timestamp in ms (floored to its UTC day). */
  date: string | number;
  /** Activity on that day. Repeated dates are summed. Negative values colour as zero. */
  value: number;
}

export interface CalendarHeatmapProps {
  data: CalendarDatum[];
  /** First day shown. Defaults to 364 days before `end`, so the span is a year. */
  start?: string | number;
  /** Last day shown. Defaults to the latest date in `data` (today, UTC, when empty). */
  end?: string | number;
  /** First row of each week column. */
  weekStart?: "monday" | "sunday";
  /** Colour steps including the zero step. Clamped to 3..7. */
  steps?: number;
  /**
   * How non-zero values map to steps. "quantile" splits the non-zero days into equal-count groups,
   * so a few huge days don't flatten everything else; "linear" splits 0..max evenly.
   */
  scale?: "quantile" | "linear";
  /** Unit names for the value, used in the summary, tooltip and table. */
  unit?: { one: string; other: string };
  formatValue?: (v: number) => string;
  /** Called with "YYYY-MM-DD" on click or Enter. */
  onSelect?: (date: string) => void;
  /** Posed hover, as "YYYY-MM-DD". */
  activeDate?: string | null;
  /** Smallest and largest cell edge in px. Below the smallest the grid scrolls inside the chart. */
  minCell?: number;
  maxCell?: number;
  /** Show the totals and streaks line above the grid. */
  summary?: boolean;
  /** Show the date range and the Less/More key below the grid. */
  legend?: boolean;
  ariaLabel?: string;
  tone?: BjorkTone;
  className?: string;
}

const DAY = 86400000;
const GUTTER_L = 28;
const MONTH_H = 20;
const GAP = 2;
const PAD_B = 3; // room for the hover ring under the last row
const RADIUS = 2;
const CELL_MS = 320;
const ENTER_SPAN_MS = 560;
const MONO_CHAR_W = 6.1; // 10px Geist Mono advance, for label collision budgets.
const FALLBACK_CELL = 12;

const defaultFormatValue = (v: number) => formatNumber(v, 1);
const DEFAULT_UNIT = { one: "event", other: "events" };

const monthLong = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const monthShort = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
const dayShort = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

// UTC day number (days since 1970-01-01) of a date string or timestamp. NaN when unparseable.
function toDay(d: string | number): number {
  if (typeof d === "number") return Number.isFinite(d) ? Math.floor(d / DAY) : NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (m) return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY);
  const t = Date.parse(d);
  return Number.isFinite(t) ? Math.floor(t / DAY) : NaN;
}

const isoOf = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
// 1970-01-01 was a Thursday; 0 = Sunday.
const dowOf = (day: number) => (((day + 4) % 7) + 7) % 7;

// Same day-of-month `k` months away, clamped to the target month's length.
function addMonths(day: number, k: number): number {
  const d = new Date(day * DAY);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + k;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Math.floor(Date.UTC(y, m, Math.min(d.getUTCDate(), last)) / DAY);
}

interface MonthMark {
  label: string;
  col: number;
  first: number; // index of its first in-range day
  days: number;
}

interface Model {
  start: number;
  nDays: number;
  /** Row of the first day; the grid starts `lead` days before `start`. */
  lead: number;
  nWeeks: number;
  values: Float64Array;
  level: Uint8Array;
  weekSum: Float64Array;
  levels: number;
  /** Upper bound of each non-zero step except the last. */
  bounds: number[];
  /** When there are fewer distinct values than steps, the value each step holds (NaN = unused). */
  exact: number[] | null;
  max: number;
  total: number;
  active: number;
  longest: number;
  current: number;
  peak: number; // index, -1 when no activity
  months: MonthMark[];
}

function buildModel(
  data: CalendarDatum[],
  startProp: CalendarHeatmapProps["start"],
  endProp: CalendarHeatmapProps["end"],
  weekStart: number,
  steps: number,
  scale: "quantile" | "linear",
): Model {
  const parsed: { day: number; value: number }[] = [];
  let latest = -Infinity;
  for (const d of data) {
    const day = toDay(d.date);
    if (!Number.isFinite(day) || !Number.isFinite(d.value)) continue;
    parsed.push({ day, value: d.value });
    if (day > latest) latest = day;
  }
  let end = endProp !== undefined ? toDay(endProp) : latest;
  if (!Number.isFinite(end)) end = Math.floor(Date.now() / DAY);
  let start = startProp !== undefined ? toDay(startProp) : end - 364;
  if (!Number.isFinite(start)) start = end - 364;
  if (start > end) [start, end] = [end, start];
  const nDays = end - start + 1;
  const values = new Float64Array(nDays);
  for (const p of parsed) if (p.day >= start && p.day <= end) values[p.day - start] += p.value;

  const lead = (dowOf(start) - weekStart + 7) % 7;
  const nWeeks = Math.ceil((nDays + lead) / 7);

  // Steps: level 0 is zero (or negative); 1..L-1 split the positive days.
  const L = clamp(Math.round(steps), 3, 7);
  const nz: number[] = [];
  let max = 0;
  let total = 0;
  for (let i = 0; i < nDays; i++) {
    total += values[i];
    if (values[i] > 0) {
      nz.push(values[i]);
      if (values[i] > max) max = values[i];
    }
  }
  nz.sort((a, b) => a - b);
  const bounds: number[] = [];
  const level = new Uint8Array(nDays);
  const distinct = Array.from(new Set(nz));
  let exact: number[] | null = null;
  if (scale === "quantile" && distinct.length > 0 && distinct.length < L - 1) {
    // Too few distinct values to fill the steps: rank them from the top so the largest is darkest.
    const off = L - distinct.length;
    for (let i = 0; i < nDays; i++) if (values[i] > 0) level[i] = off + distinct.indexOf(values[i]);
    exact = Array.from({ length: L }, (_, k) => (k >= off ? distinct[k - off] : NaN));
  } else if (nz.length) {
    for (let k = 1; k < L - 1; k++) bounds.push(scale === "linear" ? (max * k) / (L - 1) : quantile(nz, k / (L - 1)));
    for (let i = 0; i < nDays; i++) {
      const v = values[i];
      if (!(v > 0)) continue;
      let lv = 1;
      for (const b of bounds) if (v > b) lv++;
      level[i] = lv;
    }
  }

  const weekSum = new Float64Array(nWeeks);
  for (let i = 0; i < nDays; i++) weekSum[Math.floor((i + lead) / 7)] += values[i];

  let longest = 0;
  let run = 0;
  let peak = -1;
  for (let i = 0; i < nDays; i++) {
    if (values[i] > 0) {
      run++;
      if (run > longest) longest = run;
      if (peak < 0 || values[i] > values[peak]) peak = i;
    } else run = 0;
  }
  let current = 0;
  for (let i = nDays - 1; i >= 0 && values[i] > 0; i--) current++;

  const months: MonthMark[] = [];
  let i = 0;
  while (i < nDays) {
    const d = new Date((start + i) * DAY);
    const next = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / DAY);
    const days = Math.min(nDays, next - start) - i;
    const t = (start + i) * DAY;
    months.push({
      label: d.getUTCMonth() === 0 ? monthYear.format(t) : monthShort.format(t),
      col: Math.floor((i + lead) / 7),
      first: i,
      days,
    });
    i += days;
  }

  return { start, nDays, lead, nWeeks, values, level, weekSum, levels: L, bounds, exact, max, total, active: nz.length, longest, current, peak, months };
}

interface Layout {
  cell: number;
  pitch: number;
  gridW: number;
  viewW: number;
  x0: number;
  scroll: boolean;
  height: number;
}

// Integer cells that fit the width between `minCell` and `maxCell`; past the minimum the grid scrolls.
function layoutFor(width: number, nWeeks: number, minCell: number, maxCell: number): Layout {
  // 2px spare on the right keeps the hover ring of the last column inside the canvas.
  const viewW = Math.max(0, width - GUTTER_L - 2);
  const fit = width > 0 ? Math.floor((viewW + GAP) / Math.max(1, nWeeks) - GAP) : FALLBACK_CELL;
  const lo = Math.max(4, Math.round(minCell));
  const cell = clamp(fit, lo, Math.max(lo, Math.round(maxCell)));
  const pitch = cell + GAP;
  const gridW = nWeeks * pitch - GAP;
  return { cell, pitch, gridW, viewW, x0: GUTTER_L, scroll: width > 0 && gridW > viewW + 0.5, height: MONTH_H + 7 * pitch - GAP + PAD_B };
}

interface Run {
  enter: number;
  hover: number | null;
  source: "pointer" | "keyboard" | "prop" | null;
  scrollX: number;
  pinEnd: boolean;
  layout: Layout;
  monthCache: string[];
  monthItems: PlacedLabel[];
}

export function CalendarHeatmap({
  data,
  start,
  end,
  weekStart = "monday",
  steps = 5,
  scale = "quantile",
  unit = DEFAULT_UNIT,
  formatValue = defaultFormatValue,
  onSelect,
  activeDate,
  minCell = 7,
  maxCell = 16,
  summary = true,
  legend = true,
  ariaLabel = "Calendar heatmap",
  tone: toneProp,
  className,
}: CalendarHeatmapProps) {
  const { tone, pal, reduce, vars } = useChartTheme(toneProp);
  const announcer = useRef<AnnouncerHandle>(null);
  const tipRef = useRef<TooltipHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const monthPool = useRef<(HTMLSpanElement | null)[]>([]);
  const rectRef = useRef<DOMRect | null>(null);

  const ws = weekStart === "sunday" ? 0 : 1;
  const model = useMemo(() => buildModel(data, start, end, ws, steps, scale), [data, start, end, ws, steps, scale]);
  const unitOf = (v: number) => (v === 1 ? unit.one : unit.other);

  // Step colours: zero is a faint neutral, the rest climb the one-hue ramp from a visible first step.
  const colors = useMemo(() => {
    const out = [mixColor(pal.stage, pal.text, tone === "dark" ? 0.075 : 0.07)];
    for (let k = 1; k < model.levels; k++) out.push(rampColor(tone, 0.32 + (0.68 * (k - 1)) / Math.max(1, model.levels - 2)));
    return out;
  }, [pal, tone, model.levels]);

  const cfg = useRef({ model, colors, reduce, pal, minCell, maxCell });
  useEffect(() => {
    cfg.current = { model, colors, reduce, pal, minCell, maxCell };
  });

  const st = useRef<Run>({
    enter: 0,
    hover: null,
    source: null,
    scrollX: 0,
    pinEnd: true,
    layout: layoutFor(0, model.nWeeks, minCell, maxCell),
    monthCache: [],
    monthItems: [],
  });

  const { rootRef, hostRef, canvasRef, size, wake } = useChartCanvas(({ ctx, w, h, dt }) => {
    const s = st.current;
    const c = cfg.current;
    const M = c.model;
    const p = c.pal;
    const L = layoutFor(w, M.nWeeks, c.minCell, c.maxCell);
    s.layout = L;
    const maxScroll = Math.max(0, L.gridW - L.viewW);
    const sx = L.scroll ? clamp(s.scrollX, 0, maxScroll) : 0;
    const ox = L.x0 - sx;

    // Column stagger: the year sweeps in left to right.
    const stagger = Math.min(12, ENTER_SPAN_MS / Math.max(1, M.nWeeks));
    const total = (M.nWeeks - 1) * stagger + CELL_MS;
    s.enter = c.reduce ? 1 : Math.min(1, s.enter + (dt * 1000) / total);
    const ms = s.enter * total;
    const colProg = (col: number) => (s.enter >= 1 ? 1 : easeOut(clamp((ms - col * stagger) / CELL_MS, 0, 1)));

    ctx.save();
    ctx.beginPath();
    ctx.rect(L.x0 - 3, 0, L.viewW + 6, h);
    ctx.clip();

    const colA = Math.max(0, Math.floor(sx / L.pitch));
    const colB = Math.min(M.nWeeks - 1, Math.ceil((sx + L.viewW) / L.pitch));
    const iFrom = Math.max(0, colA * 7 - M.lead);
    const iTo = Math.min(M.nDays - 1, (colB + 1) * 7 - M.lead - 1);
    let lastFill = "";
    for (let i = iFrom; i <= iTo; i++) {
      const pos = i + M.lead;
      const col = (pos / 7) | 0;
      const row = pos - col * 7;
      const g = colProg(col);
      if (g <= 0) continue;
      const fill = c.colors[M.level[i]];
      if (fill !== lastFill) {
        ctx.fillStyle = fill;
        lastFill = fill;
      }
      const x = ox + col * L.pitch;
      const y = MONTH_H + row * L.pitch;
      if (g < 1) {
        const k = 0.45 + 0.55 * g;
        const e = L.cell * k;
        ctx.globalAlpha = g;
        ctx.beginPath();
        roundRectPath(ctx, x + (L.cell - e) / 2, y + (L.cell - e) / 2, e, e, RADIUS, RADIUS);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        ctx.beginPath();
        roundRectPath(ctx, x, y, L.cell, L.cell, RADIUS, RADIUS);
        ctx.fill();
      }
    }

    // Hover ring sits in the gap around the cell, so the cell's own colour stays readable.
    const hv = s.hover;
    if (hv !== null && hv < M.nDays) {
      const pos = hv + M.lead;
      const col = (pos / 7) | 0;
      const row = pos - col * 7;
      ctx.beginPath();
      roundRectPath(ctx, ox + col * L.pitch - 1.25, MONTH_H + row * L.pitch - 1.25, L.cell + 2.5, L.cell + 2.5, RADIUS + 1, RADIUS + 1);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = p.text;
      ctx.stroke();
    }

    // Edge fades say "more this way" when the grid scrolls.
    if (L.scroll) {
      const fadeW = 22;
      if (sx > 1) {
        const gr = ctx.createLinearGradient(L.x0 - 3, 0, L.x0 + fadeW, 0);
        gr.addColorStop(0, p.stage);
        gr.addColorStop(1, withAlpha(p.stage, 0));
        ctx.fillStyle = gr;
        ctx.fillRect(L.x0 - 3, 0, fadeW + 3, h);
      }
      if (sx < maxScroll - 1) {
        const xr = L.x0 + L.viewW;
        const gr = ctx.createLinearGradient(xr - fadeW, 0, xr + 3, 0);
        gr.addColorStop(0, withAlpha(p.stage, 0));
        gr.addColorStop(1, p.stage);
        ctx.fillStyle = gr;
        ctx.fillRect(xr - fadeW, 0, fadeW + 3, h);
      }
    }
    ctx.restore();

    // Month labels: at the column holding each month's first day. A partial first month gives way
    // to the next label; a label scrolled past the gutter sticks there until the next one pushes it.
    const items = s.monthItems;
    items.length = 0;
    const months = M.months;
    const right = L.x0 + L.viewW;
    const yLab = MONTH_H - 10;
    let prevEnd = -Infinity;
    for (let k = 0; k < months.length; k++) {
      const m = months[k];
      const lw = m.label.length * MONO_CHAR_W;
      const raw = ox + m.col * L.pitch;
      const next = k + 1 < months.length ? ox + months[k + 1].col * L.pitch : Infinity;
      let x = raw;
      let opacity = colProg(m.col);
      if (k === 0 && next - raw < lw + 8) opacity = 0;
      if (raw < L.x0) {
        x = Math.min(L.x0, next - lw - 8);
        if (x < L.x0) opacity *= clamp(1 - (L.x0 - x) / lw, 0, 1);
      }
      if (x + lw > right) x = right - lw;
      if (x < prevEnd + 6 || x + lw > right + 0.5) opacity = 0;
      if (opacity > 0) prevEnd = x + lw;
      items.push({ text: m.label, x, y: yLab, ax: 0, ay: -50, opacity });
    }
    writeLabels(monthPool.current, s.monthCache, items);

    const tip = tipRef.current;
    if (tip?.el && hv !== null && hv < M.nDays) {
      const pos = hv + M.lead;
      const col = (pos / 7) | 0;
      const row = pos - col * 7;
      const at = placeTooltip(ox + col * L.pitch + L.cell, MONTH_H + row * L.pitch, tip.size.w, tip.size.h, w, h, 8);
      tip.el.style.transform = `translate3d(${at.x}px, ${at.y}px, 0)`;
    }
    return s.enter < 1;
  });

  const layout = layoutFor(size.width, model.nWeeks, minCell, maxCell);

  const tooltipFor = (i: number): TooltipContent | null => {
    if (i < 0 || i >= model.nDays) return null;
    const v = model.values[i];
    const wk = model.weekSum[Math.floor((i + model.lead) / 7)];
    return {
      key: `${i}|${model.start}|${pal.text}|${v}`,
      title: formatDateUTC((model.start + i) * DAY, "full"),
      rows: [
        { key: "v", label: unitOf(v), value: formatValue(v), color: colors[model.level[i]] },
        { key: "w", label: "that week", value: formatValue(wk), strong: false },
      ],
    };
  };

  const ensureVisible = (i: number) => {
    const el = scrollerRef.current;
    const L = st.current.layout;
    if (!el || !L.scroll) return;
    const x = Math.floor((i + model.lead) / 7) * L.pitch;
    if (x < el.scrollLeft + L.pitch) el.scrollLeft = Math.max(0, x - L.pitch);
    else if (x + L.cell > el.scrollLeft + L.viewW - L.pitch) el.scrollLeft = x + L.cell - L.viewW + L.pitch;
    st.current.scrollX = el.scrollLeft;
  };

  const setHover = (i: number | null, source: Run["source"]) => {
    const s = st.current;
    if (s.hover === i && s.source === source) return;
    s.hover = i;
    s.source = i === null ? null : source;
    tipRef.current?.set(i === null ? null : tooltipFor(i));
    if (i !== null && source === "keyboard") {
      const v = model.values[i];
      announcer.current?.say(`${formatDateUTC((model.start + i) * DAY, "full")}: ${formatValue(v)} ${unitOf(v)}`);
    }
    wake();
  };

  // New data or layout replays the sweep and returns the view to the latest week.
  useEffect(() => {
    st.current.enter = 0;
    st.current.pinEnd = true;
    if (st.current.hover !== null && st.current.hover >= model.nDays) setHover(null, null);
    wake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, wake]);

  useEffect(() => {
    wake();
  }, [colors, pal, reduce, minCell, maxCell, wake]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (st.current.pinEnd) el.scrollLeft = el.scrollWidth;
    st.current.scrollX = el.scrollLeft;
    wake();
  }, [layout.gridW, layout.viewW, model, wake]);

  useEffect(() => {
    if (activeDate === undefined) return;
    const day = activeDate === null ? NaN : toDay(activeDate);
    const i = Number.isFinite(day) ? day - model.start : -1;
    const ok = i >= 0 && i < model.nDays;
    if (ok) ensureVisible(i);
    setHover(ok ? i : null, ok ? "prop" : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDate, model]);

  const hitTest = (clientX: number, clientY: number): number | null => {
    const rect = rectRef.current ?? wrapperRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const s = st.current;
    const L = s.layout;
    const lx = clientX - rect.left;
    const ly = clientY - rect.top - MONTH_H;
    if (lx < L.x0 || lx > L.x0 + L.viewW || ly < 0) return null;
    const gx = lx - L.x0 + (L.scroll ? s.scrollX : 0);
    // The whole pitch (cell plus gap) is the target, so the gaps never flicker the tooltip.
    const col = Math.floor(gx / L.pitch);
    const row = Math.floor(ly / L.pitch);
    if (row < 0 || row > 6 || col < 0 || col >= model.nWeeks) return null;
    const i = col * 7 + row - model.lead;
    return i >= 0 && i < model.nDays ? i : null;
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const i = hitTest(e.clientX, e.clientY);
    if (i === null) {
      if (st.current.source !== "prop") setHover(null, null);
      return;
    }
    setHover(i, "pointer");
  };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!onSelect) return;
    const i = hitTest(e.clientX, e.clientY);
    if (i !== null) onSelect(isoOf(model.start + i));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = st.current;
    const n = model.nDays;
    if (!n) return;
    const cur = s.hover !== null && s.source !== "prop" ? s.hover : null;
    let next: number | null = null;
    switch (e.key) {
      case "ArrowUp":
        next = cur === null ? n - 1 : cur - 1;
        break;
      case "ArrowDown":
        next = cur === null ? n - 1 : cur + 1;
        break;
      case "ArrowLeft":
        next = cur === null ? n - 1 : cur - 7 >= 0 ? cur - 7 : cur;
        break;
      case "ArrowRight":
        next = cur === null ? n - 1 : cur + 7 < n ? cur + 7 : cur;
        break;
      case "PageUp":
        next = cur === null ? n - 1 : addMonths(model.start + cur, -1) - model.start;
        break;
      case "PageDown":
        next = cur === null ? n - 1 : addMonths(model.start + cur, 1) - model.start;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = n - 1;
        break;
      case "Enter":
      case " ":
        if (cur !== null && onSelect) {
          e.preventDefault();
          onSelect(isoOf(model.start + cur));
        }
        return;
      case "Escape":
        if (s.hover === null) return;
        e.preventDefault();
        setHover(null, null);
        return;
      default:
        return;
    }
    e.preventDefault();
    const i = clamp(next, 0, n - 1);
    ensureVisible(i);
    setHover(i, "keyboard");
  };

  const fmtDay = (i: number) => dayShort.format((model.start + i) * DAY);

  // Table twin: one row per month with its daily values listed, rather than 365 rows. The months
  // keep the table navigable; the day list keeps every value reachable.
  const tableRows = useMemo(
    () =>
      model.months.map((m) => {
        let sum = 0;
        let act = 0;
        let pk = -1;
        const daily: string[] = [];
        for (let i = m.first; i < m.first + m.days; i++) {
          const v = model.values[i];
          sum += v;
          if (v > 0) act++;
          if (v > 0 && (pk < 0 || v > model.values[pk])) pk = i;
          daily.push(`${new Date((model.start + i) * DAY).getUTCDate()}: ${formatValue(v)}`);
        }
        return [
          monthLong.format((model.start + m.first) * DAY),
          formatValue(sum),
          `${act} of ${m.days}`,
          pk < 0 ? "None" : `${dayShort.format((model.start + pk) * DAY)}, ${formatValue(model.values[pk])}`,
          daily.join(", "),
        ];
      }),
    [model, formatValue],
  );
  const tableCols = useMemo(() => ["Month", `Total ${unit.other}`, "Active days", "Busiest day", "Daily values (day: value)"], [unit.other]);

  // Step ranges for the key's titles and screen readers.
  const stepLabels = useMemo(() => {
    const out = ["0"];
    const b = model.bounds;
    for (let k = 1; k < model.levels; k++) {
      if (!model.active || (model.exact && !Number.isFinite(model.exact[k]))) out.push("none");
      else if (model.exact) out.push(formatValue(model.exact[k]));
      else if (k === 1) out.push(`up to ${formatValue(b[0] ?? model.max)}`);
      else if (k === model.levels - 1) out.push(`over ${formatValue(b[k - 2] ?? 0)}`);
      else out.push(`${formatValue(b[k - 2])} to ${formatValue(b[k - 1])}`);
    }
    return out;
  }, [model, formatValue]);

  const rangeText = `${formatDateUTC(model.start * DAY, "full").replace(/^\w+, /, "")} – ${formatDateUTC((model.start + model.nDays - 1) * DAY, "full").replace(/^\w+, /, "")}`;
  const canvasLabel = model.active
    ? `${ariaLabel}: ${formatValue(model.total)} ${unitOf(model.total)} over ${model.nDays} days, ${model.active} active days, longest streak ${model.longest} days, busiest ${formatDateUTC((model.start + model.peak) * DAY, "full")} with ${formatValue(model.values[model.peak])}`
    : `${ariaLabel}: no activity over ${model.nDays} days`;
  const weekdayRows = [1, 3, 5].map((dow) => ({ dow, row: (dow - ws + 7) % 7, label: dow === 1 ? "Mon" : dow === 3 ? "Wed" : "Fri" }));
  const boxW = layout.x0 + Math.min(layout.gridW, layout.viewW || layout.gridW);

  return (
    <div ref={rootRef} data-loop="idle" className={cn("relative flex w-full min-w-0 select-none flex-col gap-3 text-[color:var(--bjork-text)]", className)} style={vars}>
      {summary && (
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2" style={{ paddingLeft: GUTTER_L }}>
          {model.active ? (
            <>
              <SummaryItem value={formatValue(model.total)} label={unitOf(model.total)} />
              <SummaryItem value={formatNumber(model.active, 0)} label={model.active === 1 ? "active day" : "active days"} />
              <SummaryItem value={`${model.longest}d`} label="longest streak" />
              <SummaryItem value={`${model.current}d`} label="current streak" />
              {model.peak >= 0 && <SummaryItem value={formatValue(model.values[model.peak])} label={`busiest, ${fmtDay(model.peak)}`} />}
            </>
          ) : (
            <span className="font-bjork-alpha text-[11px] text-[color:var(--bjork-text-muted)]">No activity in this range</span>
          )}
        </div>
      )}
      <div className="relative w-full" style={{ height: layout.height }}>
        <div
          ref={wrapperRef}
          role="group"
          aria-roledescription="chart"
          aria-label={`${ariaLabel}. Up and down move by day, left and right by week, Page Up and Page Down by month.${onSelect ? " Enter selects the day." : ""}`}
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
            // A touch tap fires leave right after up; keep the tapped day until the next tap.
            if (e.pointerType !== "touch" && st.current.source === "pointer") setHover(null, null);
          }}
          onClick={onClick}
          onBlur={() => setHover(null, null)}
          onKeyDown={onKeyDown}
          className={cn("absolute inset-0 touch-pan-y overflow-hidden rounded-[6px]", onSelect && "cursor-pointer", chartFocusRing)}
        >
          <div ref={hostRef} className="absolute inset-0">
            <canvas ref={canvasRef} role="img" aria-label={canvasLabel} className="pointer-events-none absolute left-0 top-0" />
          </div>
          {weekdayRows.map((r) => (
            <span
              key={r.dow}
              aria-hidden="true"
              className="pointer-events-none absolute left-0 font-mono text-[10px] leading-none text-[color:var(--bjork-text-soft)] [text-box:trim-both_cap_alphabetic]"
              style={{ top: MONTH_H + r.row * layout.pitch + layout.cell / 2, transform: "translateY(-50%)" }}
            >
              {r.label}
            </span>
          ))}
          <LabelPool
            count={model.months.length}
            pool={monthPool}
            className="font-mono text-[10px] leading-none text-[color:var(--bjork-text-muted)] [text-box:trim-both_cap_alphabetic]"
          />
          <div
            ref={scrollerRef}
            tabIndex={-1}
            aria-hidden="true"
            onScroll={(e) => {
              const el = e.currentTarget;
              const s = st.current;
              s.scrollX = el.scrollLeft;
              s.pinEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;
              if (s.source === "pointer") setHover(null, null);
              wake();
            }}
            className={cn(
              "absolute top-0 [scrollbar-width:none] [touch-action:pan-x_pan-y] [&::-webkit-scrollbar]:hidden",
              layout.scroll ? "overflow-x-auto overflow-y-hidden" : "overflow-hidden",
            )}
            style={{ left: layout.x0, width: layout.viewW || "100%", height: layout.height }}
          >
            <div style={{ width: layout.gridW, height: 1 }} />
          </div>
          <HoverTooltip ref={tipRef} onMeasure={wake} />
        </div>
      </div>
      {legend && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2" style={{ paddingLeft: GUTTER_L, maxWidth: boxW }}>
          <span className="font-mono text-[10px] leading-none tabular-nums text-[color:var(--bjork-text-soft)] [text-box:trim-both_cap_alphabetic]">{rangeText}</span>
          <span className="inline-flex items-center gap-1.5" aria-hidden="true">
            <span className="mr-0.5 font-bjork-alpha text-[11px] leading-none text-[color:var(--bjork-text-muted)]">Less</span>
            {colors.map((col, k) => (
              <span key={k} title={stepLabels[k]} className="inline-block size-2.5 rounded-[2px]" style={{ background: col }} />
            ))}
            <span className="ml-0.5 font-bjork-alpha text-[11px] leading-none text-[color:var(--bjork-text-muted)]">More</span>
          </span>
        </div>
      )}
      <span className="sr-only">
        {`Colour steps, in ${unit.other} per day: ${stepLabels.join("; ")}. Range ${rangeText}.`}
        {model.active ? ` Current streak ${model.current} days.` : ""}
      </span>
      <ChartTable caption={ariaLabel} columns={tableCols} rows={tableRows} />
      <ChartAnnouncer ref={announcer} />
    </div>
  );
}

function SummaryItem({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="font-mono text-[13px] leading-none tabular-nums text-[color:var(--bjork-text)]">{value}</span>
      <span className="font-bjork-alpha text-[11px] leading-none text-[color:var(--bjork-text-muted)]">{label}</span>
    </span>
  );
}
