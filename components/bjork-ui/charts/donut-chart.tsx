"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useChartCanvas, easeOut } from "@/components/bjork-ui/charts/_kit/canvas";
import { useChartTheme, chartFocusRing, ChartTable, LegendKey, ChartAnnouncer, type AnnouncerHandle } from "@/components/bjork-ui/charts/_kit/chrome";
import { clamp, damp, formatCompact, formatPercent, formatSigned } from "@/components/bjork-ui/charts/_kit/scale";
import { CHART_OTHER, MAX_SERIES, foldSeries, seriesColor } from "@/components/bjork-ui/charts/_kit/series";

export interface DonutSlice {
  /** Stable id. Animation, hover and the posed `activeId` follow it. */
  id: string;
  label: string;
  /** Non-negative. Negative and non-finite values count as zero (a part-to-whole has no negative parts). */
  value: number;
  /** The same part last period. When any slice has one, the legend adds a signed change column. */
  previous?: number;
}

export interface DonutChartProps {
  data: DonutSlice[];
  /**
   * Clockwise order from 12 o'clock. "value" (default) puts the largest first; "data" keeps the
   * caller's order. A folded "Other" is always last.
   */
  sort?: "value" | "data";
  /**
   * Most slices drawn, 2 to 6 (default 6). Past that the smallest parts fold into one neutral
   * "Other" slice; the table twin still lists each folded part.
   *
   * Colour: kept slices take the categorical series order by their position in `data` among the
   * kept slices, never by size, so a slice keeps its colour when values change or `sort` flips.
   * "Other" always takes the neutral `CHART_OTHER`.
   */
  maxSlices?: number;
  otherLabel?: string;
  /** Header of the legend's label column, e.g. "Plan" or "Source". */
  legendTitle?: string;
  /** Header of the change column when `previous` values exist. */
  previousLabel?: string;
  /** Caption in the ring centre when nothing is active. */
  centerLabel?: string;
  /** "auto" (default) sits the legend beside the ring and stacks it underneath when narrow. */
  legend?: "auto" | "bottom" | "none";
  formatValue?: (v: number) => string;
  /** Formats a share in 0..1. */
  formatShare?: (v: number) => string;
  /** Posed or controlled active slice id. `null` clears; `undefined` leaves hover uncontrolled. */
  activeId?: string | null;
  onActiveChange?: (id: string | null) => void;
  /** Ring diameter in px. The ring scales down with the container. */
  height?: number;
  /** Inner radius as a fraction of the outer, 0.4 to 0.85. */
  innerRadius?: number;
  ariaLabel?: string;
  tone?: BjorkTone;
  className?: string;
}

interface Slice {
  id: string;
  label: string;
  value: number;
  share: number;
  previous: number | null;
  color: string;
  other: boolean;
  /** Folded parts, for Other. */
  members: { label: string; value: number; previous: number | null }[];
}

const PUSH = 6;
const GAP = 2;
const ENTER_MS = 900;
const ANGLE_TAU = 0.16;
const HOVER_TAU = 0.08;
const DIM = 0.36;
const TAU = Math.PI * 2;
const TOP = -Math.PI / 2;

const defaultFormatValue = (v: number) => formatCompact(v, 1);
const defaultFormatShare = (v: number) => formatPercent(v, 1);
const clean = (v: number | undefined) => (v !== undefined && Number.isFinite(v) && v > 0 ? v : 0);

