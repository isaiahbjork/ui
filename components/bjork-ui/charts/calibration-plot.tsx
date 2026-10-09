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
import { clamp, crisp, damp, withAlpha, formatNumber, formatPercent, formatFixed, formatSigned } from "@/components/bjork-ui/charts/_kit/scale";

export interface Forecast {
  /** Predicted probability, 0..1. */
  p: number;
  /** What happened: 1 or 0. */
  outcome: 0 | 1;
}

export interface CalibrationBin {
  lo: number;
  hi: number;
  /** Mean predicted probability in the bin. */
  p: number;
  /** Observed rate in the bin. */
  observed: number;
  n: number;
  ciLo: number;
  ciHi: number;
}

export interface CalibrationPlotProps {
  forecasts: Forecast[];
  /** Equal-width bin count (4 to 20). Controlled when set. */
  bins?: number;
  defaultBins?: number;
  onBinsChange?: (bins: number) => void;
  showHistogram?: boolean;
  /** Posed hover bin. */
  activeBin?: number | null;
  /** Fixed height. By default the plot stays square to the width. */
  height?: number;
  ariaLabel?: string;
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

const TOP = 34;
const LEFT = 44;
const RIGHT = 16;
const BOTTOM = 30;
const HIST_H = 40;
const HIST_GAP = 10;
const MOVE_TAU = 0.12;
const DIAG_MS = 380;
const RISE_MS = 520;
const TICKS = [0, 0.25, 0.5, 0.75, 1];
const ATTRACT_STEP_MS = 900;
const ATTRACT_IDLE_MS = 4000;

const clock = () => performance.now();

// Wilson score interval, 95%.
function wilson(k: number, n: number): [number, number] {
  if (!n) return [0, 1];
  const z = 1.96;
  const ph = k / n;
  const d = 1 + (z * z) / n;
  const c = (ph + (z * z) / (2 * n)) / d;
  const m = (z * Math.sqrt((ph * (1 - ph)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - m), Math.min(1, c + m)];
}

/**
 * Equal-width reliability bins over [0, 1] (p = 1 lands in the last bin). Each bin reports its mean
 * forecast, observed rate and a 95% Wilson interval; empty bins are dropped. Brier is the mean squared
 * error of the forecasts; ECE is the count-weighted mean |observed − mean forecast| over the bins.
 * Forecasts with a non-finite p are ignored, and p is clamped to [0, 1].
 */
export function calibrate(forecasts: Forecast[], count: number): { bins: CalibrationBin[]; brier: number; ece: number; n: number } {
  count = Math.max(1, Math.round(count) || 1);
  const sums = Array.from({ length: count }, () => ({ p: 0, k: 0, n: 0 }));
  let brier = 0;
  let N = 0;
  for (const f of forecasts) {
    if (!Number.isFinite(f.p)) continue;
    const p = clamp(f.p, 0, 1);
    const o = f.outcome ? 1 : 0;
    const b = Math.min(count - 1, Math.floor(p * count));
    sums[b].p += p;
    sums[b].k += o;
    sums[b].n++;
    brier += (p - o) ** 2;
    N++;
  }
  let ece = 0;
  const bins: CalibrationBin[] = [];
  sums.forEach((s, i) => {
    if (!s.n) return;
    const p = s.p / s.n;
    const observed = s.k / s.n;
    const [ciLo, ciHi] = wilson(s.k, s.n);
    ece += (s.n / Math.max(1, N)) * Math.abs(observed - p);
    bins.push({ lo: i / count, hi: (i + 1) / count, p, observed, n: s.n, ciLo, ciHi });
  });
  return { bins, brier: N ? brier / N : NaN, ece, n: N };
}

interface Run {
  keyed: Map<string, { x: number; y: number; lo: number; hi: number; n: number }>;
  enter: number;
  enterKey: string;
  hover: number | null;
  source: "pointer" | "keyboard" | "prop" | "attract" | null;
  plot: { l: number; t: number; s: number };
  xCache: string[];
  yCache: string[];
  lastInput: number;
  attractAt: number;
}

export function CalibrationPlot({
  forecasts,
  bins: binsProp,
  defaultBins = 10,
  onBinsChange,
  showHistogram = true,
  activeBin,
  height,
  ariaLabel = "Calibration",
  tone: toneProp,
  attract = false,
  className,
}: CalibrationPlotProps) {
  const { pal, reduce, vars } = useChartTheme(toneProp);
  const announcer = useRef<AnnouncerHandle>(null);
  const tipRef = useRef<TooltipHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const xPool = useRef<(HTMLSpanElement | null)[]>([]);
  const yPool = useRef<(HTMLSpanElement | null)[]>([]);
  const cornerA = useRef<HTMLSpanElement>(null);
  const cornerB = useRef<HTMLSpanElement>(null);
  const diagRef = useRef<HTMLSpanElement>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const [binsState, setBinsState] = useState(defaultBins);
  const binCount = binsProp ?? binsState;

  const cal = useMemo(() => calibrate(forecasts, binCount), [forecasts, binCount]);

  const cfg = useRef({ cal, binCount, showHistogram, reduce, pal, attract });
  useEffect(() => {
    cfg.current = { cal, binCount, showHistogram, reduce, pal, attract };
  });

  const st = useRef<Run>({ keyed: new Map(), enter: 0, enterKey: "", hover: activeBin ?? null, source: activeBin != null ? "prop" : null, plot: { l: 0, t: 0, s: 0 }, xCache: [], yCache: [], lastInput: 0, attractAt: 0 });
  const hoverRef = useRef<(i: number | null, source: Run["source"]) => void>(() => {});

  const { rootRef, hostRef, canvasRef, size, wake } = useChartCanvas(({ ctx, w, h, dt }) => {
    const s = st.current;
    const c = cfg.current;
    const p = c.pal;
    const B = c.cal.bins;
    const histSpace = c.showHistogram ? HIST_H + HIST_GAP : 0;
    const size = Math.max(80, Math.min(w - LEFT - RIGHT, h - TOP - BOTTOM - histSpace));
    const l = Math.round(LEFT + (w - LEFT - RIGHT - size) / 2);
    const t = TOP;
    s.plot = { l, t, s: size };
    const X = (v: number) => l + v * size;
    const Y = (v: number) => t + (1 - v) * size;

    // Entrance: the diagonal draws, then each point rises off it to its observed rate.
    const total = DIAG_MS + RISE_MS + B.length * 40;
    s.enter = c.reduce ? 1 : Math.min(1, s.enter + (dt * 1000) / total);
    const ms = s.enter * total;
    const diag = easeOut(clamp(ms / DIAG_MS, 0, 1));
    const riseOf = (i: number) => (s.enter >= 1 ? 1 : easeOut(clamp((ms - DIAG_MS - i * 40) / RISE_MS, 0, 1)));

    // Bins are keyed by their range: a rebin starts new points on the diagonal.
    let moving = false;
    const seen = new Set<string>();
    for (const b of B) {
      const key = `${b.lo.toFixed(4)}`;
      seen.add(key);
      const cur = s.keyed.get(key);
      // New bins start on the diagonal and rise to their observed rate.
      if (!cur) s.keyed.set(key, { x: b.p, y: b.p, lo: b.p, hi: b.p, n: b.n });
      const k = s.keyed.get(key)!;
      if (c.reduce) {
        Object.assign(k, { x: b.p, y: b.observed, lo: b.ciLo, hi: b.ciHi, n: b.n });
        continue;
      }
      k.x = damp(k.x, b.p, MOVE_TAU, dt);
      k.y = damp(k.y, b.observed, MOVE_TAU, dt);
      k.lo = damp(k.lo, b.ciLo, MOVE_TAU, dt);
      k.hi = damp(k.hi, b.ciHi, MOVE_TAU, dt);
      k.n = b.n;
      if (Math.abs(k.x - b.p) + Math.abs(k.y - b.observed) + Math.abs(k.lo - b.ciLo) + Math.abs(k.hi - b.ciHi) > 1e-4) moving = true;
    }
    for (const key of [...s.keyed.keys()]) if (!seen.has(key)) s.keyed.delete(key);

    // Frame, grid and labels.
    ctx.strokeStyle = p.hair;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const v of TICKS) {
      ctx.moveTo(crisp(X(v)), t);
      ctx.lineTo(crisp(X(v)), t + size);
      ctx.moveTo(l, crisp(Y(v)));
      ctx.lineTo(l + size, crisp(Y(v)));
    }
    ctx.stroke();
    const histTop = t + size + HIST_GAP;
    writeLabels(xPool.current, s.xCache, TICKS.map((v) => ({ text: formatPercent(v, 0), x: X(v), y: (c.showHistogram ? histTop + HIST_H : t + size) + 13, ax: -50 })));
    writeLabels(yPool.current, s.yCache, TICKS.map((v) => ({ text: formatPercent(v, 0), x: l - 8, y: Y(v), ax: -100 })));
    if (cornerA.current) cornerA.current.style.transform = `translate3d(${(l + 8).toFixed(1)}px, ${(t + 10).toFixed(1)}px, 0)`;
    if (cornerB.current) cornerB.current.style.transform = `translate3d(${(l + size - 8).toFixed(1)}px, ${(t + size - 10).toFixed(1)}px, 0) translate(-100%, -100%)`;

    // The perfect-calibration diagonal.
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = p.textSoft;
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    ctx.lineTo(X(diag), Y(diag));
    ctx.stroke();
    ctx.restore();
    if (diagRef.current) {
      diagRef.current.style.opacity = String(diag);
      // Rotated onto the diagonal, then lifted off it so the dashes stay clear.
      diagRef.current.style.transform = `translate3d(${X(0.84).toFixed(1)}px, ${Y(0.84).toFixed(1)}px, 0) rotate(-45deg) translate(-50%, -160%)`;
    }

    const pts = B.map((b) => s.keyed.get(`${b.lo.toFixed(4)}`)!).filter(Boolean);
    const yAt = (i: number) => {
      const k = pts[i];
      const r = riseOf(i);
      return k.x + (k.y - k.x) * r; // rises from the diagonal
    };

    // Count histogram.
    if (c.showHistogram) {
      const maxN = Math.max(1, ...B.map((b) => b.n));
      for (let i = 0; i < B.length; i++) {
        const b = B[i];
        const x0 = X(b.lo) + 1;
        const bw = Math.max(1, X(b.hi) - X(b.lo) - 2);
        const hh = (b.n / maxN) * HIST_H * diag;
        ctx.fillStyle = withAlpha(p.text, s.hover === i ? 0.34 : 0.16);
        ctx.beginPath();
        ctx.roundRect(x0, histTop + HIST_H - hh, bw, hh, [2, 2, 0, 0]);
        ctx.fill();
      }
    }

    // Gap from the diagonal for the hovered bin.
    if (s.hover !== null && pts[s.hover]) {
      const k = pts[s.hover];
      ctx.save();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = p.accentInk;
      ctx.beginPath();
      ctx.moveTo(crisp(X(k.x)), Y(k.x));
      ctx.lineTo(crisp(X(k.x)), Y(yAt(s.hover)));
      ctx.stroke();
      ctx.restore();
    }

    // Wilson whiskers.
    ctx.strokeStyle = withAlpha(p.text, 0.42);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const k = pts[i];
      const r = riseOf(i);
      if (r <= 0) continue;
      const x = crisp(X(k.x));
      const lo = k.x + (k.lo - k.x) * r;
      const hi = k.x + (k.hi - k.x) * r;
      ctx.moveTo(x, Y(lo));
      ctx.lineTo(x, Y(hi));
      ctx.moveTo(x - 3, crisp(Y(lo)));
      ctx.lineTo(x + 3, crisp(Y(lo)));
      ctx.moveTo(x - 3, crisp(Y(hi)));
      ctx.lineTo(x + 3, crisp(Y(hi)));
    }
    ctx.stroke();

    // Reliability curve and points.
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 1.75;
    ctx.lineJoin = "round";
    ctx.beginPath();
    pts.forEach((k, i) => (i === 0 ? ctx.moveTo(X(k.x), Y(yAt(i))) : ctx.lineTo(X(k.x), Y(yAt(i)))));
    if (diag >= 1) ctx.stroke();
    pts.forEach((k, i) => {
      if (riseOf(i) <= 0 && s.enter < 1) return;
      const hov = s.hover === i;
      ctx.beginPath();
      ctx.arc(X(k.x), Y(yAt(i)), hov ? 5.5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = p.accent;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = p.stage;
      ctx.stroke();
    });

    const tip = tipRef.current;
    if (tip?.el && s.hover !== null && pts[s.hover]) {
      const k = pts[s.hover];
      const pos = placeTooltip(X(k.x), Y(yAt(s.hover)), tip.size.w, tip.size.h, w, h, 12);
      tip.el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
    }

    if (c.attract && !c.reduce && B.length && (!s.lastInput || clock() - s.lastInput > ATTRACT_IDLE_MS)) {
      if (clock() - s.attractAt > ATTRACT_STEP_MS) {
        s.attractAt = clock();
        hoverRef.current(s.hover === null ? 0 : (s.hover + 1) % B.length, "attract");
      }
      return true;
    }
    return moving || s.enter < 1;
  });

  const tooltipFor = (i: number): TooltipContent | null => {
    const b = cal.bins[i];
    if (!b) return null;
    const gap = b.observed - b.p;
    return {
      key: `${i}|${binCount}|${pal.text}`,
      title: `Forecasts ${formatPercent(b.lo, 0)}–${formatPercent(b.hi, 0)}`,
      rows: [
        { key: "o", label: "Happened", value: formatPercent(b.observed, 1), color: pal.accent },
        { key: "p", label: "Predicted", value: formatPercent(b.p, 1) },
        // Over-confident means the forecasts were more extreme than what happened, on either side of 50%.
        { key: "g", label: Math.abs(gap) < 0.005 ? "On target" : Math.abs(b.p - 0.5) > Math.abs(b.observed - 0.5) ? "Over-confident" : "Under-confident", value: `${formatSigned(gap * 100, (n) => formatNumber(n, 1))} pts`, strong: false },
        { key: "c", label: "95% interval", value: `${formatPercent(b.ciLo, 0)}–${formatPercent(b.ciHi, 0)}`, strong: false },
        { key: "n", label: "Forecasts", value: formatNumber(b.n, 0), strong: false },
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
      const b = cal.bins[i];
      announcer.current?.say(`Forecasts from ${formatPercent(b.lo, 0)} to ${formatPercent(b.hi, 0)}: predicted ${formatPercent(b.p, 1)}, happened ${formatPercent(b.observed, 1)}, ${b.n} forecasts`);
    }
    wake();
  };
  useEffect(() => {
    hoverRef.current = setHover;
  });

  useEffect(() => {
    if (st.current.hover !== null) tipRef.current?.set(tooltipFor(st.current.hover));
    wake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cal, showHistogram, pal, reduce, attract, wake]);

  useEffect(() => {
    if (activeBin === undefined) return;
    setHover(activeBin, activeBin === null ? null : "prop");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBin, pal]);

  const setBins = (n: number) => {
    const next = clamp(n, 4, 20);
    if (binsProp === undefined) setBinsState(next);
    onBinsChange?.(next);
    announcer.current?.say(`${next} bins`);
    setHover(null, null);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    st.current.lastInput = clock();
    const rect = rectRef.current ?? wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const s = st.current;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { l, t, s: size } = s.plot;
    const bottom = t + size + (showHistogram ? HIST_GAP + HIST_H : 0);
    if (x < l - 6 || x > l + size + 6 || y < t - 6 || y > bottom) {
      setHover(null, null);
      return;
    }
    // Nearest bin by predicted probability.
    const v = (x - l) / size;
    let best = -1;
    let bd = Infinity;
    cal.bins.forEach((b, i) => {
      const d = Math.abs(b.p - v);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(best >= 0 ? best : null, "pointer");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = st.current;
    s.lastInput = clock();
    const n = cal.bins.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const cur = s.hover !== null && s.source !== "attract" ? s.hover : e.key === "ArrowRight" ? -1 : n;
      setHover(clamp(cur + (e.key === "ArrowRight" ? 1 : -1), 0, n - 1), "keyboard");
    } else if ((e.key === "Home" || e.key === "End") && n) {
      e.preventDefault();
      setHover(e.key === "Home" ? 0 : n - 1, "keyboard");
    } else if (e.key === "[" || e.key === "]") {
      e.preventDefault();
      setBins(binCount + (e.key === "[" ? -1 : 1));
    } else if (e.key === "Escape") setHover(null, null);
  };

  const autoSize = Math.min(Math.max(80, (size.width || 480) - LEFT - RIGHT), 520);
  const rootHeight = height ?? TOP + autoSize + (showHistogram ? HIST_GAP + HIST_H : 0) + BOTTOM;

  const tableRows = useMemo(
    () => cal.bins.map((b) => [`${formatPercent(b.lo, 0)} to ${formatPercent(b.hi, 0)}`, formatPercent(b.p, 1), formatPercent(b.observed, 1), `${formatPercent(b.ciLo, 0)} to ${formatPercent(b.ciHi, 0)}`, b.n]),
    [cal],
  );
  const tableCols = useMemo(() => ["Bin", "Predicted", "Observed", "95% interval", "Forecasts"], []);

  return (
    <div ref={rootRef} data-loop="idle" className={cn("relative w-full select-none text-[color:var(--bjork-text)]", className)} style={{ ...vars, height: rootHeight }}>
      <div
        ref={wrapperRef}
        role="group"
        aria-roledescription="chart"
        aria-label={`${ariaLabel}. Left and right move between bins, brackets change the bin count.`}
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
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`${ariaLabel}: Brier score ${formatFixed(cal.brier, 3)}, expected calibration error ${formatPercent(cal.ece, 1)}, ${cal.n} forecasts`}
            className="pointer-events-none absolute left-0 top-0"
          />
        </div>
        {/* Readout: proper scores for the whole set. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center gap-4 font-mono text-[11px] leading-none tabular-nums text-[color:var(--bjork-text-soft)]">
          <span>
            Brier <span className="text-[color:var(--bjork-text)]">{formatFixed(cal.brier, 3)}</span>
          </span>
          <span>
            ECE <span className="text-[color:var(--bjork-accent-ink)]">{formatPercent(cal.ece, 1)}</span>
          </span>
          <span>
            n <span className="text-[color:var(--bjork-text)]">{formatNumber(cal.n, 0)}</span>
          </span>
        </div>
        <span ref={cornerA} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 font-mono text-[9px] uppercase leading-none tracking-[0.1em] text-[color:var(--bjork-text-faint)] [text-box:trim-both_cap_alphabetic]">
          Under-forecast
        </span>
        <span ref={cornerB} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 font-mono text-[9px] uppercase leading-none tracking-[0.1em] text-[color:var(--bjork-text-faint)] [text-box:trim-both_cap_alphabetic]">
          Over-forecast
        </span>
        <span ref={diagRef} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 origin-top-left font-mono text-[9px] uppercase leading-none tracking-[0.1em] text-[color:var(--bjork-text-soft)] opacity-0 [text-box:trim-both_cap_alphabetic]">
          Perfect
        </span>
        <LabelPool count={TICKS.length} pool={xPool} />
        <LabelPool count={TICKS.length} pool={yPool} />
        <HoverTooltip ref={tipRef} onMeasure={wake} />
      </div>
      <ChartTable caption={ariaLabel} columns={tableCols} rows={tableRows} />
      <ChartAnnouncer ref={announcer} />
    </div>
  );
}

// Seeded demo forecasts: a forecaster who is overconfident at the extremes, or a recalibrated one.
export function createForecasts(seed: number, n = 3000, recalibrated = false): Forecast[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, () => {
    const p = clamp(0.02 + 0.96 * (rnd() * 0.55 + rnd() * 0.45), 0.01, 0.99);
    // The true chance is pulled toward 50%: forecasts near the edges were too sure.
    const truth = recalibrated ? p : 0.5 + (p - 0.5) * 0.72;
    return { p, outcome: rnd() < truth ? 1 : 0 };
  });
}
