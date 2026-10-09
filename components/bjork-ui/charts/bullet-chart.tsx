"use client";

// Few's bullet graph: one row per KPI, the actual value as a thin accent bar from zero over two to
// four neutral qualitative bands (stronger = poorer), the target as a perpendicular tick, and an
// optional hatched projection. The honest replacement for a row of gauges.

import { useEffect, useMemo, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useChartCanvas, easeOut, hatchPattern, writeLabels, type PlacedLabel } from "@/components/bjork-ui/charts/_kit/canvas";
import {
  useChartTheme,
  chartFocusRing,
  ChartTable,
  LabelPool,
  HoverTooltip,
  ChartAnnouncer,
  type TooltipHandle,
  type AnnouncerHandle,
  type TooltipContent,
} from "@/components/bjork-ui/charts/_kit/chrome";
import { clamp, crisp, damp, niceStep, niceTicks, withAlpha, formatCompact, formatPercent, formatSigned } from "@/components/bjork-ui/charts/_kit/scale";

/** Which direction is good. "lower" flips the band order and the status test (latency, churn). */
export type BulletDirection = "higher" | "lower";

/**
 * - `"row"`: every row on its own scale from zero (mixed units).
 * - `"target"`: every row as a share of its own target on one common axis, so targets line up at
 *   100%. Needs a positive target per row.
 * - `"shared"`: one raw domain for every row. Only meaningful when rows share a unit.
 */
export type BulletScale = "row" | "target" | "shared";

export type BulletStatus = "met" | "near" | "off" | "none";

export interface BulletRow {
  id: string;
  label: string;
  /** A short qualifier under the label (period, unit, owner). */
  sublabel?: string;
  /** Actual value. Non-finite means no data yet: no bar, "–" in the value column. */
  value: number;
  target: number;
  /**
   * Ascending upper bounds of the qualitative bands, in value units, starting from zero. One bound
   * per band; the last band always extends to the end of the scale. With `better: "higher"` the
   * first band is the poorest, with `"lower"` the first band is the best. Two to four bands read best.
   */
  ranges?: number[];
  /** End of the scale. Defaults to the largest of the last range, value, target and projection, rounded up. */
  max?: number;
  /** Where the value is heading by period end, drawn as a hatched extension. Status uses it when set. */
  projected?: number | null;
  /** Default "higher". */
  better?: BulletDirection;
  /** Per-row formatter (overrides `formatValue`). */
  format?: (v: number) => string;
}

export interface BulletChartProps {
  rows: BulletRow[];
  /** Default "row". See `BulletScale`. */
  scale?: BulletScale;
  /** Shared formatter for values, targets and ticks. Rows can override with `format`. */
  formatValue?: (v: number) => string;
  /**
   * The right-column comparison. "percent" reads "92% of target", "delta" a signed gap ("+12 ms vs
   * target"). "auto" (default) uses percent for higher-is-better and delta for lower-is-better rows.
   */
  attainment?: "auto" | "percent" | "delta";
  /** Fraction of the target that still counts as "near" (warning) rather than "off". Default 0.05. */
  tolerance?: number;
  /** Band names from poorest to best, e.g. ["Poor", "Fair", "Good"]. Defaults by band count. */
  bandLabels?: string[];
  /** Posed or controlled active row. `null` clears; `undefined` leaves hover to the pointer. */
  activeId?: string | null;
  onActiveChange?: (id: string | null) => void;
  /** Row height in px before the narrow label line. Defaults to 44 per-row scale, 34 on a common axis. */
  rowHeight?: number;
  ariaLabel?: string;
  tone?: BjorkTone;
  className?: string;
}

const NARROW = 480;
const TOP_PAD = 4;
const HEAD_H = 18;
const BAND_H = 16;
const BAR_H = 6;
const TARGET_H = 12;
const AXIS_H = 26;
const ROW_H = 44;
const ROW_H_COMMON = 34;
const GROW_MS = 620;
const STAGGER_MS = 70;
const TAU = 0.14;
const ICON_W = 14;
// Geist Mono advances are 0.6em; a hair over for safety.
const MONO = 0.62;

const defaultFormatValue = (v: number) => formatCompact(v, 1);

const DEFAULT_BANDS: Record<number, string[]> = {
  1: ["Range"],
  2: ["Poor", "Good"],
  3: ["Poor", "Fair", "Good"],
  4: ["Poor", "Fair", "Good", "Excellent"],
};

// Band strength from poorest to best (alpha of the ink on the stage).
const BAND_ALPHA: Record<BjorkTone, [number, number]> = { dark: [0.24, 0.075], light: [0.17, 0.055] };