function buildSlices(data: DonutSlice[], sort: "value" | "data", max: number, otherLabel: string, tone: BjorkTone): { slices: Slice[]; total: number; prevTotal: number | null } {
  const rows = data.map((d, i) => ({ d, i, v: clean(d.value), p: d.previous === undefined || !Number.isFinite(d.previous) ? null : clean(d.previous) }));
  const total = rows.reduce((a, r) => a + r.v, 0);
  const hasPrev = rows.length > 0 && rows.every((r) => r.p !== null);
  const prevTotal = hasPrev ? rows.reduce((a, r) => a + (r.p ?? 0), 0) : null;
  // Rank by size (stable on data order) to decide what folds.
  const ranked = [...rows].sort((a, b) => b.v - a.v || a.i - b.i);
  type Row = (typeof rows)[number] & { folded?: typeof rows };
  const kept: Row[] = foldSeries<Row>(ranked, max, (rest) => ({
    d: { id: "__other", label: otherLabel, value: 0 },
    i: Number.MAX_SAFE_INTEGER,
    v: rest.reduce((a, r) => a + r.v, 0),
    p: rest.every((r) => r.p !== null) ? rest.reduce((a, r) => a + (r.p ?? 0), 0) : null,
    folded: rest,
  }));
  // Colour by position in the caller's data among the kept slices.
  const colourOrder = kept.filter((r) => !r.folded).sort((a, b) => a.i - b.i);
  const colourOf = new Map(colourOrder.map((r, k) => [r.d.id, seriesColor(tone, k)]));
  const ordered = sort === "value" ? kept : [...kept].sort((a, b) => a.i - b.i);
  const slices = ordered.map<Slice>((r) => ({
    id: r.d.id,
    label: r.d.label,
    value: r.v,
    share: total > 0 ? r.v / total : 0,
    previous: r.p,
    color: r.folded ? CHART_OTHER[tone] : (colourOf.get(r.d.id) ?? CHART_OTHER[tone]),
    other: !!r.folded,
    members: r.folded ? r.folded.map((m) => ({ label: m.d.label, value: m.v, previous: m.p })) : [],
  }));
  return { slices, total, prevTotal };
}

function changeText(v: number, prev: number | null, fmt: (v: number) => string): string {
  if (prev === null) return "";
  if (prev === 0) return v > 0 ? "New" : "–";
  return formatSigned((v - prev) / prev, fmt);
}
const pctChange = (v: number) => formatPercent(v, 1);

// An annular sector whose gaps stay `gap` px wide at every radius: each edge runs parallel to its
// radial, offset by half the gap. Thin slices close to a point instead of crossing over.
function sectorPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r0: number, r1: number, a0: number, a1: number, gap: number): boolean {
  const span = a1 - a0;
  if (span <= 0) return false;
  const h = gap / 2;
  const ao = Math.asin(Math.min(1, h / r1));
  if (span <= 2 * ao + 1e-4) return false;
  ctx.moveTo(cx + r1 * Math.cos(a0 + ao), cy + r1 * Math.sin(a0 + ao));
  ctx.arc(cx, cy, r1, a0 + ao, a1 - ao);
  const ai = r0 > h ? Math.asin(h / r0) : Math.PI / 2;
  if (span > 2 * ai) {
    ctx.lineTo(cx + r0 * Math.cos(a1 - ai), cy + r0 * Math.sin(a1 - ai));
    ctx.arc(cx, cy, r0, a1 - ai, a0 + ai, true);
  } else {
    const d = h / Math.sin(span / 2);
    if (d >= r1) return false;
    const m = (a0 + a1) / 2;
    ctx.lineTo(cx + d * Math.cos(m), cy + d * Math.sin(m));
  }
  ctx.closePath();
  return true;
}

interface Disp {
  id: string;
  color: string;
  f0: number;
  f1: number;
  t0: number;
  t1: number;
  push: number;
  alpha: number;
  seen: number;
}

interface Run {
  disp: Map<string, Disp>;
  gen: number;
  enter: number;
  ready: boolean;
  hoverId: string | null;
  geom: { cx: number; cy: number; r0: number; r1: number };
}

