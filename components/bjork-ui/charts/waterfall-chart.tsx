"use client";

import { useEffect, useMemo, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useChartCanvas, easeOut, hatchPattern, roundRectPath, writeLabels } from "@/components/bjork-ui/charts/_kit/canvas";
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

export interface WaterfallStep {
  id: string;
  label: string;
  value: number;
  /** "delta" moves the running total. "total" shows the running total as a full bar (value ignored). */
  kind?: "delta" | "total";
}

export interface WaterfallChartProps {
  steps: WaterfallStep[];
  /** Opening total, drawn as the first full bar. */
  start?: { label: string; value: number };
  /** Label of the closing total bar, appended unless the last step is already a total. */
  endLabel?: string;
  /** A counterfactual closing total, drawn as a dashed ghost beside the net. */
  ghost?: { label: string; value: number } | null;
  formatValue?: (v: number) => string;
  /** Posed hover. */
  activeId?: string | null;
  height?: number;
  ariaLabel?: string;
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

const PAD_TOP = 30;
const PAD_BOTTOM = 40;
const PAD_BOTTOM_TILT = 64;
const PAD_LEFT = 44;
const PAD_RIGHT = 10;
const STEP_MS = 360;
const STAGGER_MS = 90;
const VAL_TAU = 0.12;
const Y_LABELS = 7;
const ATTRACT_STEP_MS = 1300;
const ATTRACT_IDLE_MS = 4000;

const clock = () => performance.now();
const defaultFormatValue = (v: number) => formatCompact(v, 1);

interface Bar {
  id: string;
  label: string;
  kind: "start" | "delta" | "total" | "end" | "ghost";
  from: number;
  to: number;
  value: number;
}

function buildBars(steps: WaterfallStep[], start: WaterfallChartProps["start"], endLabel: string, ghost: WaterfallChartProps["ghost"]): Bar[] {
  const bars: Bar[] = [];
  let run = 0;
  if (start) {
    bars.push({ id: "__start", label: start.label, kind: "start", from: 0, to: start.value, value: start.value });
    run = start.value;
  }
  for (const s of steps) {
    if (s.kind === "total") bars.push({ id: s.id, label: s.label, kind: "total", from: 0, to: run, value: run });
    else {
      bars.push({ id: s.id, label: s.label, kind: "delta", from: run, to: run + s.value, value: s.value });
      run += s.value;
    }
  }
  if (!steps.length || steps[steps.length - 1].kind !== "total") bars.push({ id: "__end", label: endLabel, kind: "end", from: 0, to: run, value: run });
  else bars[bars.length - 1].kind = "end";
  if (ghost) bars.push({ id: "__ghost", label: ghost.label, kind: "ghost", from: 0, to: ghost.value, value: ghost.value });
  return bars;
}

interface Run {
  enter: number;
  dFrom: number[];
  dTo: number[];
  ready: boolean;
  lo: number;
  hi: number;
  hover: number | null;
  source: "pointer" | "keyboard" | "prop" | "attract" | null;
  plot: { l: number; r: number; t: number; b: number; band: number };
  yCache: string[];
  lastInput: number;
  attractAt: number;
}

export function WaterfallChart({
  steps,
  start,
  endLabel = "Net",
  ghost = null,
  formatValue = defaultFormatValue,
  activeId,
  height = 340,
  ariaLabel = "Waterfall",
  tone: toneProp,
  attract = false,
  className,
}: WaterfallChartProps) {
  const { pal, reduce, vars } = useChartTheme(toneProp);
  const announcer = useRef<AnnouncerHandle>(null);
  const tipRef = useRef<TooltipHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const nameRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const valueRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const yPool = useRef<(HTMLSpanElement | null)[]>([]);
  const rectRef = useRef<DOMRect | null>(null);

  const bars = useMemo(() => buildBars(steps, start, endLabel, ghost), [steps, start, endLabel, ghost]);
  const fmtBar = (b: Bar) => (b.kind === "delta" ? formatSigned(b.value, formatValue) : formatValue(b.value));

  const cfg = useRef({ bars, reduce, pal, attract, formatValue });
  useEffect(() => {
    cfg.current = { bars, reduce, pal, attract, formatValue };
  });

  const st = useRef<Run>({
    enter: 0,
    dFrom: [],
    dTo: [],
    ready: false,
    lo: 0,
    hi: 1,
    hover: null,
    source: null,
    plot: { l: 0, r: 0, t: 0, b: 0, band: 1 },
    yCache: [],
    lastInput: 0,
    attractAt: 0,
  });
  const hoverRef = useRef<(i: number | null, source: Run["source"]) => void>(() => {});

  const { rootRef, hostRef, canvasRef, wake } = useChartCanvas(({ ctx, w, h, dt }) => {
    const s = st.current;
    const c = cfg.current;
    const p = c.pal;
    const B = c.bars;
    const n = B.length;
    // Narrow bands tilt their labels, which needs a deeper bottom gutter.
    const tilt = (w - PAD_LEFT - PAD_RIGHT) / Math.max(1, n) < 60;
    const plot = { l: PAD_LEFT, r: w - PAD_RIGHT, t: PAD_TOP, b: h - (tilt ? PAD_BOTTOM_TILT : PAD_BOTTOM), band: 1 };
    plot.band = (plot.r - plot.l) / Math.max(1, n);
    s.plot = plot;

    let moving = false;
    for (let i = 0; i < n; i++) {
      if (!s.ready || c.reduce || s.dFrom[i] === undefined) {
        s.dFrom[i] = B[i].from;
        s.dTo[i] = B[i].to;
        continue;
      }
      s.dFrom[i] = damp(s.dFrom[i], B[i].from, VAL_TAU, dt);
      s.dTo[i] = damp(s.dTo[i], B[i].to, VAL_TAU, dt);
      const tol = 1e-4 * Math.max(1, Math.abs(s.hi - s.lo));
      if (Math.abs(s.dFrom[i] - B[i].from) + Math.abs(s.dTo[i] - B[i].to) > tol) moving = true;
    }
    s.dFrom.length = n;
    s.dTo.length = n;

    // Domain always includes zero.
    let lo = 0;
    let hi = 0;
    for (const b of B) {
      lo = Math.min(lo, b.from, b.to);
      hi = Math.max(hi, b.from, b.to);
    }
    const [nLo, nHi] = niceDomain(lo, hi + (hi - lo) * 0.06, 5);
    if (!s.ready || c.reduce) {
      s.lo = nLo;
      s.hi = nHi;
    } else {
      s.lo = damp(s.lo, nLo, VAL_TAU, dt);
      s.hi = damp(s.hi, nHi, VAL_TAU, dt);
      if (Math.abs(s.lo - nLo) + Math.abs(s.hi - nHi) > 1e-4 * (nHi - nLo)) moving = true;
    }
    s.ready = true;
    const yOf = (v: number) => plot.b - ((v - s.lo) / Math.max(1e-12, s.hi - s.lo)) * (plot.b - plot.t);

    // Cascade: each bar grows out of the previous running total, then its connector draws.
    const total = n * STAGGER_MS + STEP_MS + 200;
    s.enter = c.reduce ? 1 : Math.min(1, s.enter + (dt * 1000) / total);
    const ms = s.enter * total;
    const growOf = (i: number) => (s.enter >= 1 ? 1 : easeOut(clamp((ms - i * STAGGER_MS) / STEP_MS, 0, 1)));

    const ticks = niceTicks(s.lo, s.hi, 5);
    ctx.lineWidth = 1;
    ctx.strokeStyle = p.hair;
    ctx.beginPath();
    for (const v of ticks) {
      if (Math.abs(v) < 1e-9) continue;
      const y = crisp(yOf(v));
      ctx.moveTo(plot.l, y);
      ctx.lineTo(plot.r, y);
    }
    ctx.stroke();
    writeLabels(yPool.current, s.yCache, ticks.map((v) => ({ text: c.formatValue(v), x: plot.l - 8, y: yOf(v), ax: -100 })));

    const bw = Math.min(56, plot.band * 0.58);
    const hatch = hatchPattern(ctx, withAlpha(p.text, 0.42), 4, 1);
    const xc = (i: number) => plot.l + plot.band * (i + 0.5);

    for (let i = 0; i < n; i++) {
      const b = B[i];
      const g = growOf(i);
      if (g <= 0) continue;
      const from = s.dFrom[i];
      const to = from + (s.dTo[i] - from) * g;
      const yA = yOf(from);
      const yB = yOf(to);
      const top = Math.min(yA, yB);
      const hgt = Math.max(1, Math.abs(yB - yA));
      const x = Math.round(xc(i) - bw / 2);
      const up = to >= from;
      const hov = s.hover === i;
      const dim = s.hover !== null && !hov ? 0.55 : 1;
      ctx.globalAlpha = dim;
      ctx.beginPath();
      // Data end rounded, baseline square.
      if (up) roundRectPath(ctx, x, top, bw, hgt, 4, 0);
      else roundRectPath(ctx, x, top, bw, hgt, 0, 4);
      if (b.kind === "ghost") {
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = p.accentInk;
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = withAlpha(p.accent, 0.06);
        ctx.fill();
      } else if (b.kind === "end") {
        ctx.fillStyle = b.value >= 0 ? p.accent : p.error;
        ctx.fill();
      } else if (b.kind === "start" || b.kind === "total") {
        ctx.fillStyle = withAlpha(p.text, hov ? 0.82 : 0.7);
        ctx.fill();
      } else if (b.value >= 0) {
        ctx.fillStyle = withAlpha(p.text, hov ? 0.5 : 0.36);
        ctx.fill();
      } else {
        // Losses: an outlined, hatched bar, so they read as "taken away" without a second hue.
        ctx.fillStyle = withAlpha(p.text, 0.04);
        ctx.fill();
        if (hatch) {
          ctx.fillStyle = hatch;
          ctx.fill();
        }
        ctx.lineWidth = 1;
        ctx.strokeStyle = withAlpha(p.text, hov ? 0.75 : 0.5);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Connector to the next bar at the running level.
      if (i < n - 1 && B[i + 1].kind !== "ghost") {
        const nextG = clamp((growOf(i) - 0.6) / 0.4, 0, 1);
        if (nextG > 0) {
          const level = crisp(yOf(s.dTo[i]));
          const x0 = x + bw;
          const x1 = Math.round(xc(i + 1) - bw / 2);
          ctx.save();
          ctx.setLineDash([2, 3]);
          ctx.strokeStyle = p.textSoft;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x0, level);
          ctx.lineTo(x0 + (x1 - x0) * nextG, level);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Value at the data end, signed for deltas.
      const V = valueRefs.current[i];
      if (V) {
        V.style.opacity = String(clamp((g - 0.5) / 0.5, 0, 1) * dim);
        V.style.transform = `translate3d(${xc(i).toFixed(1)}px, ${(up ? top - 8 : top + hgt + 8).toFixed(1)}px, 0) translate(-50%, ${up ? "-100%" : "0"})`;
      }
      const N = nameRefs.current[i];
      if (N) {
        N.style.opacity = String(Math.min(1, g * 2) * dim);
        if (tilt) {
          // Right edge pinned under the bar centre, rotated about that corner.
          N.style.width = "auto";
          N.style.whiteSpace = "nowrap";
          N.style.transformOrigin = "100% 0";
          N.style.transform = `translate3d(${xc(i).toFixed(1)}px, ${(plot.b + 8).toFixed(1)}px, 0) translateX(-100%) rotate(-38deg)`;
        } else {
          N.style.width = `${(plot.band - 6).toFixed(0)}px`;
          N.style.whiteSpace = "";
          N.style.transformOrigin = "";
          N.style.transform = `translate3d(${xc(i).toFixed(1)}px, ${(plot.b + 10).toFixed(1)}px, 0) translateX(-50%)`;
        }
      }
    }

    // Zero line.
    ctx.strokeStyle = p.textFaint;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.l, crisp(yOf(0)));
    ctx.lineTo(plot.r, crisp(yOf(0)));
    ctx.stroke();

    const tip = tipRef.current;
    if (tip?.el && s.hover !== null && B[s.hover]) {
      const i = s.hover;
      const pos = placeTooltip(xc(i) + bw / 2, Math.min(yOf(s.dFrom[i]), yOf(s.dTo[i])), tip.size.w, tip.size.h, w, h, 10);
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
    const b = bars[i];
    if (!b) return null;
    if (b.kind === "delta")
      return {
        key: `${b.id}|${pal.text}`,
        title: b.label,
        rows: [
          { key: "v", label: b.value >= 0 ? "Adds" : "Takes", value: formatSigned(b.value, formatValue) },
          { key: "r", label: "Running", value: `${formatValue(b.from)} → ${formatValue(b.to)}`, strong: false },
        ],
      };
    const net = bars.find((x) => x.kind === "end");
    return {
      key: `${b.id}|${pal.text}`,
      title: b.label,
      rows: [
        { key: "v", label: b.kind === "ghost" ? "Would be" : "Total", value: formatValue(b.value), color: b.kind === "end" ? (b.value >= 0 ? pal.accent : pal.error) : undefined },
        ...(b.kind === "ghost" && net ? [{ key: "d", label: "Difference", value: formatSigned(b.value - net.value, formatValue), strong: false }] : []),
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
      const b = bars[i];
      announcer.current?.say(b.kind === "delta" ? `${b.label}: ${formatSigned(b.value, formatValue)}, running total ${formatValue(b.to)}` : `${b.label}: ${formatValue(b.value)}`);
    }
    wake();
  };
  useEffect(() => {
    hoverRef.current = setHover;
  });

  useEffect(() => {
    wake();
  }, [bars, pal, reduce, attract, wake]);

  useEffect(() => {
    if (activeId === undefined) return;
    const i = bars.findIndex((b) => b.id === activeId);
    setHover(i >= 0 ? i : null, i >= 0 ? "prop" : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, bars]);

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    st.current.lastInput = clock();
    const rect = rectRef.current ?? wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const s = st.current;
    const x = e.clientX - rect.left;
    if (x < s.plot.l || x > s.plot.r) {
      setHover(null, null);
      return;
    }
    setHover(clamp(Math.floor((x - s.plot.l) / s.plot.band), 0, bars.length - 1), "pointer");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = st.current;
    s.lastInput = clock();
    const n = bars.length;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const cur = s.hover !== null && s.source !== "attract" ? s.hover : e.key === "ArrowRight" ? -1 : n;
      setHover(clamp(cur + (e.key === "ArrowRight" ? 1 : -1), 0, n - 1), "keyboard");
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setHover(e.key === "Home" ? 0 : n - 1, "keyboard");
    } else if (e.key === "Escape") setHover(null, null);
  };

  const tableRows = useMemo(() => bars.map((b) => [b.label, b.kind === "delta" ? formatSigned(b.value, formatValue) : formatValue(b.value), formatValue(b.to)]), [bars, formatValue]);
  const tableCols = useMemo(() => ["Step", "Change", "Running total"], []);
  const net = bars.find((b) => b.kind === "end");

  return (
    <div ref={rootRef} data-loop="idle" className={cn("relative w-full select-none text-[color:var(--bjork-text)]", className)} style={{ ...vars, height }}>
      <div
        ref={wrapperRef}
        role="group"
        aria-roledescription="chart"
        aria-label={`${ariaLabel}. Left and right step through the bridge.`}
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
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`${ariaLabel}: ${bars.length} steps${net ? `, ${net.label.toLowerCase()} ${formatValue(net.value)}` : ""}`}
            className="pointer-events-none absolute left-0 top-0"
          />
        </div>
        <LabelPool count={Y_LABELS} pool={yPool} />
        {bars.map((b, i) => (
          <span
            key={`v-${b.id}`}
            ref={(el) => {
              valueRefs.current[i] = el;
            }}
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute left-0 top-0 whitespace-nowrap font-mono text-[11px] leading-none tabular-nums opacity-0 [text-box:trim-both_cap_alphabetic]",
              b.kind === "end" ? (b.value >= 0 ? "text-[color:var(--bjork-accent-ink)]" : "text-[color:var(--bjork-error)]") : b.kind === "ghost" ? "text-[color:var(--bjork-text-muted)]" : "text-[color:var(--bjork-text)]",
            )}
          >
            {fmtBar(b)}
          </span>
        ))}
        {bars.map((b, i) => (
          <span
            key={`n-${b.id}`}
            ref={(el) => {
              nameRefs.current[i] = el;
            }}
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute left-0 top-0 line-clamp-2 text-center font-bjork-alpha text-[11px] font-medium leading-[13px] opacity-0",
              b.kind === "end" ? "text-[color:var(--bjork-text)]" : "text-[color:var(--bjork-text-muted)]",
            )}
          >
            {b.label}
          </span>
        ))}
        <HoverTooltip ref={tipRef} onMeasure={wake} />
      </div>
      <ChartTable caption={ariaLabel} columns={tableCols} rows={tableRows} />
      <ChartAnnouncer ref={announcer} />
    </div>
  );
}