const STATUS_WORD: Record<BulletStatus, [string, string]> = {
  met: ["On target", "On pace"],
  near: ["Near target", "At risk"],
  off: ["Off target", "Off pace"],
  none: ["No data", "No data"],
};

const STATUS_COLOR: Record<BulletStatus, string> = {
  met: "var(--bjork-success)",
  near: "var(--bjork-warning)",
  off: "var(--bjork-error)",
  none: "var(--bjork-text-soft)",
};

interface Model {
  id: string;
  label: string;
  sublabel?: string;
  fmt: (v: number) => string;
  better: BulletDirection;
  missing: boolean;
  value: number;
  target: number;
  projected: number | null;
  /** Display-space targets: [value, projected, target, lo, hi, ...inner band edges]. */
  goal: number[];
  bands: number;
  bandNames: string[];
  bandIndex: number;
  status: BulletStatus;
  statusWord: string;
  valueText: string;
  attNum: string;
  attTail: string;
  tickFmt: (v: number) => string;
}

function statusOf(better: BulletDirection, basis: number, target: number, tol: number): BulletStatus {
  if (!Number.isFinite(basis) || !Number.isFinite(target)) return "none";
  const slack = Math.abs(target) * tol;
  if (better === "higher") return basis >= target ? "met" : basis >= target - slack ? "near" : "off";
  return basis <= target ? "met" : basis <= target + slack ? "near" : "off";
}

function niceCeil(v: number): number {
  if (!(v > 0)) return 1;
  const step = niceStep(v, 5);
  return Math.ceil(v / step - 1e-9) * step;
}

function rawDomain(r: BulletRow, ranges: number[]): [number, number] {
  const fin = (x: number | null | undefined) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  const v = fin(r.value);
  const t = fin(r.target);
  const pr = fin(r.projected);
  const last = ranges.length ? ranges[ranges.length - 1] : 0;
  let lo = Math.min(0, v, t, pr);
  if (lo < 0) lo = -niceCeil(-lo);
  let hi: number;
  if (typeof r.max === "number" && Number.isFinite(r.max) && r.max > lo) hi = r.max;
  else {
    const top = Math.max(last, v, t, pr);
    hi = top > last || !ranges.length ? niceCeil(top) : last;
  }
  if (!(hi > lo)) hi = lo + 1;
  return [lo, hi];
}

function buildModel(
  rows: BulletRow[],
  scale: BulletScale,
  formatValue: (v: number) => string,
  attainment: "auto" | "percent" | "delta",
  tol: number,
  bandLabels: string[] | undefined,
): Model[] {
  const prepped = rows.map((r) => {
    const ranges = (r.ranges ?? []).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    return { r, ranges, dom: rawDomain(r, ranges) };
  });
  // Common axes: one domain for every row, in display units.
  let common: [number, number] | null = null;
  const kOf = (r: BulletRow, dom: [number, number]) => (scale === "target" ? (r.target > 0 ? 1 / r.target : 1 / dom[1]) : 1);
  if (scale !== "row" && prepped.length) {
    let lo = 0;
    let hi = 0;
    for (const { r, dom } of prepped) {
      const k = kOf(r, dom);
      lo = Math.min(lo, dom[0] * k);
      hi = Math.max(hi, dom[1] * k);
    }
    if (scale === "target") {
      // Round the common % axis to a clean step.
      const step = niceStep(hi - lo, 5);
      hi = Math.ceil(hi / step - 1e-9) * step;
      lo = Math.floor(lo / step + 1e-9) * step;
    }
    common = [lo, hi > lo ? hi : lo + 1];
  }

  return prepped.map(({ r, ranges, dom }) => {
    const fmt = r.format ?? formatValue;
    const better = r.better ?? "higher";
    const missing = !Number.isFinite(r.value);
    const value = missing ? 0 : r.value;
    const projected = typeof r.projected === "number" && Number.isFinite(r.projected) ? r.projected : null;
    const k = kOf(r, dom);
    const [lo, hi] = common ?? dom;
    // Bands: one per range bound; the last always runs to the end of the scale.
    const bands = Math.max(1, ranges.length);
    const inner = ranges.slice(0, bands - 1).map((x) => clamp(x * k, lo, hi));
    const names = bandLabels && bandLabels.length >= bands ? bandLabels : (DEFAULT_BANDS[bands] ?? Array.from({ length: bands }, (_, i) => `Band ${i + 1}`));
    // Names are poorest-to-best; position k from the left maps through the direction.
    const bandNames = Array.from({ length: bands }, (_, i) => names[better === "higher" ? i : bands - 1 - i]);
    let bandIndex = bands - 1;
    for (let i = 0; i < bands - 1; i++) {
      if (value < ranges[i]) {
        bandIndex = i;
        break;
      }
    }
    const status = missing ? "none" : statusOf(better, projected ?? value, r.target, tol);
    const mode = attainment === "auto" ? (better === "higher" ? "percent" : "delta") : attainment;
    let attNum = "–";
    let attTail = "";
    if (!missing && Number.isFinite(r.target)) {
      if (mode === "percent") {
        attNum = r.target !== 0 ? formatPercent(value / r.target, 0) : "–";
        attTail = " of target";
      } else {
        attNum = formatSigned(value - r.target, fmt);
        attTail = " vs target";
      }
    }
    const tickFmt = scale === "target" ? (v: number) => formatPercent(v, 0) : scale === "shared" ? formatValue : fmt;
    return {
      id: r.id,
      label: r.label,
      sublabel: r.sublabel,
      fmt,
      better,
      missing,
      value,
      target: r.target,
      projected,
      goal: [value * k, (projected ?? value) * k, (Number.isFinite(r.target) ? r.target : 0) * k, lo, hi, ...inner],
      bands,
      bandNames,
      bandIndex,
      status,
      statusWord: STATUS_WORD[status][projected !== null ? 1 : 0],
      valueText: missing ? "–" : fmt(value),
      attNum,
      attTail,
      tickFmt,
    };
  });
}

