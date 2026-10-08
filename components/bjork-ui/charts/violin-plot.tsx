"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
import { mulberry32, hashString } from "@/components/bjork-ui/_core/random";
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
import { clamp, crisp, damp, kde, niceDomain, niceTicks, quantile, silverman, withAlpha, formatNumber, gaussian } from "@/components/bjork-ui/charts/_kit/scale";

export interface ViolinGroup {
  id: string;
  label: string;
  values: number[];
}

export type ViolinMode = "violin" | "box" | "strip";

export interface ViolinPlotProps {
  groups: ViolinGroup[];
  mode?: ViolinMode;
  defaultMode?: ViolinMode;
  onModeChange?: (mode: ViolinMode) => void;
  /** Group drawn in the accent. */
  highlightId?: string | null;
  onHighlightChange?: (id: string | null) => void;
  yDomain?: [number, number];
  formatValue?: (v: number) => string;
  unit?: string;
  height?: number;
  ariaLabel?: string;
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

const PAD_TOP = 16;
const PAD_BOTTOM = 40;
const PAD_LEFT = 44;
const PAD_RIGHT = 12;
const PROFILE = 72;
const MODE_TAU = 0.16;
const ENTER_MS = 820;
const GROUP_ENTER_MS = 520;
const MAX_DOTS = 260;
const Y_LABELS = 7;
const ATTRACT_STEP_MS = 3200;
const ATTRACT_IDLE_MS = 4000;
const MODES: ViolinMode[] = ["violin", "box", "strip"];

const clock = () => performance.now();
const defaultFormatValue = (v: number) => formatNumber(v, 0);

interface GroupStats {
  id: string;
  label: string;
  n: number;
  sorted: number[];
  q1: number;
  med: number;
  q3: number;
  lo: number;
  hi: number;
  wLo: number;
  wHi: number;
  mean: number;
  profile: Float32Array; // density at PROFILE y samples across the domain
  outliers: number[];
  dots: { v: number; j: number }[]; // value and jitter in [-1, 1]
}

function computeViolinStats(groups: ViolinGroup[], yDomain: [number, number] | undefined) {
    let gLo = Infinity;
    let gHi = -Infinity;
    const base = groups.map((g) => {
      const sorted = g.values.filter(Number.isFinite).sort((a, b) => a - b);
      if (sorted.length) {
        gLo = Math.min(gLo, sorted[0]);
        gHi = Math.max(gHi, sorted[sorted.length - 1]);
      }
      return { g, sorted };
    });
    if (!Number.isFinite(gLo)) {
      gLo = 0;
      gHi = 1;
    }
    const [lo, hi] = yDomain ?? niceDomain(gLo, gHi, 6);
    let maxD = 1e-12;
    const out: GroupStats[] = base.map(({ g, sorted }) => {
      const n = sorted.length;
      const q1 = quantile(sorted, 0.25);
      const med = quantile(sorted, 0.5);
      const q3 = quantile(sorted, 0.75);
      const iqr = q3 - q1;
      const wLo = sorted.find((v) => v >= q1 - 1.5 * iqr) ?? q1;
      const wHi = [...sorted].reverse().find((v) => v <= q3 + 1.5 * iqr) ?? q3;
      const bw = silverman(sorted) || (hi - lo) / 30;
      const profile = new Float32Array(PROFILE);
      for (let k = 0; k < PROFILE; k++) {
        const v = lo + ((hi - lo) * k) / (PROFILE - 1);
        // Clip the density to the data range, so the violin never claims values nobody saw.
        profile[k] = v < sorted[0] - bw * 0.5 || v > sorted[n - 1] + bw * 0.5 ? 0 : kde(sorted, v, bw);
        maxD = Math.max(maxD, profile[k]);
      }
      const rnd = mulberry32(hashString(g.id));
      const step = Math.max(1, Math.ceil(n / MAX_DOTS));
      const dots: { v: number; j: number }[] = [];
      for (let i = 0; i < n; i += step) dots.push({ v: sorted[i], j: rnd() * 2 - 1 });
      return {
        id: g.id,
        label: g.label,
        n,
        sorted,
        q1,
        med,
        q3,
        lo: sorted[0] ?? 0,
        hi: sorted[n - 1] ?? 0,
        wLo,
        wHi,
        mean: n ? sorted.reduce((a, b) => a + b, 0) / n : 0,
        profile,
        outliers: sorted.filter((v) => v < wLo || v > wHi),
        dots,
      };
    });
    for (const s2 of out) for (let k = 0; k < PROFILE; k++) s2.profile[k] /= maxD;
    return { groups: out, lo, hi };
}

interface Run {
  enter: number;
  w: [number, number, number]; // violin, box, strip weights
  hover: number | null;
  source: "pointer" | "keyboard" | "attract" | null;
  probeY: number | null;
  plot: { l: number; r: number; t: number; b: number };
  yCache: string[];
  lastInput: number;
  attractAt: number;
  attractMode: number;
}

export function ViolinPlot({
  groups,
  mode: modeProp,
  defaultMode = "violin",
  onModeChange,
  highlightId: highlightProp,
  onHighlightChange,
  yDomain,
  formatValue = defaultFormatValue,
  unit = "",
  height = 320,
  ariaLabel = "Distribution by group",
  tone: toneProp,
  attract = false,
  className,
}: ViolinPlotProps) {
  const { pal, reduce, vars } = useChartTheme(toneProp);
  const announcer = useRef<AnnouncerHandle>(null);
  const tipRef = useRef<TooltipHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const yPool = useRef<(HTMLSpanElement | null)[]>([]);
  const rectRef = useRef<DOMRect | null>(null);
  const [modeState, setModeState] = useState<ViolinMode>(defaultMode);
  const mode = modeProp ?? modeState;
  const [hlState, setHlState] = useState<string | null>(null);
  const highlightId = highlightProp !== undefined ? highlightProp : hlState;

  const stats = useMemo(() => computeViolinStats(groups, yDomain), [groups, yDomain]);

  const cfg = useRef({ stats, mode, highlightId, reduce, pal, formatValue, unit, attract });
  useEffect(() => {
    cfg.current = { stats, mode, highlightId, reduce, pal, formatValue, unit, attract };
  });

  const modeIndex = (m: ViolinMode) => MODES.indexOf(m);
  const st = useRef<Run>({
    enter: 0,
    w: [mode === "violin" ? 1 : 0, mode === "box" ? 1 : 0, mode === "strip" ? 1 : 0],
    hover: null,
    source: null,
    probeY: null,
    plot: { l: 0, r: 0, t: 0, b: 0 },
    yCache: [],
    lastInput: 0,
    attractAt: 0,
    attractMode: modeIndex(mode),
  });

  const { rootRef, hostRef, canvasRef, wake } = useChartCanvas(({ ctx, w, h, dt }) => {
    const s = st.current;
    const c = cfg.current;
    const p = c.pal;
    const S = c.stats;
    const G = S.groups;
    const plot = { l: PAD_LEFT, r: w - PAD_RIGHT, t: PAD_TOP, b: h - PAD_BOTTOM };
    s.plot = plot;
    const yOf = (v: number) => plot.b - ((v - S.lo) / Math.max(1e-12, S.hi - S.lo)) * (plot.b - plot.t);
    const band = (plot.r - plot.l) / Math.max(1, G.length);
    const cx = (i: number) => plot.l + band * (i + 0.5);
    const maxHalf = Math.min(band * 0.38, 64);
    const boxHalf = Math.min(maxHalf * 0.55, 22);

    // Attract: cycle the modes.
    let mode = c.mode;
    if (c.attract && !c.reduce && (!s.lastInput || clock() - s.lastInput > ATTRACT_IDLE_MS)) {
      if (clock() - s.attractAt > ATTRACT_STEP_MS) {
        s.attractAt = clock();
        s.attractMode = (s.attractMode + 1) % MODES.length;
      }
      mode = MODES[s.attractMode];
    }

    let moving = false;
    const targets = [mode === "violin" ? 1 : 0, mode === "box" ? 1 : 0, mode === "strip" ? 1 : 0];
    for (let k = 0; k < 3; k++) {
      s.w[k] = c.reduce ? targets[k] : damp(s.w[k], targets[k], MODE_TAU, dt);
      if (Math.abs(s.w[k] - targets[k]) > 1e-3) moving = true;
      else s.w[k] = targets[k];
    }
    const [wV, wB, wS] = s.w;
    s.enter = c.reduce ? 1 : Math.min(1, s.enter + (dt * 1000) / ENTER_MS);
    const growOf = (i: number) => {
      if (s.enter >= 1) return 1;
      const delay = (i / Math.max(1, G.length)) * (ENTER_MS - GROUP_ENTER_MS);
      return easeOut(clamp((s.enter * ENTER_MS - delay) / GROUP_ENTER_MS, 0, 1));
    };

    // Grid.
    const ticks = niceTicks(S.lo, S.hi, 5);
    ctx.lineWidth = 1;
    ctx.strokeStyle = p.hair;
    ctx.beginPath();
    for (const v of ticks) {
      const y = crisp(yOf(v));
      ctx.moveTo(plot.l, y);
      ctx.lineTo(plot.r, y);
    }
    ctx.stroke();
    writeLabels(yPool.current, s.yCache, ticks.map((v) => ({ text: c.formatValue(v), x: plot.l - 8, y: yOf(v), ax: -100 })));

    for (let i = 0; i < G.length; i++) {
      const g = G[i];
      if (!g.n) continue;
      const x = cx(i);
      const grow = growOf(i);
      const hl = g.id === c.highlightId;
      const hov = s.hover === i;
      const ink = hl ? p.accent : p.text;
      const dim = s.hover !== null && !hov ? 0.55 : 1;
      // Grow out of the median: vertical extent and width both scale in.
      const yMed = yOf(g.med);
      const vy = (v: number) => yMed + (yOf(v) - yMed) * grow;

      // The shape: violin profile morphing to the IQR rectangle, faded back in strip mode.
      // Samples are the profile grid plus exact q1/q3 edges, so the box corners stay square.
      const span = S.hi - S.lo;
      const profileAt = (v: number) => {
        const f = clamp(((v - S.lo) / span) * (PROFILE - 1), 0, PROFILE - 1);
        const k0 = Math.floor(f);
        const k1 = Math.min(PROFILE - 1, k0 + 1);
        return g.profile[k0] + (g.profile[k1] - g.profile[k0]) * (f - k0);
      };
      const halfAt = (v: number) => {
        const violin = profileAt(v) * maxHalf;
        const box = v >= g.q1 && v <= g.q3 ? boxHalf : 0;
        return (violin * (wV + wS) + box * wB) * grow;
      };
      const eps = span * 1e-4;
      const samples: number[] = [];
      for (let k = 0; k < PROFILE; k++) samples.push(S.lo + (span * k) / (PROFILE - 1));
      samples.push(g.q1 - eps, g.q1, g.q3, g.q3 + eps);
      samples.sort((a, b) => a - b);
      // Trim zero-width ends so the outline never runs down the axis.
      let first = samples.findIndex((v) => halfAt(v) > 0.05);
      let last = samples.length - 1 - [...samples].reverse().findIndex((v) => halfAt(v) > 0.05);
      if (first < 0) {
        first = 0;
        last = -1;
      } else {
        first = Math.max(0, first - 1);
        last = Math.min(samples.length - 1, last + 1);
      }
      const shapeAlpha = 1 - wS * 0.82;
      ctx.beginPath();
      for (let k = first; k <= last; k++) {
        const v = samples[k];
        if (k === first) ctx.moveTo(x + halfAt(v), vy(v));
        else ctx.lineTo(x + halfAt(v), vy(v));
      }
      for (let k = last; k >= first; k--) ctx.lineTo(x - halfAt(samples[k]), vy(samples[k]));
      ctx.closePath();
      ctx.globalAlpha = dim;
      ctx.fillStyle = withAlpha(ink, (hl ? 0.2 : 0.1) * shapeAlpha + (hov ? 0.05 : 0));
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = withAlpha(ink, (hl ? 0.8 : 0.45) * (0.4 + 0.6 * shapeAlpha));
      ctx.stroke();

      // Whiskers: hairlines with caps, strongest in box mode.
      const whiskA = (0.35 + 0.65 * wB) * grow;
      ctx.strokeStyle = withAlpha(ink, 0.6 * whiskA);
      ctx.beginPath();
      const capW = 6 + 4 * wB;
      ctx.moveTo(crisp(x - 0.5), vy(g.q3));
      ctx.lineTo(crisp(x - 0.5), vy(g.wHi));
      ctx.moveTo(crisp(x - 0.5), vy(g.q1));
      ctx.lineTo(crisp(x - 0.5), vy(g.wLo));
      ctx.moveTo(x - capW / 2, crisp(vy(g.wHi)));
      ctx.lineTo(x + capW / 2, crisp(vy(g.wHi)));
      ctx.moveTo(x - capW / 2, crisp(vy(g.wLo)));
      ctx.lineTo(x + capW / 2, crisp(vy(g.wLo)));
      ctx.stroke();

      // Inner IQR bar (violin and strip modes) and the median tick.
      const barHalf = 3 * (1 - wB) + boxHalf * wB;
      ctx.fillStyle = withAlpha(ink, (hl ? 0.9 : 0.62) * (1 - wB) + (hl ? 0.22 : 0.08) * wB);
      ctx.fillRect(x - barHalf, vy(g.q3), barHalf * 2, Math.max(1, vy(g.q1) - vy(g.q3)));
      ctx.fillStyle = wB > 0.5 ? ink : p.stage;
      const mh = 2;
      ctx.fillRect(x - barHalf - wB * 0, Math.round(yMed) - mh / 2, barHalf * 2, mh);
      // Mean as a small hollow diamond.
      if (grow >= 1) {
        const my = vy(g.mean);
        ctx.beginPath();
        ctx.moveTo(x, my - 3.5);
        ctx.lineTo(x + 3.5, my);
        ctx.lineTo(x, my + 3.5);
        ctx.lineTo(x - 3.5, my);
        ctx.closePath();
        ctx.fillStyle = p.stage;
        ctx.fill();
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = withAlpha(ink, 0.9);
        ctx.stroke();
      }

      // Outliers in box mode.
      if (wB > 0.01) {
        ctx.fillStyle = withAlpha(ink, 0.55 * wB);
        for (const v of g.outliers) {
          ctx.beginPath();
          ctx.arc(x, vy(v), 1.75, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Strip dots, jittered inside the violin's width at their value.
      if (wS > 0.01) {
        ctx.fillStyle = withAlpha(ink, (hl ? 0.75 : 0.5) * wS);
        for (const d of g.dots) {
          const k = clamp(Math.round(((d.v - S.lo) / (S.hi - S.lo)) * (PROFILE - 1)), 0, PROFILE - 1);
          const spread = Math.max(2, g.profile[k] * maxHalf * 0.92);
          ctx.beginPath();
          ctx.arc(x + d.j * spread * wS, vy(d.v), 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    // Value probe: a hairline at the pointer with the value in the gutter.
    const probe = probeRef.current;
    if (s.probeY !== null && s.source === "pointer" && s.probeY >= plot.t && s.probeY <= plot.b) {
      ctx.strokeStyle = p.textFaint;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plot.l, crisp(s.probeY));
      ctx.lineTo(plot.r, crisp(s.probeY));
      ctx.stroke();
      if (probe) {
        const v = S.lo + ((plot.b - s.probeY) / (plot.b - plot.t)) * (S.hi - S.lo);
        probe.textContent = c.formatValue(v);
        probe.style.opacity = "1";
        probe.style.transform = `translate3d(${(plot.l - 4).toFixed(1)}px, ${s.probeY.toFixed(1)}px, 0) translate(-100%, -50%)`;
      }
    } else if (probe) probe.style.opacity = "0";

    const tip = tipRef.current;
    if (tip?.el && s.hover !== null && G[s.hover]) {
      const g = G[s.hover];
      const pos = placeTooltip(cx(s.hover) + maxHalf * 0.6, yOf(g.q3), tip.size.w, tip.size.h, w, h, 10);
      tip.el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
    }

    return moving || s.enter < 1 || (c.attract && !c.reduce);
  });

  useEffect(() => {
    wake();
  }, [stats, mode, highlightId, pal, reduce, attract, wake]);

  const fmt = (v: number) => `${formatValue(v)}${unit ? ` ${unit}` : ""}`;
  // Percentile rank of a value inside a group.
  const rankOf = (g: GroupStats, v: number) => {
    let lo = 0;
    let hi = g.sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (g.sorted[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return Math.round((lo / Math.max(1, g.n)) * 100);
  };

  const tooltipFor = (i: number, probe: number | null): TooltipContent | null => {
    const g = stats.groups[i];
    if (!g) return null;
    const rows = [
      { key: "max", label: "Max", value: fmt(g.hi), strong: false },
      { key: "q3", label: "p75", value: fmt(g.q3) },
      { key: "med", label: "Median", value: fmt(g.med) },
      { key: "q1", label: "p25", value: fmt(g.q1) },
      { key: "min", label: "Min", value: fmt(g.lo), strong: false },
      { key: "mean", label: "Mean", value: fmt(g.mean), strong: false },
    ];
    if (probe !== null) rows.unshift({ key: "probe", label: `at ${fmt(probe)}`, value: `p${rankOf(g, probe)}`, strong: true });
    return { key: `${i}|${probe === null ? "" : Math.round(probe)}|${pal.text}`, title: `${g.label} · n ${formatNumber(g.n, 0)}`, rows };
  };

  const setHover = (i: number | null, source: Run["source"], probe: number | null = null) => {
    const s = st.current;
    const changed = s.hover !== i;
    s.hover = i;
    s.source = i === null ? null : source;
    tipRef.current?.set(i === null ? null : tooltipFor(i, probe));
    if (changed && i !== null && source === "keyboard") {
      const g = stats.groups[i];
      announcer.current?.say(`${g.label}: median ${fmt(g.med)}, middle half ${fmt(g.q1)} to ${fmt(g.q3)}, ${g.n} values`);
    }
    wake();
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    st.current.lastInput = clock();
    const rect = rectRef.current ?? wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const s = st.current;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < s.plot.l || x > s.plot.r || y < s.plot.t || y > s.plot.b) {
      s.probeY = null;
      setHover(null, null);
      return;
    }
    s.probeY = y;
    const i = clamp(Math.floor(((x - s.plot.l) / (s.plot.r - s.plot.l)) * stats.groups.length), 0, stats.groups.length - 1);
    const v = stats.lo + ((s.plot.b - y) / (s.plot.b - s.plot.t)) * (stats.hi - stats.lo);
    setHover(i, "pointer", v);
  };

  const setHighlight = (id: string | null) => {
    if (highlightProp === undefined) setHlState(id);
    onHighlightChange?.(id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = st.current;
    s.lastInput = clock();
    const n = stats.groups.length;
    if (!n) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      s.probeY = null;
      const cur = s.hover ?? (e.key === "ArrowRight" ? -1 : n);
      setHover(clamp(cur + (e.key === "ArrowRight" ? 1 : -1), 0, n - 1), "keyboard");
    } else if (e.key === "Enter" || e.key === " ") {
      if (s.hover === null) return;
      e.preventDefault();
      const id = stats.groups[s.hover].id;
      setHighlight(highlightId === id ? null : id);
    } else if (e.key === "m") {
      e.preventDefault();
      const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
      if (modeProp === undefined) setModeState(next);
      onModeChange?.(next);
      announcer.current?.say(`${next} view`);
    } else if (e.key === "Escape") {
      setHover(null, null);
    }
  };

  const tableRows = useMemo(
    () => stats.groups.map((g) => [g.label, g.n, fmt(g.lo), fmt(g.q1), fmt(g.med), fmt(g.q3), fmt(g.hi), fmt(g.mean)]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stats, formatValue, unit],
  );
  const tableCols = useMemo(() => ["Group", "Count", "Min", "p25", "Median", "p75", "Max", "Mean"], []);

  return (
    <div ref={rootRef} data-loop="idle" className={cn("@container relative w-full select-none text-[color:var(--bjork-text)]", className)} style={{ ...vars, height }}>
      <div
        ref={wrapperRef}
        role="group"
        aria-roledescription="chart"
        aria-label={`${ariaLabel}. Left and right move between groups, Enter highlights one, M switches between violin, box and strip views.`}
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
          const id = stats.groups[s.hover].id;
          setHighlight(highlightId === id ? null : id);
        }}
        onPointerLeave={() => {
          st.current.probeY = null;
          setHover(null, null);
        }}
        onKeyDown={onKeyDown}
        className={cn("absolute inset-0 cursor-crosshair touch-pan-y rounded-[10px]", chartFocusRing)}
      >
        <div ref={hostRef} className="absolute inset-0">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`${ariaLabel}: ${stats.groups.map((g) => `${g.label} median ${fmt(g.med)}`).join(", ")}`}
            className="pointer-events-none absolute left-0 top-0"
          />
        </div>
        <LabelPool count={Y_LABELS} pool={yPool} />
        <span
          ref={probeRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 inline-flex h-[18px] items-center rounded-[5px] border border-[color:var(--bjork-border-strong)] bg-[color:var(--bjork-surface-hover)] px-1 font-mono text-[10px] leading-none tabular-nums text-[color:var(--bjork-text)] opacity-0 [text-box:trim-both_cap_alphabetic]"
        />
        <div aria-hidden="true" className="pointer-events-none absolute flex" style={{ left: PAD_LEFT, right: PAD_RIGHT, bottom: 0, height: PAD_BOTTOM }}>
          {stats.groups.map((g) => (
            <div key={g.id} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-[5px] px-1">
              <span
                className={cn(
                  "max-w-full truncate font-bjork-alpha text-[12px] font-medium leading-[14px] @max-[440px]:text-[11px]",
                  g.id === highlightId ? "text-[color:var(--bjork-accent-ink)]" : "text-[color:var(--bjork-text-medium)]",
                )}
              >
                {g.label}
              </span>
              <span className="font-mono text-[10px] leading-none tabular-nums text-[color:var(--bjork-text-faint)] [text-box:trim-both_cap_alphabetic]">
                n {formatNumber(g.n, 0)}
              </span>
            </div>
          ))}
        </div>
        <HoverTooltip ref={tipRef} onMeasure={wake} />
      </div>
      <ChartTable caption={ariaLabel} columns={tableCols} rows={tableRows} />
      <ChartAnnouncer ref={announcer} />
    </div>
  );
}

// Seeded demo groups: response times by region, each with its own shape.
export function createRegionGroups(seed: number): ViolinGroup[] {
  const rnd = mulberry32(seed);
  const spec: [string, string, (r: () => number) => number, number][] = [
    ["us", "US East", (r) => Math.exp(Math.log(140) + gaussian(r) * 0.18), 420],
    ["eu", "EU West", (r) => (r() < 0.7 ? 170 + gaussian(r) * 22 : 250 + gaussian(r) * 30), 380],
    ["ap", "Singapore", (r) => Math.exp(Math.log(230) + gaussian(r) * 0.26), 300],
    ["sa", "São Paulo", (r) => 260 + gaussian(r) * 38 + (r() < 0.08 ? 160 : 0), 220],
    ["au", "Sydney", (r) => Math.exp(Math.log(300) + gaussian(r) * 0.14), 180],
  ];
  return spec.map(([id, label, gen, n]) => ({ id, label, values: Array.from({ length: n }, () => Math.min(580, Math.max(40, gen(rnd)))) }));
}
