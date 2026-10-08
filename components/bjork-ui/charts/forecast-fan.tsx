"use client";

import { useEffect, useMemo, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
import { mulberry32 } from "@/components/bjork-ui/_core/random";
import { useChartCanvas, easeOut, hatchPattern, writeLabels, type PlacedLabel } from "@/components/bjork-ui/charts/_kit/canvas";
import { useChartTheme, chartFocusRing, ChartTable, ChartLegend, LabelPool, placeTooltip, HoverTooltip, ChartAnnouncer, type TooltipRow, type TooltipHandle, type AnnouncerHandle, type TooltipContent } from "@/components/bjork-ui/charts/_kit/chrome";
import { clamp, crisp, damp, niceDomain, niceTicks, timeTicks, withAlpha, formatNumber, formatDateUTC, gaussian } from "@/components/bjork-ui/charts/_kit/scale";

export interface FanHistoryPoint {
  t: number;
  v: number;
}

export interface FanForecastPoint {
  t: number;
  /** Median (or point) forecast. */
  mid: number;
  /** Interval bounds, innermost first: e.g. [[p25, p75], [p10, p90], [p05, p95]]. */
  bands: [number, number][];
}

export interface ForecastFanProps {
  history: FanHistoryPoint[];
  forecast: FanForecastPoint[];
  /** Labels for `bands`, innermost first. */
  bandLabels?: string[];
  /** Which bands are drawn, by index. Hidden bands fold into the median. */
  visibleBands?: boolean[];
  threshold?: { value: number; label?: string };
  formatValue?: (v: number) => string;
  formatTime?: (t: number) => string;
  /** Posed scrub index into history followed by forecast. `null` hides it. */
  index?: number | null;
  onIndexChange?: (index: number | null) => void;
  height?: number;
  ariaLabel?: string;
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

const PAD_TOP = 34;
const PAD_BOTTOM = 26;
const PAD_LEFT = 44;
const PAD_RIGHT = 64;
const HIST_MS = 700;
const OPEN_MS = 520;
const SPREAD_MS = 520;
const RANGE_TAU = 0.16;
const BAND_TAU = 0.12;
const Y_LABELS = 6;
const X_LABELS = 12;
const END_LABELS = 4;
const BAND_ALPHA = [0.22, 0.13, 0.075, 0.05];
const ATTRACT_STEP_MS = 180;
const ATTRACT_IDLE_MS = 4000;

const defaultFormatValue = (v: number) => formatNumber(v, 0);
const defaultFormatTime = (t: number) => formatDateUTC(t);

interface Run {
  enter: number;
  lo: number;
  hi: number;
  ready: boolean;
  disp: number[][][]; // [k][band][lo|hi]
  vis: number[];
  hover: number | null;
  source: "pointer" | "keyboard" | "prop" | "attract" | null;
  plot: { l: number; r: number; t: number; b: number };
  xs: Float64Array;
  yCache: string[];
  xCache: string[];
  endCache: string[];
  lastInput: number;
  attractAt: number;
}

export function ForecastFan({
  history,
  forecast,
  bandLabels = ["50%", "80%", "95%"],
  visibleBands,
  threshold,
  formatValue = defaultFormatValue,
  formatTime = defaultFormatTime,
  index,
  onIndexChange,
  height = 320,
  ariaLabel = "Forecast",
  tone: toneProp,
  attract = false,
  className,
}: ForecastFanProps) {
  const { pal, reduce, vars } = useChartTheme(toneProp);
  const announcer = useRef<AnnouncerHandle>(null);
  const say = (m: string) => announcer.current?.say(m);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<TooltipHandle>(null);
  const nowRef = useRef<HTMLSpanElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const noteRef = useRef<HTMLSpanElement>(null);
  const thrRef = useRef<HTMLSpanElement>(null);
  const yPool = useRef<(HTMLSpanElement | null)[]>([]);
  const xPool = useRef<(HTMLSpanElement | null)[]>([]);
  const endPool = useRef<(HTMLSpanElement | null)[]>([]);
  const rectRef = useRef<DOMRect | null>(null);

  // Forecast series anchored on the last real value, so the fan opens from a point.
  const points = useMemo(() => {
    const last = history[history.length - 1];
    const bandCount = forecast[0]?.bands.length ?? 0;
    const anchor: FanForecastPoint | null = last ? { t: last.t, mid: last.v, bands: Array.from({ length: bandCount }, () => [last.v, last.v] as [number, number]) } : null;
    return { anchor, fc: anchor ? [anchor, ...forecast.filter((f) => f.t > last.t)] : forecast };
  }, [history, forecast]);

  const total = history.length + Math.max(0, points.fc.length - 1);
  const pointAt = (i: number): { t: number; v: number; f: FanForecastPoint | null } | null => {
    if (i < 0 || i >= total) return null;
    if (i < history.length) {
      const h = history[i];
      return { t: h.t, v: h.v, f: i === history.length - 1 ? points.fc[0] ?? null : null };
    }
    const f = points.fc[i - history.length + 1];
    return f ? { t: f.t, v: f.mid, f } : null;
  };

  const cfg = useRef({ history, fc: points.fc, visibleBands, threshold, formatValue, formatTime, reduce, pal, attract, total });
  useEffect(() => {
    cfg.current = { history, fc: points.fc, visibleBands, threshold, formatValue, formatTime, reduce, pal, attract, total };
  });

  const tooltipForRef = useRef<(i: number) => TooltipContent | null>(() => null);
  const bandLabelsRef = useRef(bandLabels);
  useEffect(() => {
    bandLabelsRef.current = bandLabels;
  });

  const st = useRef<Run>({
    enter: 0,
    lo: 0,
    hi: 1,
    ready: false,
    disp: [],
    vis: [],
    hover: index ?? null,
    source: index != null ? "prop" : null,
    plot: { l: 0, r: 0, t: 0, b: 0 },
    xs: new Float64Array(0),
    yCache: [],
    xCache: [],
    endCache: [],
    lastInput: 0,
    attractAt: 0,
  });

  const { rootRef, hostRef, canvasRef, wake } = useChartCanvas(({ ctx, w, h, dt }) => {
    const s = st.current;
    const c = cfg.current;
    const p = c.pal;
    const hist = c.history;
    const fc = c.fc;
    if (!hist.length) return false;
    const bandCount = fc[0]?.bands.length ?? 0;

    // Attract: a slow scrub through the forecast.
    if (c.attract && !c.reduce) {
      const now = performance.now();
      if ((!s.lastInput || now - s.lastInput > ATTRACT_IDLE_MS) && (s.source === null || s.source === "attract") && now - s.attractAt > ATTRACT_STEP_MS) {
        s.attractAt = now;
        const next = s.hover === null || s.hover >= c.total - 1 ? Math.max(0, hist.length - 12) : s.hover + 1;
        s.hover = next;
        s.source = "attract";
        tipRef.current?.set(tooltipForRef.current(next));
      }
    }

    const plot = { l: PAD_LEFT, r: Math.max(PAD_LEFT + 40, w - PAD_RIGHT), t: PAD_TOP, b: Math.max(PAD_TOP + 40, h - PAD_BOTTOM) };
    s.plot = plot;
    const t0 = hist[0].t;
    const t1 = fc.length > 1 ? fc[fc.length - 1].t : hist[hist.length - 1].t;
    const xOf = (t: number) => plot.l + ((t - t0) / Math.max(1, t1 - t0)) * (plot.r - plot.l);

    // Band visibility and band edges approach their targets.
    let moving = false;
    for (let j = 0; j < bandCount; j++) {
      const target = c.visibleBands?.[j] === false ? 0 : 1;
      if (s.vis[j] === undefined || c.reduce) s.vis[j] = target;
      else s.vis[j] = damp(s.vis[j], target, BAND_TAU, dt);
      if (Math.abs(s.vis[j] - target) > 1e-3) moving = true;
      else s.vis[j] = target;
    }
    if (s.disp.length !== fc.length) s.disp = fc.map((f) => f.bands.map((b) => [b[0], b[1]]));
    for (let k = 0; k < fc.length; k++) {
      for (let j = 0; j < bandCount; j++) {
        const target = fc[k].bands[j];
        const d = s.disp[k][j] ?? (s.disp[k][j] = [target[0], target[1]]);
        for (let e = 0; e < 2; e++) {
          if (c.reduce) d[e] = target[e];
          else {
            d[e] = damp(d[e], target[e], BAND_TAU, dt);
            if (Math.abs(d[e] - target[e]) > 1e-6 * (Math.abs(target[e]) + 1)) moving = true;
            else d[e] = target[e];
          }
        }
      }
    }

    // Entrance: history draws, then the fan opens point by point from now.
    const enterTotal = HIST_MS + SPREAD_MS + OPEN_MS;
    s.enter = c.reduce ? 1 : Math.min(1, s.enter + (dt * 1000) / enterTotal);
    const ms = s.enter * enterTotal;
    const histReveal = easeOut(clamp(ms / HIST_MS, 0, 1));
    const openAt = (k: number) => {
      if (s.enter >= 1) return 1;
      const delay = HIST_MS * 0.7 + (k / Math.max(1, fc.length - 1)) * SPREAD_MS;
      return easeOut(clamp((ms - delay) / OPEN_MS, 0, 1));
    };

    // Y domain over history, every visible band and the threshold.
    let lo = Infinity;
    let hi = -Infinity;
    for (const pt of hist) {
      if (pt.v < lo) lo = pt.v;
      if (pt.v > hi) hi = pt.v;
    }
    for (const f of fc) {
      lo = Math.min(lo, f.mid);
      hi = Math.max(hi, f.mid);
      for (let j = bandCount - 1; j >= 0; j--) {
        if (c.visibleBands?.[j] === false) continue;
        lo = Math.min(lo, f.bands[j][0]);
        hi = Math.max(hi, f.bands[j][1]);
        break;
      }
    }
    if (c.threshold) {
      lo = Math.min(lo, c.threshold.value);
      hi = Math.max(hi, c.threshold.value);
    }
    const [nLo, nHi] = niceDomain(lo - (hi - lo) * 0.04, hi + (hi - lo) * 0.04, 5);
    if (!s.ready || c.reduce) {
      s.lo = nLo;
      s.hi = nHi;
      s.ready = true;
    } else {
      s.lo = damp(s.lo, nLo, RANGE_TAU, dt);
      s.hi = damp(s.hi, nHi, RANGE_TAU, dt);
      if (Math.abs(s.lo - nLo) + Math.abs(s.hi - nHi) > 1e-4 * (nHi - nLo)) moving = true;
      else {
        s.lo = nLo;
        s.hi = nHi;
      }
    }
    const yOf = (v: number) => plot.t + ((s.hi - v) / Math.max(1e-9, s.hi - s.lo)) * (plot.b - plot.t);

    // Grid.
    const ticks = niceTicks(s.lo, s.hi, 5);
    ctx.lineWidth = 1;
    ctx.strokeStyle = p.hair;
    ctx.beginPath();
    for (const v of ticks) {
      const y = crisp(yOf(v));
      if (y < plot.t - 1 || y > plot.b + 1) continue;
      ctx.moveTo(plot.l, y);
      ctx.lineTo(plot.r, y);
    }
    ctx.stroke();
    writeLabels(
      yPool.current,
      s.yCache,
      ticks.filter((v) => yOf(v) >= plot.t - 1 && yOf(v) <= plot.b + 1).map((v) => ({ text: c.formatValue(v), x: plot.l - 8, y: yOf(v), ax: -100 })),
    );
    const xt = timeTicks(t0, t1, plot.r - plot.l, 72);
    writeLabels(
      xPool.current,
      s.xCache,
      xt.filter((tk) => xOf(tk.t) > plot.l + 16 && xOf(tk.t) < plot.r - 16).map((tk) => ({ text: tk.label, x: xOf(tk.t), y: h - PAD_BOTTOM + 13, ax: -50 })),
    );

    // Future region: a faint wash so "now" reads as a boundary, not just a line.
    const nowX = xOf(hist[hist.length - 1].t);
    ctx.fillStyle = withAlpha(p.text, 0.025);
    ctx.fillRect(nowX, plot.t, plot.r - nowX, plot.b - plot.t);
    ctx.strokeStyle = p.textFaint;
    ctx.beginPath();
    ctx.moveTo(crisp(nowX), plot.t - 6);
    ctx.lineTo(crisp(nowX), plot.b);
    ctx.stroke();
    if (nowRef.current) nowRef.current.style.transform = `translate3d(${(nowX + 6).toFixed(1)}px, ${(plot.t - 2).toFixed(1)}px, 0) translateY(-100%)`;

    // Threshold.
    let thrY: number | null = null;
    if (c.threshold) {
      thrY = yOf(c.threshold.value);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = p.textSoft;
      ctx.beginPath();
      ctx.moveTo(plot.l, crisp(thrY));
      ctx.lineTo(plot.r, crisp(thrY));
      ctx.stroke();
      ctx.restore();
      if (thrRef.current) {
        thrRef.current.style.opacity = "1";
        thrRef.current.style.transform = `translate3d(${(plot.l + 4).toFixed(1)}px, ${(thrY - 3).toFixed(1)}px, 0) translateY(-100%)`;
      }
    } else if (thrRef.current) thrRef.current.style.opacity = "0";

    // Bands, outermost first, each opening around the median.
    const edgeAt = (k: number, j: number, e: 0 | 1) => {
      const m = fc[k].mid;
      const v = s.vis[j] ?? 1;
      // A hidden band folds onto the next band in (or the median), so toggling never leaves a gap.
      const inner = j > 0 ? s.disp[k][j - 1][e] : m;
      const edge = inner + (s.disp[k][j][e] - inner) * v;
      return m + (edge - m) * openAt(k);
    };
    for (let j = bandCount - 1; j >= 0; j--) {
      if ((s.vis[j] ?? 1) < 0.002) continue;
      ctx.beginPath();
      for (let k = 0; k < fc.length; k++) {
        const x = xOf(fc[k].t);
        const y = yOf(edgeAt(k, j, 1));
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let k = fc.length - 1; k >= 0; k--) ctx.lineTo(xOf(fc[k].t), yOf(edgeAt(k, j, 0)));
      ctx.closePath();
      ctx.fillStyle = withAlpha(p.accent, (BAND_ALPHA[j] ?? 0.05) * (s.vis[j] ?? 1));
      ctx.fill();
      if (j === bandCount - 1 && bandCount > 1) {
        const pat = hatchPattern(ctx, withAlpha(p.accent, 0.32), 5, 1);
        if (pat) {
          // Hatch only the outer ring: cut the next band in out of the path, so the core stays a clean wash.
          for (let k = 0; k < fc.length; k++) {
            const x = xOf(fc[k].t);
            const y = yOf(edgeAt(k, j - 1, 1));
            if (k === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          for (let k = fc.length - 1; k >= 0; k--) ctx.lineTo(xOf(fc[k].t), yOf(edgeAt(k, j - 1, 0)));
          ctx.closePath();
          ctx.save();
          ctx.globalAlpha = s.vis[j] ?? 1;
          ctx.fillStyle = pat;
          ctx.fill("evenodd");
          ctx.restore();
        }
      }
    }

    // History line, revealed left to right.
    const histEndX = plot.l + (nowX - plot.l) * histReveal;
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.l - 2, 0, histEndX - plot.l + 4, h);
    ctx.clip();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = 1.75;
    ctx.strokeStyle = withAlpha(p.text, 0.86);
    ctx.beginPath();
    hist.forEach((pt, i) => (i === 0 ? ctx.moveTo(xOf(pt.t), yOf(pt.v)) : ctx.lineTo(xOf(pt.t), yOf(pt.v))));
    ctx.stroke();
    ctx.restore();

    // Median: a dashed accent line that grows with the fan.
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.75;
    ctx.strokeStyle = p.accent;
    ctx.beginPath();
    for (let k = 0; k < fc.length; k++) {
      const o = openAt(k);
      if (o <= 0) break;
      const x = xOf(fc[k].t);
      const y = yOf(fc[k].mid);
      if (k === 0) ctx.moveTo(x, y);
      else {
        const px = xOf(fc[k - 1].t);
        const py = yOf(fc[k - 1].mid);
        const f = clamp(o * 2, 0, 1);
        ctx.lineTo(px + (x - px) * f, py + (y - py) * f);
      }
    }
    ctx.stroke();
    ctx.restore();

    // Now dot: the last real value, with a surface ring.
    const lastH = hist[hist.length - 1];
    if (histReveal >= 0.999) {
      ctx.beginPath();
      ctx.arc(nowX, yOf(lastH.v), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = p.text;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = p.stage;
      ctx.stroke();
    }

    // End labels: the median badge and each band's name at its upper edge, relaxed apart.
    const fanDone = openAt(fc.length - 1);
    const lastK = fc.length - 1;
    if (badgeRef.current && lastK > 0) {
      const b = badgeRef.current;
      b.textContent = c.formatValue(fc[lastK].mid);
      b.style.opacity = String(fanDone);
      b.style.transform = `translate3d(${(plot.r + 6).toFixed(1)}px, ${(yOf(fc[lastK].mid) - 11).toFixed(1)}px, 0)`;
    }
    const ends: PlacedLabel[] = [];
    if (lastK > 0) {
      const midY = yOf(fc[lastK].mid);
      let floor = midY - 15; // labels stack upward from just above the badge
      for (let j = 0; j < bandCount; j++) {
        if ((s.vis[j] ?? 1) < 0.5) continue;
        let y = yOf(edgeAt(lastK, j, 1));
        y = Math.min(y, floor);
        floor = y - 12;
        ends.push({ text: bandLabelsRef.current[j] ?? "", x: plot.r + 8, y, opacity: fanDone * (s.vis[j] ?? 1) });
      }
    }
    writeLabels(endPool.current, s.endCache, ends);

    // The threshold verdict: the widest visible band that clears it, and the first point it does.
    const note = noteRef.current;
    let noteShown = false;
    if (c.threshold && thrY !== null && note) {
      const tv = c.threshold.value;
      // The fan starts at a point on one side of the threshold. "Clears" is the band crossing wholly
      // to the far side; failing that, "reaches" is its near edge first touching the threshold.
      const below = (fc[0]?.mid ?? 0) < tv;
      let hit = -1;
      let band = -1;
      let verb = "clears";
      let edgeSide: 0 | 1 = below ? 0 : 1;
      for (let j = bandCount - 1; j >= 0 && hit < 0; j--) {
        if (c.visibleBands?.[j] === false) continue;
        for (let k = 1; k < fc.length; k++) {
          const far = below ? fc[k].bands[j][0] : fc[k].bands[j][1];
          if (below ? far > tv : far < tv) {
            hit = k;
            band = j;
            break;
          }
        }
      }
      if (hit < 0) {
        for (let j = bandCount - 1; j >= 0 && hit < 0; j--) {
          if (c.visibleBands?.[j] === false) continue;
          for (let k = 1; k < fc.length; k++) {
            const near = below ? fc[k].bands[j][1] : fc[k].bands[j][0];
            if (below ? near >= tv : near <= tv) {
              hit = k;
              band = j;
              verb = "reaches";
              edgeSide = below ? 1 : 0;
              break;
            }
          }
        }
      }
      const rising = edgeSide === 0;
      if (hit > 0) {
        const x = xOf(fc[hit].t);
        const y = yOf(edgeAt(hit, band, edgeSide));
        const a = openAt(hit);
        const dir = rising ? 1 : -1;
        ctx.globalAlpha = a;
        ctx.strokeStyle = withAlpha(p.accentInk, 0.6);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(crisp(x - 0.5), y + dir * 6);
        ctx.lineTo(crisp(x - 0.5), y + dir * 24);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = p.stage;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = p.accentInk;
        ctx.stroke();
        ctx.globalAlpha = 1;
        const narrow = plot.r - plot.l < 420;
        const text = narrow
          ? `${bandLabelsRef.current[band] ?? ""} ${verb} \u00b7 ${c.formatTime(fc[hit].t)}`
          : `${bandLabelsRef.current[band] ?? ""} band ${verb} ${c.threshold.label ?? c.formatValue(tv)} \u00b7 ${c.formatTime(fc[hit].t)}`;
        if (note.textContent !== text) {
          note.textContent = text;
          note.dataset.w = String(note.offsetWidth);
        }
        const nw = Number(note.dataset.w) || 0;
        const nx = clamp(x - nw / 2, plot.l, plot.r - nw);
        note.style.opacity = String(a);
        note.style.transform = `translate3d(${nx.toFixed(1)}px, ${(y + dir * 28).toFixed(1)}px, 0) translateY(${rising ? "0" : "-100%"})`;
        noteShown = true;
      }
    }
    if (!noteShown && note) note.style.opacity = "0";

    // Scrub: crosshair, the value dot, and band edge ticks in the forecast.
    const tip = tipRef.current;
    const hi2 = s.hover;
    if (hi2 !== null && hi2 >= 0 && hi2 < c.total) {
      const inHist = hi2 < hist.length;
      const k = inHist ? -1 : hi2 - hist.length + 1;
      const t = inHist ? hist[hi2].t : fc[k].t;
      const v = inHist ? hist[hi2].v : fc[k].mid;
      const x = xOf(t);
      ctx.strokeStyle = p.textSoft;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(crisp(x - 0.5), plot.t);
      ctx.lineTo(crisp(x - 0.5), plot.b);
      ctx.stroke();
      if (!inHist) {
        ctx.strokeStyle = p.accentInk;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let j = 0; j < bandCount; j++) {
          if ((s.vis[j] ?? 1) < 0.5) continue;
          for (const e of [0, 1] as const) {
            const y = Math.round(yOf(edgeAt(k, j, e))) + 0.5;
            ctx.moveTo(x - 4, y);
            ctx.lineTo(x + 4, y);
          }
        }
        ctx.stroke();
      }
      const y = yOf(v);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = inHist ? p.text : p.accent;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = p.stage;
      ctx.stroke();
      if (tip?.el) {
        const pos = placeTooltip(x, y, tip.size.w, tip.size.h, w, h, 14);
        tip.el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      }
    }

    return moving || s.enter < 1 || (c.attract && !c.reduce);
  });

  useEffect(() => {
    wake();
  }, [history, forecast, visibleBands, threshold, pal, reduce, attract, wake]);

  useEffect(() => {
    if (index === undefined) return;
    st.current.hover = index;
    st.current.source = index === null ? null : "prop";
    wake();
  }, [index, wake]);

  const describe = (i: number) => {
    const pt = pointAt(i);
    if (!pt) return "";
    // The last real point is also the forecast anchor, where every band is zero wide: read it as actual.
    if (!pt.f || i < history.length) return `${formatTime(pt.t)}, actual ${formatValue(pt.v)}`;
    const parts = pt.f.bands
      .map((b, j) => (visibleBands?.[j] === false ? null : `${bandLabels[j] ?? ""} ${formatValue(b[0])} to ${formatValue(b[1])}`))
      .filter(Boolean);
    return `${formatTime(pt.t)}, forecast ${formatValue(pt.f.mid)}${parts.length ? `, ${parts.join(", ")}` : ""}`;
  };

  const setIndex = (i: number | null, source: Run["source"]) => {
    const s = st.current;
    s.hover = i;
    s.source = i === null ? null : source;
    tipRef.current?.set(i === null ? null : tooltipFor(i));
    onIndexChange?.(i);
    if (i !== null && source !== "attract") say(describe(i));
    wake();
  };

  const markInput = () => {
    st.current.lastInput = performance.now();
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    markInput();
    const rect = rectRef.current ?? wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const s = st.current;
    const x = e.clientX - rect.left;
    if (x < s.plot.l - 8 || x > s.plot.r + 8) {
      if (s.source === "pointer") setIndex(null, null);
      return;
    }
    // Nearest point by time.
    const t0 = history[0]?.t ?? 0;
    const lastT = points.fc.length > 1 ? points.fc[points.fc.length - 1].t : history[history.length - 1]?.t ?? 0;
    const t = t0 + ((x - s.plot.l) / Math.max(1, s.plot.r - s.plot.l)) * (lastT - t0);
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < total; i++) {
      const pt = pointAt(i);
      if (!pt) continue;
      const d = Math.abs(pt.t - t);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best !== s.hover || s.source !== "pointer") setIndex(best, "pointer");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    markInput();
    const s = st.current;
    let next: number | null = null;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const step = (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 10 : 1);
      next = s.hover === null || s.source === "attract" ? history.length - 1 : clamp(s.hover + step, 0, total - 1);
    } else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = total - 1;
    else if (e.key === "Escape" && s.hover !== null) {
      e.preventDefault();
      setIndex(null, null);
      return;
    }
    if (next === null) return;
    e.preventDefault();
    setIndex(next, "keyboard");
  };

  // Tooltip content for an index: values lead, the series key follows.
  const tooltipFor = (i: number): TooltipContent | null => {
    const pt = pointAt(i);
    if (!pt) return null;
    const rows: TooltipRow[] = [];
    if (i < history.length) rows.push({ key: "v", label: "Actual", value: formatValue(pt.v), color: pal.text });
    if (pt.f && i > history.length - 1) {
      rows.push({ key: "m", label: "Median", value: formatValue(pt.f.mid), color: pal.accent, dashed: true });
      pt.f.bands.forEach((b, j) => {
        if (visibleBands?.[j] === false) return;
        rows.push({ key: `b${j}`, label: bandLabels[j] ?? "", value: `${formatValue(b[0])}\u2013${formatValue(b[1])}`, color: withAlpha(pal.accent, 0.55), strong: false });
      });
    }
    return { key: `${i}|${rows.length}|${pal.text}`, title: `${formatTime(pt.t)}${i >= history.length ? " \u00b7 forecast" : ""}`, rows };
  };

  // Posed index: keep the tooltip in step without a pointer.
  useEffect(() => {
    tooltipForRef.current = tooltipFor;
    const s = st.current;
    if (s.hover !== null && s.source === "prop") tipRef.current?.set(tooltipFor(s.hover));
  });

  const legend = useMemo(
    () => [
      { id: "h", label: "Actual", color: pal.text, shape: "line" as const },
      { id: "m", label: "Median", color: pal.accent, shape: "dash" as const },
      ...bandLabels
        .map((l, j) => ({ id: `b${j}`, label: l, color: withAlpha(pal.accent, (BAND_ALPHA[j] ?? 0.05) * 2.6), shape: "rect" as const }))
        .filter((_, j) => visibleBands?.[j] !== false),
    ],
    [pal, bandLabels, visibleBands],
  );

  const tableRows = useMemo(() => {
    const rows: (string | number)[][] = history.map((h) => [formatTime(h.t), formatValue(h.v), "", ""]);
    for (const f of forecast) {
      const outerIdx = f.bands.length - 1;
      rows.push([formatTime(f.t), "", formatValue(f.mid), outerIdx >= 0 ? `${formatValue(f.bands[outerIdx][0])} to ${formatValue(f.bands[outerIdx][1])}` : ""]);
    }
    return rows;
  }, [history, forecast, formatTime, formatValue]);
  const tableCols = useMemo(() => ["Date", "Actual", "Median forecast", `${bandLabels[bandLabels.length - 1] ?? ""} interval`], [bandLabels]);

  const lastH = history[history.length - 1];
  const lastF = forecast[forecast.length - 1];
  const summary = lastH && lastF ? `${ariaLabel}: last actual ${formatValue(lastH.v)} on ${formatTime(lastH.t)}, median forecast ${formatValue(lastF.mid)} by ${formatTime(lastF.t)}` : ariaLabel;

  return (
    <div
      ref={rootRef}
      data-loop="idle"
      className={cn("relative w-full select-none text-[color:var(--bjork-text)]", className)}
      style={{ ...vars, height }}
    >
      <div
        ref={wrapperRef}
        role="group"
        aria-roledescription="chart"
        aria-label={`${ariaLabel}. Arrow keys move through history and forecast.`}
        tabIndex={0}
        onPointerEnter={() => {
          markInput();
          if (wrapperRef.current) rectRef.current = wrapperRef.current.getBoundingClientRect();
        }}
        onPointerMove={onPointerMove}
        onPointerDown={(e) => {
          if (wrapperRef.current) rectRef.current = wrapperRef.current.getBoundingClientRect();
          if (e.pointerType === "touch") onPointerMove(e);
        }}
        onPointerLeave={() => {
          if (st.current.source === "pointer") setIndex(null, null);
        }}
        onKeyDown={onKeyDown}
        onFocus={markInput}
        className={cn("absolute inset-0 touch-pan-y rounded-[10px]", chartFocusRing)}
      >
        <div ref={hostRef} className="absolute inset-0">
          <canvas ref={canvasRef} role="img" aria-label={summary} className="pointer-events-none absolute left-0 top-0" />
        </div>
        <ChartLegend items={legend} className="pointer-events-none absolute left-11 top-0.5" />
        <LabelPool count={Y_LABELS} pool={yPool} />
        <LabelPool count={X_LABELS} pool={xPool} />
        <LabelPool count={END_LABELS} pool={endPool} className="font-mono text-[9px] uppercase leading-none tracking-[0.08em] tabular-nums text-[color:var(--bjork-text-soft)] [text-box:trim-both_cap_alphabetic]" />
        <span
          ref={nowRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 font-mono text-[9px] uppercase leading-none tracking-[0.1em] text-[color:var(--bjork-text-soft)] [text-box:trim-both_cap_alphabetic]"
        >
          Now
        </span>
        <span
          ref={thrRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-[5px] bg-[color:var(--bjork-chart-bg)] px-1 py-[3px] font-mono text-[10px] leading-none tabular-nums text-[color:var(--bjork-text-muted)] opacity-0 [text-box:trim-both_cap_alphabetic]"
        >
          {threshold ? (threshold.label ?? formatValue(threshold.value)) : ""}
        </span>
        <span
          ref={noteRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-[6px] bg-[color:var(--bjork-chart-bg)] px-1.5 py-1 font-mono text-[10px] leading-none tabular-nums text-[color:var(--bjork-accent-ink)] opacity-0 [text-box:trim-both_cap_alphabetic]"
        />
        <span
          ref={badgeRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 inline-flex h-[22px] items-center rounded-[11px] bg-[color:var(--bjork-accent-fill)] px-2 font-mono text-[11px] leading-none tabular-nums text-[color:var(--bjork-accent-foreground)] opacity-0 [text-box:trim-both_cap_alphabetic]"
        />
        <HoverTooltip ref={tipRef} onMeasure={wake} />
      </div>
      <ChartTable caption={ariaLabel} columns={tableCols} rows={tableRows} />
      <ChartAnnouncer ref={announcer} />
    </div>
  );
}

// Seeded demo data: a seasonal series with a widening forecast fan (bands at 50/80/95%).
export function createForecastSeries(
  seed: number,
  opts?: { weeks?: number; horizon?: number; base?: number; start?: number },
): { history: FanHistoryPoint[]; forecast: FanForecastPoint[] } {
  const rnd = mulberry32(seed);
  const weeks = opts?.weeks ?? 52;
  const horizon = opts?.horizon ?? 26;
  const base = opts?.base ?? 180;
  const start = opts?.start ?? Date.UTC(2024, 6, 1);
  const WEEK = 7 * 86400000;
  const season = (i: number) => Math.sin((i / 52) * Math.PI * 2 - 0.6) * base * 0.08;
  const trend = (i: number) => base + i * base * 0.004;
  const history: FanHistoryPoint[] = [];
  let noise = 0;
  for (let i = 0; i < weeks; i++) {
    noise = noise * 0.6 + gaussian(rnd) * base * 0.03;
    history.push({ t: start + i * WEEK, v: trend(i) + season(i) + noise });
  }
  const z = [0.674, 1.2816, 1.96];
  const forecast: FanForecastPoint[] = [];
  const lastV = history[weeks - 1].v;
  const offset = lastV - (trend(weeks - 1) + season(weeks - 1));
  for (let k = 1; k <= horizon; k++) {
    const i = weeks - 1 + k;
    const mid = trend(i) + season(i) + offset * Math.pow(0.85, k);
    const sd = base * 0.032 * Math.sqrt(k) * (1 + k / 60);
    forecast.push({ t: start + i * WEEK, mid, bands: z.map((zz) => [mid - zz * sd, mid + zz * sd * 1.08] as [number, number]) });
  }
  return { history, forecast };
}