// Horizontal bar with a rounded data end and a square baseline at `x0`.
function hBarPath(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, h: number, r: number) {
  const left = Math.min(x0, x1);
  const w = Math.abs(x1 - x0);
  if (w <= 0.01) return;
  const rr = Math.min(r, w, h / 2);
  if (x1 >= x0) {
    ctx.moveTo(left, y);
    ctx.lineTo(left + w - rr, y);
    if (rr) ctx.arcTo(left + w, y, left + w, y + rr, rr);
    ctx.lineTo(left + w, y + h - rr);
    if (rr) ctx.arcTo(left + w, y + h, left + w - rr, y + h, rr);
    ctx.lineTo(left, y + h);
  } else {
    ctx.moveTo(left + w, y);
    ctx.lineTo(left + w, y + h);
    ctx.lineTo(left + rr, y + h);
    if (rr) ctx.arcTo(left, y + h, left, y + h - rr, rr);
    ctx.lineTo(left, y + rr);
    if (rr) ctx.arcTo(left, y, left + rr, y, rr);
  }
  ctx.closePath();
}

function StatusIcon({ status }: { status: BulletStatus }) {
  const common = { width: 10, height: 10, viewBox: "0 0 10 10", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (status === "met")
    return (
      <svg aria-hidden="true" {...common}>
        <circle cx="5" cy="5" r="4.2" />
        <path d="M3.2 5.1 4.4 6.3 6.9 3.8" />
      </svg>
    );
  if (status === "near")
    return (
      <svg aria-hidden="true" {...common}>
        <path d="M5 1.1 9.1 8.6H0.9Z" />
        <path d="M5 4.2v1.9" />
      </svg>
    );
  if (status === "off")
    return (
      <svg aria-hidden="true" {...common}>
        <path d="M5 0.8 9.2 5 5 9.2 0.8 5Z" />
        <path d="M3.6 3.6 6.4 6.4M6.4 3.6 3.6 6.4" />
      </svg>
    );
  return (
    <svg aria-hidden="true" {...common}>
      <path d="M2.5 5h5" />
    </svg>
  );
}

interface Run {
  enter: number;
  ready: boolean;
  cur: Map<string, number[]>;
  hover: number | null;
  source: "pointer" | "keyboard" | "prop" | null;
  labelW: number;
  layout: { l: number; r: number; rowH: number; head: number; bandOff: number };
  domKey: string;
  tickCache: string[];
}

export function BulletChart({
  rows,
  scale = "row",
  formatValue = defaultFormatValue,
  attainment = "auto",
  tolerance = 0.05,
  bandLabels,
  activeId,
  onActiveChange,
  rowHeight,
  ariaLabel = "Bullet chart",
  tone: toneProp,
  className,
}: BulletChartProps) {
  const { tone, pal, reduce, vars } = useChartTheme(toneProp);
  const announcer = useRef<AnnouncerHandle>(null);
  const tipRef = useRef<TooltipHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const nameRefs = useRef<(HTMLDivElement | null)[]>([]);
  const valueRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const attRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const tickPool = useRef<(HTMLSpanElement | null)[]>([]);

  const model = useMemo(() => buildModel(rows, scale, formatValue, attainment, tolerance, bandLabels), [rows, scale, formatValue, attainment, tolerance, bandLabels]);
  const n = model.length;
  const common = scale !== "row";
  const rowH = Math.max(common ? 24 : 38, rowHeight ?? (common ? ROW_H_COMMON : ROW_H));
  // Band sits high in per-row rows (ticks go under it), centred on a common axis.
  const bandOff = common ? Math.round((rowH - BAND_H) / 2) : 6;
  const heightWide = TOP_PAD + n * rowH + (common ? AXIS_H : 0) + 2;
  const heightNarrow = TOP_PAD + n * (rowH + HEAD_H) + (common ? AXIS_H : 0) + 2;

  // Right-column budgets from the mono advance (value 12px, attainment 11px).
  const widths = useMemo(() => {
    let value = 0;
    let full = 0;
    let short = 0;
    for (const m of model) {
      value = Math.max(value, m.valueText.length * 12 * MONO);
      short = Math.max(short, ICON_W + m.attNum.length * 11 * MONO);
      full = Math.max(full, ICON_W + (m.attNum.length + m.attTail.length) * 11 * MONO);
    }
    return { right: Math.ceil(Math.max(value, full)), short: Math.ceil(short), value: Math.ceil(value) };
  }, [model]);

  const cfg = useRef({ model, reduce, pal, tone, rowH, bandOff, common, widths });
  useEffect(() => {
    cfg.current = { model, reduce, pal, tone, rowH, bandOff, common, widths };
  });

  const st = useRef<Run>({
    enter: 0,
    ready: false,
    cur: new Map(),
    hover: null,
    source: null,
    labelW: 96,
    layout: { l: 0, r: 0, rowH: ROW_H, head: 0, bandOff: 6 },
    domKey: "",
    tickCache: [],
  });

  const { rootRef, hostRef, canvasRef, wake } = useChartCanvas(({ ctx, w, dt }) => {
    const s = st.current;
    const c = cfg.current;
    const p = c.pal;
    const M = c.model;
    const count = M.length;
    const narrow = w < NARROW;
    const head = narrow ? HEAD_H : 0;
    const rh = c.rowH + head;
    const labelW = narrow ? 0 : clamp(Math.ceil(s.labelW) + 16, 64, Math.max(64, Math.min(200, Math.round(w * 0.32))));
    const rightW = (narrow ? c.widths.short : c.widths.right) + 14;
    const l = labelW;
    const r = Math.max(l + 40, w - rightW);
    const pw = r - l;
    s.layout = { l, r, rowH: rh, head, bandOff: c.bandOff };

    // Damp every row toward its goal; new rows after the entrance grow from zero.
    let moving = false;
    for (const m of M) {
      let cur = s.cur.get(m.id);
      if (!cur) {
        cur = m.goal.slice();
        if (s.ready && !c.reduce) {
          cur[0] = 0;
          cur[1] = 0;
        }
        s.cur.set(m.id, cur);
      }
      const span = Math.max(1e-9, m.goal[4] - m.goal[3]);
      for (let k = 0; k < m.goal.length; k++) {
        if (c.reduce || cur[k] === undefined) {
          cur[k] = m.goal[k];
          continue;
        }
        cur[k] = damp(cur[k], m.goal[k], TAU, dt);
        if (Math.abs(cur[k] - m.goal[k]) > span * 1e-4) moving = true;
        else cur[k] = m.goal[k];
      }
      cur.length = m.goal.length;
    }
    s.ready = true;

    const total = count * STAGGER_MS + GROW_MS;
    s.enter = c.reduce ? 1 : Math.min(1, s.enter + (dt * 1000) / total);
    const growOf = (i: number) => (s.enter >= 1 ? 1 : easeOut(clamp((s.enter * total - i * STAGGER_MS) / GROW_MS, 0, 1)));

    const [aStrong, aWeak] = BAND_ALPHA[c.tone];
    const hatch = hatchPattern(ctx, withAlpha(p.accent, 0.85), 3, 1);
    const hov = s.hover;
    const ticks: PlacedLabel[] = [];
    const tickMarks: number[] = [];

    for (let i = 0; i < count; i++) {
      const m = M[i];
      const v = s.cur.get(m.id)!;
      const lo = v[3];
      const hi = v[4];
      const k = pw / Math.max(1e-9, hi - lo);
      const xOf = (x: number) => l + (clamp(x, lo, hi) - lo) * k;
      const top = TOP_PAD + i * rh;
      const bandTop = top + head + c.bandOff;
      const mid = bandTop + BAND_H / 2;
      const g = growOf(i);
      const dim = hov !== null && hov !== i;
      ctx.globalAlpha = dim ? 0.42 : 1;

      // Qualitative bands: contiguous, stronger ink = poorer.
      for (let b = 0; b < m.bands; b++) {
        const e0 = b === 0 ? lo : v[5 + b - 1];
        const e1 = b === m.bands - 1 ? hi : v[5 + b];
        const poorRank = m.better === "higher" ? b : m.bands - 1 - b;
        const a = m.bands === 1 ? aWeak * 1.4 : aStrong - ((aStrong - aWeak) * poorRank) / (m.bands - 1);
        const x0 = Math.round(xOf(e0));
        const x1 = Math.round(xOf(e1));
        if (x1 - x0 <= 0) continue;
        ctx.fillStyle = withAlpha(p.text, a);
        ctx.beginPath();
        if (b === m.bands - 1) hBarPath(ctx, x0, x1, bandTop, BAND_H, 3);
        else ctx.rect(x0, bandTop, x1 - x0, BAND_H);
        ctx.fill();
      }

      const zx = xOf(0);
      if (lo < 0) {
        ctx.fillStyle = p.textFaint;
        ctx.fillRect(Math.round(zx), bandTop, 1, BAND_H);
      }

      if (!m.missing) {
        const vEnd = v[0] * g;
        const barY = mid - BAR_H / 2;
        const bx = xOf(vEnd);
        // A forward projection continues the bar, so the value end stays square where they meet.
        const extends_ = m.projected !== null && v[1] > v[0] && v[0] >= 0;
        ctx.beginPath();
        hBarPath(ctx, zx, bx, barY, BAR_H, extends_ ? 0 : 3);
        ctx.fillStyle = p.accent;
        ctx.fill();
        // Projection: a hatched continuation from the value to where it is heading. A projection
        // below the value hatches back over the bar instead.
        if (m.projected !== null && Math.abs(v[1] - v[0]) > 1e-9) {
          const pa = clamp((g - 0.55) / 0.45, 0, 1);
          const px = xOf(v[1]);
          if (pa > 0 && Math.abs(px - bx) > 0.5) {
            ctx.globalAlpha = (dim ? 0.42 : 1) * pa;
            ctx.beginPath();
            if (px > bx) hBarPath(ctx, bx, px, barY, BAR_H, 3);
            else ctx.rect(px, barY, bx - px, BAR_H);
            ctx.fillStyle = px > bx ? withAlpha(p.accent, 0.18) : withAlpha(p.stage, 0.55);
            ctx.fill();
            if (hatch) {
              ctx.fillStyle = hatch;
              ctx.fill();
            }
            ctx.globalAlpha = dim ? 0.42 : 1;
          }
        }
      }

      // Target: a perpendicular tick in strong ink.
      if (Number.isFinite(m.target)) {
        const tx = Math.round(xOf(v[2]));
        ctx.fillStyle = p.text;
        ctx.fillRect(Math.min(tx - 1, Math.round(r) - 2), mid - TARGET_H / 2, 2, TARGET_H);
      }
      ctx.globalAlpha = 1;

      // Per-row sparse ticks under the band.
      if (!c.common) {
        const tl = m.goal[3];
        const th = m.goal[4];
        let want = clamp(Math.floor(pw / 90), 2, 5);
        let tv = niceTicks(tl, th, want);
        for (;;) {
          const widest = tv.reduce((mx, t) => Math.max(mx, m.tickFmt(t).length), 0) * 10 * MONO;
          const gap = tv.length > 1 ? ((tv[1] - tv[0]) / Math.max(1e-9, th - tl)) * pw : Infinity;
          if (gap >= widest + 10 || want <= 1) break;
          want -= 1;
          tv = niceTicks(tl, th, want);
        }
        for (const t of tv) {
          const x = l + (t - lo) * k;
          if (x < l - 0.5 || x > r + 0.5) continue;
          const text = m.tickFmt(t);
          const half = (text.length * 10 * MONO) / 2;
          tickMarks.push(crisp(x), bandTop + BAND_H + 1);
          ticks.push({ text, x: x - half < 0 ? 0 : x, y: bandTop + BAND_H + 10, ax: x - half < 0 ? 0 : x + half > w ? -100 : -50, opacity: dim ? 0.45 : 1 });
        }
      }

      // DOM rows: positions only when the layout changes, opacity every frame.
      const N = nameRefs.current[i];
      const V = valueRefs.current[i];
      const A = attRefs.current[i];
      const fade = clamp((g - 0.35) / 0.65, 0, 1);
      if (N) N.style.opacity = dim ? "0.5" : "1";
      if (V) V.style.opacity = String(fade * (dim ? 0.5 : 1));
      if (A) A.style.opacity = String(fade * (dim ? 0.5 : 1));
    }

    // Common axis along the bottom.
    if (c.common && count) {
      const m = M[0];
      const v = s.cur.get(m.id)!;
      const lo = v[3];
      const hi = v[4];
      const xOf = (x: number) => l + ((x - lo) / Math.max(1e-9, hi - lo)) * pw;
      const ay = TOP_PAD + count * rh + 4;
      ctx.fillStyle = p.hair;
      ctx.fillRect(l, Math.round(ay), pw, 1);
      let want = clamp(Math.floor(pw / 80), 2, 8);
      let tv = niceTicks(m.goal[3], m.goal[4], want);
      for (;;) {
        const widest = tv.reduce((mx, t) => Math.max(mx, m.tickFmt(t).length), 0) * 10 * MONO;
        const gap = tv.length > 1 ? ((tv[1] - tv[0]) / Math.max(1e-9, m.goal[4] - m.goal[3])) * pw : Infinity;
        if (gap >= widest + 12 || want <= 1) break;
        want -= 1;
        tv = niceTicks(m.goal[3], m.goal[4], want);
      }
      for (const t of tv) {
        const x = xOf(t);
        if (x < l - 0.5 || x > r + 0.5) continue;
        const text = m.tickFmt(t);
        const half = (text.length * 10 * MONO) / 2;
        tickMarks.push(crisp(x), Math.round(ay) + 1);
        ticks.push({ text, x, y: ay + 14, ax: x - half < 0 ? 0 : x + half > w ? -100 : -50 });
      }
    }
    if (tickMarks.length) {
      ctx.strokeStyle = p.textFaint;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let q = 0; q < tickMarks.length; q += 2) {
        ctx.moveTo(tickMarks[q], tickMarks[q + 1]);
        ctx.lineTo(tickMarks[q], tickMarks[q + 1] + 3);
      }
      ctx.stroke();
    }
    writeLabels(tickPool.current, s.tickCache, ticks);

    // Label and value columns.
    const key = `${w}|${l}|${r}|${rh}|${count}|${c.bandOff}`;
    if (key !== s.domKey) {
      s.domKey = key;
      for (let i = 0; i < count; i++) {
        const top = TOP_PAD + i * rh;
        const mid = top + head + c.bandOff + BAND_H / 2;
        const N = nameRefs.current[i];
        const V = valueRefs.current[i];
        const A = attRefs.current[i];
        if (narrow) {
          const lineY = top + HEAD_H / 2;
          if (N) {
            N.style.width = `${Math.max(40, w - c.widths.value - 12)}px`;
            N.style.transform = `translate3d(0, ${lineY.toFixed(1)}px, 0) translateY(-50%)`;
          }
          if (V) V.style.transform = `translate3d(${w}px, ${lineY.toFixed(1)}px, 0) translate(-100%, -50%)`;
          if (A) A.style.transform = `translate3d(${w}px, ${mid.toFixed(1)}px, 0) translate(-100%, -50%)`;
        } else {
          if (N) {
            N.style.width = `${Math.max(40, l - 14)}px`;
            N.style.transform = `translate3d(0, ${mid.toFixed(1)}px, 0) translateY(-50%)`;
          }
          if (V) V.style.transform = `translate3d(${w}px, ${(mid - 2).toFixed(1)}px, 0) translate(-100%, -100%)`;
          if (A) A.style.transform = `translate3d(${w}px, ${(mid + 3).toFixed(1)}px, 0) translate(-100%, 0)`;
        }
      }
    }

    const tip = tipRef.current;
    if (tip?.el && hov !== null && M[hov]) {
      const m = M[hov];
      const v = s.cur.get(m.id)!;
      const lo = v[3];
      const hi = v[4];
      const x = l + ((clamp(Math.max(v[0], m.projected !== null ? v[1] : v[0], v[2]), lo, hi) - lo) / Math.max(1e-9, hi - lo)) * pw;
      const bandTop = TOP_PAD + hov * rh + head + c.bandOff;
      const tw = tip.size.w;
      const th = tip.size.h;
      let tx = x + 12;
      if (tx + tw > w) tx = x - 12 - tw;
      tx = clamp(tx, 0, Math.max(0, w - tw));
      const ty = bandTop - th - 8 >= 0 ? bandTop - th - 8 : bandTop + BAND_H + 8;
      tip.el.style.transform = `translate3d(${Math.round(tx)}px, ${Math.round(ty)}px, 0)`;
    }

    return moving || s.enter < 1;
  });

  // Label column width: the widest label or sublabel, measured after fonts settle.
  useEffect(() => {
    let alive = true;
    const measure = () => {
      if (!alive) return;
      let mx = 0;
      for (let i = 0; i < model.length; i++) {
        const el = nameRefs.current[i];
        if (!el) continue;
        for (const ch of Array.from(el.children)) mx = Math.max(mx, (ch as HTMLElement).scrollWidth);
      }
      st.current.labelW = mx || 96;
      st.current.domKey = "";
      wake();
    };
    measure();
    document.fonts?.ready.then(measure).catch(() => {});
    // Forget rows that left the data.
    const ids = new Set(model.map((m) => m.id));
    for (const id of Array.from(st.current.cur.keys())) if (!ids.has(id)) st.current.cur.delete(id);
    return () => {
      alive = false;
    };
  }, [model, wake]);

  useEffect(() => {
    st.current.domKey = "";
    wake();
  }, [pal, reduce, rowH, bandOff, wake]);

  const tooltipFor = (i: number): TooltipContent | null => {
    const m = model[i];
    if (!m) return null;
    const rowsOut: TooltipContent["rows"] = [];
    rowsOut.push({ key: "v", label: "Actual", value: m.valueText, color: pal.accent });
    if (Number.isFinite(m.target)) rowsOut.push({ key: "t", label: "Target", value: m.fmt(m.target), color: pal.text });
    if (!m.missing && Number.isFinite(m.target)) {
      const gap = m.value - m.target;
      const word = Math.abs(gap) < 1e-12 ? "On target" : (m.better === "higher") === gap < 0 ? (m.better === "higher" ? "To go" : "Over target") : m.better === "higher" ? "Over target" : "Under target";
      rowsOut.push({ key: "g", label: word, value: formatSigned(gap, m.fmt), strong: false });
    }
    if (m.projected !== null) {
      rowsOut.push({
        key: "p",
        label: Number.isFinite(m.target) && m.target !== 0 ? `Projected, ${formatPercent(m.projected / m.target, 0)}` : "Projected",
        value: m.fmt(m.projected),
        color: pal.accent,
        dashed: true,
      });
    }
    if (!m.missing) rowsOut.push({ key: "b", label: "Band", value: m.bandNames[m.bandIndex], strong: false });
    rowsOut.push({ key: "s", label: "Status", value: m.statusWord, strong: false });
    return { key: `${m.id}|${m.valueText}|${m.projected}|${pal.text}`, title: m.sublabel ? `${m.label} · ${m.sublabel}` : m.label, rows: rowsOut };
  };

  const setHover = (i: number | null, source: Run["source"]) => {
    const s = st.current;
    if (s.hover === i && s.source === source) return;
    const changed = s.hover !== i;
    s.hover = i;
    s.source = i === null ? null : source;
    tipRef.current?.set(i === null ? null : tooltipFor(i));
    if (i !== null && source === "keyboard") {
      const m = model[i];
      announcer.current?.say(
        `${m.label}: ${m.valueText}${Number.isFinite(m.target) ? `, target ${m.fmt(m.target)}` : ""}, ${m.attNum}${m.attTail}${m.projected !== null ? `, projected ${m.fmt(m.projected)}` : ""}, ${m.statusWord}`,
      );
    }
    if (changed && source !== "prop") onActiveChange?.(i === null ? null : (model[i]?.id ?? null));
    wake();
  };

  // Keep the open tooltip in step with data and theme changes.
  useEffect(() => {
    const s = st.current;
    if (s.hover !== null) {
      if (s.hover >= model.length) setHover(null, null);
      else tipRef.current?.set(tooltipFor(s.hover));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, pal]);

  useEffect(() => {
    if (activeId === undefined) return;
    const i = activeId === null ? -1 : model.findIndex((m) => m.id === activeId);
    // A controlled echo of our own pointer or keyboard move keeps its source.
    if (i >= 0 && st.current.hover === i) return;
    setHover(i >= 0 ? i : null, i >= 0 ? "prop" : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, model]);

  const rowAt = (clientY: number) => {
    const rect = rectRef.current ?? wrapperRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const y = clientY - rect.top - TOP_PAD;
    const i = Math.floor(y / st.current.layout.rowH);
    return y >= 0 && i >= 0 && i < model.length ? i : null;
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    setHover(rowAt(e.clientY), "pointer");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = st.current;
    const last = model.length - 1;
    if (last < 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const fwd = e.key === "ArrowDown" || e.key === "ArrowRight";
      const cur = s.hover ?? (fwd ? -1 : last + 1);
      setHover(clamp(cur + (fwd ? 1 : -1), 0, last), "keyboard");
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setHover(e.key === "Home" ? 0 : last, "keyboard");
    } else if (e.key === "Escape" && s.hover !== null) {
      e.preventDefault();
      setHover(null, null);
    }
  };

  const tableCols = useMemo(() => ["Metric", "Actual", "Target", "Versus target", "Projected", "Band", "Status"], []);
  const tableRows = useMemo(
    () =>
      model.map((m) => [
        m.sublabel ? `${m.label} (${m.sublabel})` : m.label,
        m.valueText,
        Number.isFinite(m.target) ? m.fmt(m.target) : "–",
        `${m.attNum}${m.attTail}`,
        m.projected !== null ? m.fmt(m.projected) : "–",
        m.missing ? "–" : m.bandNames[m.bandIndex],
        `${m.statusWord}${m.better === "lower" ? " (lower is better)" : ""}`,
      ]),
    [model],
  );
  const summary = useMemo(() => {
    const c = { met: 0, near: 0, off: 0, none: 0 };
    for (const m of model) c[m.status] += 1;
    const parts = [`${c.met} on target`, c.near ? `${c.near} near` : "", c.off ? `${c.off} off target` : "", c.none ? `${c.none} without data` : ""].filter(Boolean);
    return `${model.length} metric${model.length === 1 ? "" : "s"}: ${parts.join(", ")}`;
  }, [model]);

  const tickCount = common ? 10 : n * 6;

  return (
    <div className={cn("@container w-full", className)}>
      <div
        ref={rootRef}
        data-loop="idle"
        className="relative h-[var(--bullet-h)] w-full select-none text-[color:var(--bjork-text)] @max-[480px]:h-[var(--bullet-hn)]"
        style={{ ...vars, "--bullet-h": `${n ? heightWide : 56}px`, "--bullet-hn": `${n ? heightNarrow : 56}px` } as CSSProperties}
      >
        <div
          ref={wrapperRef}
          role="group"
          aria-roledescription="chart"
          aria-label={`${ariaLabel}. Up and down step through the metrics.`}
          tabIndex={0}
          onPointerEnter={() => {
            if (wrapperRef.current) rectRef.current = wrapperRef.current.getBoundingClientRect();
          }}
          onPointerMove={onPointerMove}
          onPointerDown={(e) => {
            if (wrapperRef.current) rectRef.current = wrapperRef.current.getBoundingClientRect();
            if (e.pointerType === "touch") onPointerMove(e);
          }}
          onPointerLeave={() => {
            rectRef.current = null;
            if (st.current.source === "pointer") setHover(null, null);
          }}
          onKeyDown={onKeyDown}
          className={cn("absolute inset-0 touch-pan-y rounded-[10px]", chartFocusRing)}
        >
          <div ref={hostRef} className="absolute inset-0">
            <canvas ref={canvasRef} role="img" aria-label={`${ariaLabel}, ${summary}`} className="pointer-events-none absolute left-0 top-0" />
          </div>
          {!n && (
            <span className="absolute inset-0 flex items-center justify-center font-bjork-alpha text-[12px] text-[color:var(--bjork-text-muted)]">No metrics</span>
          )}
          {model.map((m, i) => (
            <div
              key={`n-${m.id}`}
              ref={(el) => {
                nameRefs.current[i] = el;
              }}
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-0 flex min-w-0 flex-col items-start gap-[6px] opacity-0 transition-opacity duration-150 ease-out @max-[480px]:flex-row @max-[480px]:items-baseline @max-[480px]:gap-1.5"
            >
              <span className="min-w-0 max-w-full truncate font-bjork-alpha text-[12px] font-medium leading-[14px] text-[color:var(--bjork-text)]">{m.label}</span>
              {m.sublabel && (
                <span className="min-w-0 max-w-full shrink-[4] truncate font-bjork-alpha text-[10.5px] leading-[12px] text-[color:var(--bjork-text-muted)]">{m.sublabel}</span>
              )}
            </div>
          ))}
          {model.map((m, i) => (
            <span
              key={`v-${m.id}`}
              ref={(el) => {
                valueRefs.current[i] = el;
              }}
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-0 whitespace-nowrap font-mono text-[12px] leading-none tabular-nums text-[color:var(--bjork-text)] opacity-0 [text-box:trim-both_cap_alphabetic]"
            >
              {m.valueText}
            </span>
          ))}
          {model.map((m, i) => (
            <span
              key={`a-${m.id}`}
              ref={(el) => {
                attRefs.current[i] = el;
              }}
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-0 inline-flex items-center gap-1 whitespace-nowrap font-mono text-[11px] leading-none tabular-nums text-[color:var(--bjork-text-muted)] opacity-0"
            >
              <span className="inline-flex shrink-0" style={{ color: STATUS_COLOR[m.status] }}>
                <StatusIcon status={m.status} />
              </span>
              <span className="[text-box:trim-both_cap_alphabetic]">
                {m.attNum}
                <span className="@max-[480px]:hidden">{m.attTail}</span>
              </span>
            </span>
          ))}
          <LabelPool count={tickCount} pool={tickPool} />
          <HoverTooltip ref={tipRef} onMeasure={wake} />
        </div>
        <ChartTable caption={ariaLabel} columns={tableCols} rows={tableRows} />
        <ChartAnnouncer ref={announcer} />
      </div>
    </div>
  );
}