export function DonutChart({
  data,
  sort = "value",
  maxSlices = MAX_SERIES,
  otherLabel = "Other",
  legendTitle = "Segment",
  previousLabel = "vs prev",
  centerLabel = "Total",
  legend = "auto",
  formatValue = defaultFormatValue,
  formatShare = defaultFormatShare,
  activeId,
  onActiveChange,
  height = 240,
  innerRadius = 0.62,
  ariaLabel = "Donut chart",
  tone: toneProp,
  className,
}: DonutChartProps) {
  const { tone, pal, reduce, vars } = useChartTheme(toneProp);
  const announcer = useRef<AnnouncerHandle>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const cLabel = useRef<HTMLSpanElement>(null);
  const cValue = useRef<HTMLSpanElement>(null);
  const cSub = useRef<HTMLSpanElement>(null);
  const rectRef = useRef<DOMRect | null>(null);

  const max = clamp(Math.round(maxSlices), 2, MAX_SERIES);
  const inner = clamp(innerRadius, 0.4, 0.85);
  const { slices, total, prevTotal } = useMemo(() => buildSlices(data, sort, max, otherLabel, tone), [data, sort, max, otherLabel, tone]);
  const hasPrev = prevTotal !== null;

  const cfg = useRef({ slices, total, reduce, pal, inner });
  useEffect(() => {
    cfg.current = { slices, total, reduce, pal, inner };
  });

  const st = useRef<Run>({ disp: new Map(), gen: 0, enter: 0, ready: false, hoverId: null, geom: { cx: 0, cy: 0, r0: 0, r1: 0 } });

  const { rootRef, hostRef, canvasRef, wake } = useChartCanvas(({ ctx, w, h, dt }) => {
    const s = st.current;
    const c = cfg.current;
    const p = c.pal;
    const cx = w / 2;
    const cy = h / 2;
    const r1 = Math.max(4, Math.min(w, h) / 2 - PUSH - 2);
    const r0 = r1 * c.inner;
    s.geom = { cx, cy, r0, r1 };

    if (c.reduce) s.enter = 1;
    else if (s.enter < 1) s.enter = Math.min(1, s.enter + (dt * 1000) / ENTER_MS);
    const sweep = s.enter >= 1 ? 1 : easeOut(s.enter);
    let moving = s.enter < 1;

    // Targets: running fractions of the turn, clockwise from 12 o'clock.
    const gen = ++s.gen;
    let acc = 0;
    const tot = c.total;
    for (let i = 0; i < c.slices.length; i++) {
      const sl = c.slices[i];
      const t0 = tot > 0 ? acc / tot : 0;
      acc += sl.value;
      const t1 = tot > 0 ? acc / tot : 0;
      let d = s.disp.get(sl.id);
      if (!d) {
        // First frame takes the layout as is (the sweep reveals it); later arrivals grow from their start.
        d = { id: sl.id, color: sl.color, f0: t0, f1: s.ready ? t0 : t1, t0, t1, push: 0, alpha: 1, seen: gen };
        s.disp.set(sl.id, d);
      }
      d.t0 = t0;
      d.t1 = t1;
      d.color = sl.color;
      d.seen = gen;
    }
    s.ready = true;

    const hov = s.hoverId;
    for (const d of s.disp.values()) {
      if (d.seen !== gen) {
        // Departed: collapse in place, then drop.
        if (d.t0 !== d.t1) d.t0 = d.t1 = (d.t0 + d.t1) / 2;
      }
      const pushT = hov === d.id && !c.reduce ? 1 : 0;
      const alphaT = hov === null || hov === d.id ? 1 : DIM;
      if (c.reduce) {
        d.f0 = d.t0;
        d.f1 = d.t1;
        d.push = pushT;
        d.alpha = alphaT;
      } else {
        d.f0 = damp(d.f0, d.t0, ANGLE_TAU, dt);
        d.f1 = damp(d.f1, d.t1, ANGLE_TAU, dt);
        d.push = damp(d.push, pushT, HOVER_TAU, dt);
        d.alpha = damp(d.alpha, alphaT, HOVER_TAU, dt);
        if (Math.abs(d.f0 - d.t0) + Math.abs(d.f1 - d.t1) > 2e-4 || Math.abs(d.push - pushT) + Math.abs(d.alpha - alphaT) > 4e-3) moving = true;
        else {
          d.f0 = d.t0;
          d.f1 = d.t1;
          d.push = pushT;
          d.alpha = alphaT;
        }
      }
      if (d.seen !== gen && d.f1 - d.f0 < 1e-4) s.disp.delete(d.id);
    }

    if (!(tot > 0)) {
      // Empty: a faint track so the chart still reads as a ring.
      ctx.fillStyle = p.hair;
      ctx.beginPath();
      ctx.arc(cx, cy, r1, 0, TAU);
      ctx.arc(cx, cy, r0, TAU, 0, true);
      ctx.fill();
    }

    const limit = sweep;
    let visible = 0;
    for (const d of s.disp.values()) if (d.f1 - d.f0 > 1e-4) visible++;
    for (const d of s.disp.values()) {
      const f0 = d.f0;
      const f1 = Math.min(d.f1, limit);
      if (f1 - f0 <= 1e-5) continue;
      const m = TOP + ((f0 + f1) / 2) * TAU;
      const off = d.push * PUSH;
      const ox = cx + Math.cos(m) * off;
      const oy = cy + Math.sin(m) * off;
      ctx.globalAlpha = d.alpha;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      if (visible === 1 && f1 - f0 > 0.9999) {
        ctx.arc(ox, oy, r1, 0, TAU);
        ctx.arc(ox, oy, r0, TAU, 0, true);
        ctx.fill();
      } else if (sectorPath(ctx, ox, oy, r0, r1, TOP + f0 * TAU, TOP + f1 * TAU, GAP)) ctx.fill();
      // Reduced motion has no push-out, so the active slice gets an outer rule instead.
      if (c.reduce && hov === d.id) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = p.text;
        ctx.lineWidth = 2;
        ctx.beginPath();
        const a0 = TOP + f0 * TAU + GAP / (r1 + 4);
        const a1 = TOP + f1 * TAU - GAP / (r1 + 4);
        if (a1 > a0) {
          ctx.arc(cx, cy, r1 + 4, a0, a1);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
    return moving;
  });

  const writeCentre = (id: string | null) => {
    const L = cLabel.current;
    const V = cValue.current;
    const S = cSub.current;
    if (!L || !V || !S) return;
    const sl = id === null ? undefined : slices.find((x) => x.id === id);
    if (!sl) {
      L.textContent = centerLabel;
      V.textContent = formatValue(total);
      const chg = hasPrev ? changeText(total, prevTotal, pctChange) : "";
      S.textContent = chg ? `${chg} ${previousLabel}` : "";
      return;
    }
    L.textContent = sl.other ? `${sl.label} (${sl.members.length})` : sl.label;
    V.textContent = formatValue(sl.value);
    const chg = changeText(sl.value, sl.previous, pctChange);
    S.textContent = `${formatShare(sl.share)}${chg ? ` · ${chg}` : ""}`;
  };

  const writeRows = (id: string | null) => {
    slices.forEach((sl, i) => {
      const el = rowRefs.current[i];
      if (el) el.dataset.state = id === null ? "" : sl.id === id ? "active" : "dim";
    });
  };

  const announce = (sl: Slice, i: number) => {
    const chg = changeText(sl.value, sl.previous, pctChange);
    const name = sl.other ? `${sl.label}, ${sl.members.length} parts` : sl.label;
    announcer.current?.say(`${name}: ${formatValue(sl.value)}, ${formatShare(sl.share)} of total${chg ? `, ${chg} ${previousLabel}` : ""}. ${i + 1} of ${slices.length}.`);
  };

  const setHover = (id: string | null, source: "pointer" | "keyboard" | "prop" | null) => {
    const s = st.current;
    if (s.hoverId === id) return;
    s.hoverId = id;
    writeCentre(id);
    writeRows(id);
    if (id !== null && source === "keyboard") {
      const i = slices.findIndex((x) => x.id === id);
      if (i >= 0) announce(slices[i], i);
    }
    if (source !== "prop") onActiveChange?.(id);
    wake();
  };

  // Content and highlight follow data changes; an active slice that left the data clears.
  useLayoutEffect(() => {
    const s = st.current;
    if (s.hoverId !== null && !slices.some((x) => x.id === s.hoverId)) s.hoverId = null;
    writeCentre(s.hoverId);
    writeRows(s.hoverId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slices, total, formatValue, formatShare, centerLabel, previousLabel]);

  useEffect(() => {
    wake();
  }, [slices, pal, reduce, inner, wake]);

  useEffect(() => {
    if (activeId === undefined) return;
    setHover(activeId !== null && slices.some((x) => x.id === activeId) ? activeId : null, "prop");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, slices]);

  const hitTest = (clientX: number, clientY: number): string | null => {
    const rect = rectRef.current ?? ringRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const { cx, cy, r0, r1 } = st.current.geom;
    const dx = clientX - rect.left - cx;
    const dy = clientY - rect.top - cy;
    const rho = Math.hypot(dx, dy);
    // Generous ring: a little inside the hole and past the pushed-out edge.
    if (rho < r0 - 8 || rho > r1 + PUSH + 8) return null;
    let f = (Math.atan2(dy, dx) - TOP) / TAU;
    f -= Math.floor(f);
    for (const d of st.current.disp.values()) if (f >= d.t0 && f < d.t1 && slices.some((x) => x.id === d.id)) return d.id;
    return null;
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => setHover(hitTest(e.clientX, e.clientY), "pointer");

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = slices.length;
    if (!n) return;
    const cur = slices.findIndex((x) => x.id === st.current.hoverId);
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = cur < 0 ? 0 : (cur + 1) % n;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = cur < 0 ? n - 1 : (cur - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else if (e.key === "Escape") {
      if (st.current.hoverId !== null) {
        e.preventDefault();
        setHover(null, null);
      }
      return;
    }
    if (next === null) return;
    e.preventDefault();
    setHover(slices[next].id, "keyboard");
  };

  const tableCols = useMemo(() => [legendTitle, "Value", "Share", ...(hasPrev ? ["Previous", `Change ${previousLabel}`] : [])], [legendTitle, hasPrev, previousLabel]);
  const tableRows = useMemo(() => {
    const out: (string | number)[][] = [];
    const row = (label: string, v: number, share: number, prev: number | null) => [
      label,
      formatValue(v),
      formatShare(share),
      ...(hasPrev ? [prev === null ? "–" : formatValue(prev), changeText(v, prev, pctChange) || "–"] : []),
    ];
    for (const sl of slices) {
      out.push(row(sl.other ? `${sl.label} (${sl.members.length} parts)` : sl.label, sl.value, sl.share, sl.previous));
      for (const m of sl.members) out.push(row(`${m.label} (in ${sl.label})`, m.value, total > 0 ? m.value / total : 0, m.previous));
    }
    out.push(row("Total", total, total > 0 ? 1 : 0, prevTotal));
    return out;
  }, [slices, total, prevTotal, hasPrev, formatValue, formatShare]);

  const largest = slices.reduce<Slice | null>((a, b) => (!a || b.value > a.value ? b : a), null);
  const summary =
    total > 0 && largest
      ? `${ariaLabel}: total ${formatValue(total)} across ${slices.length} ${slices.length === 1 ? "part" : "parts"}; largest ${largest.label} at ${formatShare(largest.share)}.`
      : `${ariaLabel}: no data.`;

  const showLegend = legend !== "none";
  const side = legend === "auto";
  const showCentre = inner >= 0.5;

  return (
    <div
      ref={rootRef}
      data-loop="idle"
      className={cn("@container relative w-full select-none text-[color:var(--bjork-text)]", className)}
      style={{ ...vars, "--donut-d": `${height}px` } as CSSProperties}
    >
      <div className={cn("flex flex-col items-center gap-6", side && "@[600px]:flex-row @[600px]:items-center @[600px]:justify-center @[600px]:gap-10")}>
        <div
          ref={ringRef}
          role="group"
          aria-roledescription="chart"
          aria-label={`${ariaLabel}. Arrow keys step through the slices.`}
          tabIndex={0}
          onPointerEnter={() => {
            if (ringRef.current) rectRef.current = ringRef.current.getBoundingClientRect();
          }}
          onPointerMove={onPointerMove}
          onPointerDown={(e) => {
            if (ringRef.current) rectRef.current = ringRef.current.getBoundingClientRect();
            if (e.pointerType === "touch") onPointerMove(e);
          }}
          onPointerLeave={(e) => {
            rectRef.current = null;
            // Touch fires leave on lift; a tap keeps its slice until the next tap or blur.
            if (e.pointerType !== "touch") setHover(null, null);
          }}
          onBlur={() => setHover(null, null)}
          onKeyDown={onKeyDown}
          className={cn(
            "@container relative aspect-square shrink-0 touch-pan-y rounded-full",
            "w-[min(var(--donut-d),78cqw)]",
            side && "@[600px]:w-[min(var(--donut-d),46cqw)]",
            chartFocusRing,
          )}
        >
          <div ref={hostRef} className="absolute inset-0">
            <canvas ref={canvasRef} role="img" aria-label={summary} className="pointer-events-none absolute left-0 top-0" />
          </div>
          {showCentre && (
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-[1.6cqw] text-center" style={{ width: `${(inner * 78).toFixed(1)}cqw` }}>
                <span ref={cLabel} className="max-w-full truncate font-bjork-alpha text-[clamp(10px,5.2cqw,13px)] font-medium leading-tight text-[color:var(--bjork-text-muted)]" />
                <span
                  ref={cValue}
                  className="max-w-full truncate font-mono leading-none tabular-nums text-[color:var(--bjork-text)] [text-box:trim-both_cap_alphabetic]"
                  style={{ fontSize: `clamp(14px, ${(inner * 16.5).toFixed(2)}cqw, 30px)` }}
                />
                <span ref={cSub} className="max-w-full truncate font-mono text-[clamp(10px,4.6cqw,12px)] leading-tight tabular-nums text-[color:var(--bjork-text-medium)]" />
              </div>
            </div>
          )}
        </div>

        {showLegend && (
          <div
            aria-hidden="true"
            className={cn(
              "grid w-full min-w-0 max-w-[440px] gap-x-3",
              hasPrev ? "grid-cols-[8px_minmax(0,1fr)_auto_auto_auto]" : "grid-cols-[8px_minmax(0,1fr)_auto_auto]",
              side && "@[600px]:max-w-[400px] @[600px]:flex-1",
            )}
          >
            <div className="col-span-full grid grid-cols-subgrid items-end px-2 pb-2 font-mono text-[10px] uppercase leading-none tracking-[0.08em] text-[color:var(--bjork-text-soft)] [text-box:trim-both_cap_alphabetic]">
              <span />
              <span className="truncate">{legendTitle}</span>
              <span className="text-right">Value</span>
              <span className="text-right">Share</span>
              {hasPrev && <span className="text-right">{previousLabel}</span>}
            </div>
            {slices.map((sl, i) => (
              <div
                key={sl.id}
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                onPointerEnter={(e) => {
                  if (e.pointerType !== "touch") setHover(sl.id, "pointer");
                }}
                onPointerLeave={(e) => {
                  if (e.pointerType !== "touch") setHover(null, null);
                }}
                onPointerDown={(e) => {
                  if (e.pointerType === "touch") setHover(st.current.hoverId === sl.id ? null : sl.id, "pointer");
                }}
                className="col-span-full grid grid-cols-subgrid items-center rounded-[6px] px-2 py-[7px] transition-[opacity,background-color] duration-150 ease-out data-[state=active]:bg-[color:var(--bjork-surface-hover)] data-[state=dim]:opacity-45"
              >
                <LegendKey color={sl.color} />
                <span className="flex min-w-0 items-baseline gap-1.5 font-bjork-alpha text-[12px] font-medium leading-4 text-[color:var(--bjork-text-medium)]">
                  <span className="truncate">{sl.label}</span>
                  {sl.other && <span className="shrink-0 font-mono text-[10px] tabular-nums text-[color:var(--bjork-text-soft)]">+{sl.members.length}</span>}
                </span>
                <span className="text-right font-mono text-[12px] leading-4 tabular-nums text-[color:var(--bjork-text)]">{formatValue(sl.value)}</span>
                <span className="text-right font-mono text-[12px] leading-4 tabular-nums text-[color:var(--bjork-text-muted)]">{formatShare(sl.share)}</span>
                {hasPrev && <span className="text-right font-mono text-[12px] leading-4 tabular-nums text-[color:var(--bjork-text-muted)]">{changeText(sl.value, sl.previous, pctChange) || "–"}</span>}
              </div>
            ))}
            <div className="col-span-full mt-1 grid grid-cols-subgrid items-center border-t border-[color:var(--bjork-hair)] px-2 pt-[9px]">
              <span />
              <span className="truncate font-bjork-alpha text-[12px] font-medium leading-4 text-[color:var(--bjork-text)]">Total</span>
              <span className="text-right font-mono text-[12px] leading-4 tabular-nums text-[color:var(--bjork-text)]">{formatValue(total)}</span>
              <span className="text-right font-mono text-[12px] leading-4 tabular-nums text-[color:var(--bjork-text-muted)]">{formatShare(total > 0 ? 1 : 0)}</span>
              {hasPrev && <span className="text-right font-mono text-[12px] leading-4 tabular-nums text-[color:var(--bjork-text-muted)]">{changeText(total, prevTotal, pctChange) || "–"}</span>}
            </div>
          </div>
        )}
      </div>
      <ChartTable caption={ariaLabel} columns={tableCols} rows={tableRows} />
      <ChartAnnouncer ref={announcer} />
    </div>
  );
}
