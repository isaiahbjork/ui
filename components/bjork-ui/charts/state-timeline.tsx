"use client";

import { useEffect, useMemo, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
import { mulberry32 } from "@/components/bjork-ui/_core/random";
import { useChartCanvas, easeOut, hatchPattern, writeLabels, roundRectPath } from "@/components/bjork-ui/charts/_kit/canvas";
import {
  useChartTheme,
  chartFocusRing,
  ChartTable,
  ChartLegend,
  LabelPool,
  placeTooltip,
  HoverTooltip,
  ChartAnnouncer,
  type ChartPalette,
  type TooltipHandle,
  type AnnouncerHandle,
  type TooltipContent,
} from "@/components/bjork-ui/charts/_kit/chrome";
import { clamp, crisp, damp, timeTicks, withAlpha, formatPercent } from "@/components/bjork-ui/charts/_kit/scale";

export type StateTone = "ok" | "warn" | "down" | "idle" | "accent";

export interface TimelineState {
  id: string;
  label: string;
  tone: StateTone;
}

export interface TimelineSegment {
  start: number;
  end: number;
  state: string;
  note?: string;
}

export interface TimelineLane {
  id: string;
  label: string;
  segments: TimelineSegment[];
}

export interface StateTimelineProps {
  lanes: TimelineLane[];
  states: TimelineState[];
  domain: [number, number];
  /** Visible window. Uncontrolled by default (the whole domain). */
  view?: [number, number];
  onViewChange?: (view: [number, number]) => void;
  /** A "now" marker. */
  now?: number;
  /** Which state counts toward the per-lane share in the right gutter. Defaults to the first "ok" state. */
  shareState?: string | false;
  shareLabel?: string;
  formatTime?: (t: number, detail: "axis" | "full") => string;
  formatDuration?: (ms: number) => string;
  /** Posed hover: lane index and segment index. */
  focus?: { lane: number; segment: number } | null;
  laneHeight?: number;
  ariaLabel?: string;
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

const LABEL_W = 108;
const SHARE_W = 56;
const NARROW = 480;
const LABEL_W_NARROW = 72;
const SHARE_W_NARROW = 50;
const TOP = 30;
const AXIS_H = 22;
const OVERVIEW_H = 34;
const OVERVIEW_GAP = 12;
const LANE_GAP = 8;
const VIEW_TAU = 0.12;
const ENTER_MS = 760;
const LANE_ENTER_MS = 460;
const MIN_SPAN = 30 * 60 * 1000;
const X_LABELS = 12;
const ATTRACT_IDLE_MS = 4000;
const ATTRACT_STEP_MS = 2600;

const fullFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
const axisFmt = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
const defaultFormatTime = (t: number, detail: "axis" | "full") => (detail === "axis" ? axisFmt.format(t) : fullFmt.format(t));

function defaultFormatDuration(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h < 48) return mm ? `${h}h ${mm}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return hh ? `${d}d ${hh}h` : `${d}d`;
}

function toneColor(pal: ChartPalette, tone: StateTone): string {
  switch (tone) {
    case "ok":
      return withAlpha(pal.text, 0.1);
    case "warn":
      return pal.warning;
    case "down":
      return pal.error;
    case "accent":
      return pal.accent;
    default:
      return withAlpha(pal.text, 0.07);
  }
}

interface Run {
  vs: number;
  ve: number;
  ts: number;
  te: number;
  enter: number;
  hover: { lane: number; seg: number } | null;
  source: "pointer" | "keyboard" | "prop" | "attract" | null;
  pointerT: number | null;
  plot: { l: number; r: number; t: number; b: number; ot: number; ob: number };
  laneH: number;
  xCache: string[];
  shareCache: string[];
  drag: null | { mode: "pan" | "move" | "left" | "right"; x: number; vs: number; ve: number; id: number };
  lastInput: number;
  attractAt: number;
  attractK: number;
}

export function StateTimeline({
  lanes,
  states,
  domain,
  view,
  onViewChange,
  now,
  shareState,
  shareLabel = "Uptime",
  formatTime = defaultFormatTime,
  formatDuration = defaultFormatDuration,
  focus,
  laneHeight = 22,
  ariaLabel = "State timeline",
  tone: toneProp,
  attract = false,
  className,
}: StateTimelineProps) {
  const { pal, reduce, vars } = useChartTheme(toneProp);
  const announcer = useRef<AnnouncerHandle>(null);
  const tipRef = useRef<TooltipHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const timeTagRef = useRef<HTMLSpanElement>(null);
  const nowRef = useRef<HTMLSpanElement>(null);
  const xPool = useRef<(HTMLSpanElement | null)[]>([]);
  const sharePool = useRef<(HTMLSpanElement | null)[]>([]);
  const rectRef = useRef<DOMRect | null>(null);

  const stateMap = useMemo(() => new Map(states.map((s) => [s.id, s])), [states]);
  const shareId = shareState === false ? null : (shareState ?? states.find((s) => s.tone === "ok")?.id ?? null);
  const sorted = useMemo(() => lanes.map((l) => ({ ...l, segments: [...l.segments].sort((a, b) => a.start - b.start) })), [lanes]);

  const init = view ?? domain;
  const st = useRef<Run>({
    vs: init[0],
    ve: init[1],
    ts: init[0],
    te: init[1],
    enter: 0,
    hover: focus ? { lane: focus.lane, seg: focus.segment } : null,
    source: focus ? "prop" : null,
    pointerT: null,
    plot: { l: 0, r: 0, t: 0, b: 0, ot: 0, ob: 0 },
    laneH: laneHeight,
    xCache: [],
    shareCache: [],
    drag: null,
    lastInput: 0,
    attractAt: 0,
    attractK: 0,
  });

  const cfg = useRef({ sorted, stateMap, domain, now, shareId, formatTime, reduce, pal, attract, laneHeight, onViewChange });
  useEffect(() => {
    cfg.current = { sorted, stateMap, domain, now, shareId, formatTime, reduce, pal, attract, laneHeight, onViewChange };
  });

  const clampView = (a: number, b: number): [number, number] => {
    const [d0, d1] = cfg.current.domain;
    const full = d1 - d0;
    let w = clamp(b - a, Math.min(MIN_SPAN, full), full);
    let s = a;
    if (s < d0) s = d0;
    if (s + w > d1) s = d1 - w;
    if (!Number.isFinite(w)) w = full;
    return [s, s + w];
  };

  const tooltipFor = (lane: number, seg: number): TooltipContent | null => {
    const l = sorted[lane];
    const sg = l?.segments[seg];
    if (!sg) return null;
    const stt = stateMap.get(sg.state);
    return {
      key: `${lane}:${seg}:${pal.text}`,
      title: l.label,
      rows: [
        { key: "s", label: formatDuration(sg.end - sg.start), value: stt?.label ?? sg.state, color: stt ? (stt.tone === "ok" ? withAlpha(pal.text, 0.5) : toneColor(pal, stt.tone)) : undefined },
        { key: "t", label: "", value: `${formatTime(sg.start, "full")} – ${formatTime(sg.end, "axis")}`, strong: false },
        ...(sg.note ? [{ key: "n", label: "", value: sg.note, strong: false }] : []),
      ],
    };
  };
  const tooltipForRef = useRef(tooltipFor);
  useEffect(() => {
    tooltipForRef.current = tooltipFor;
  });

  const { rootRef, hostRef, canvasRef, wake } = useChartCanvas(({ ctx, w, h, dt }) => {
    const s = st.current;
    const c = cfg.current;
    const p = c.pal;
    const L = c.sorted;
    const [d0, d1] = c.domain;

    // Attract: zoom into each incident in turn, then back out.
    if (c.attract && !c.reduce) {
      const nowMs = performance.now();
      if ((!s.lastInput || nowMs - s.lastInput > ATTRACT_IDLE_MS) && nowMs - s.attractAt > ATTRACT_STEP_MS) {
        s.attractAt = nowMs;
        const incidents: { lane: number; seg: number; sg: TimelineSegment }[] = [];
        L.forEach((l, li) => l.segments.forEach((sg, si) => c.stateMap.get(sg.state)?.tone !== "ok" && incidents.push({ lane: li, seg: si, sg })));
        s.attractK = (s.attractK + 1) % (incidents.length + 1);
        if (s.attractK === incidents.length || !incidents.length) {
          [s.ts, s.te] = [d0, d1];
          s.hover = null;
          tipRef.current?.set(null);
        } else {
          const it = incidents[s.attractK];
          const mid = (it.sg.start + it.sg.end) / 2;
          const span = Math.max((d1 - d0) / 6, (it.sg.end - it.sg.start) * 4);
          [s.ts, s.te] = clampView(mid - span / 2, mid + span / 2);
          s.hover = { lane: it.lane, seg: it.seg };
          s.source = "attract";
          tipRef.current?.set(tooltipForRef.current(it.lane, it.seg));
        }
      }
    }

    if (c.reduce || s.drag) {
      s.vs = s.ts;
      s.ve = s.te;
    } else {
      s.vs = damp(s.vs, s.ts, VIEW_TAU, dt);
      s.ve = damp(s.ve, s.te, VIEW_TAU, dt);
    }
    const span = d1 - d0;
    const settled = Math.abs(s.vs - s.ts) + Math.abs(s.ve - s.te) < span * 1e-5;
    if (settled) {
      s.vs = s.ts;
      s.ve = s.te;
    }

    const laneH = c.laneHeight;
    s.laneH = laneH;
    const narrow = w < NARROW;
    const labelW = narrow ? LABEL_W_NARROW : LABEL_W;
    const plot = {
      l: labelW,
      r: Math.max(labelW + 60, w - (narrow ? SHARE_W_NARROW : SHARE_W)),
      t: TOP,
      b: TOP + L.length * laneH + Math.max(0, L.length - 1) * LANE_GAP,
      ot: 0,
      ob: 0,
    };
    plot.ot = plot.b + AXIS_H + OVERVIEW_GAP;
    plot.ob = Math.min(h - 2, plot.ot + OVERVIEW_H);
    s.plot = plot;
    const pW = plot.r - plot.l;
    const xOf = (t: number) => plot.l + ((t - s.vs) / Math.max(1, s.ve - s.vs)) * pW;
    const oxOf = (t: number) => plot.l + ((t - d0) / Math.max(1, span)) * pW;
    const laneY = (i: number) => plot.t + i * (laneH + LANE_GAP);

    s.enter = c.reduce ? 1 : Math.min(1, s.enter + (dt * 1000) / ENTER_MS);
    const revealOf = (i: number) => {
      if (s.enter >= 1) return 1;
      const delay = (i / Math.max(1, L.length)) * (ENTER_MS - LANE_ENTER_MS);
      return easeOut(clamp((s.enter * ENTER_MS - delay) / LANE_ENTER_MS, 0, 1));
    };

    // Time gridlines and labels for the view.
    const ticks = timeTicks(s.vs, s.ve, pW, narrow ? 52 : 80);
    ctx.lineWidth = 1;
    ctx.strokeStyle = p.hair;
    ctx.beginPath();
    for (const tk of ticks) {
      const x = crisp(xOf(tk.t));
      ctx.moveTo(x, plot.t - 4);
      ctx.lineTo(x, plot.b + 4);
    }
    ctx.stroke();
    writeLabels(
      xPool.current,
      s.xCache,
      ticks.filter((tk) => xOf(tk.t) > plot.l + 14 && xOf(tk.t) < plot.r - 14).map((tk) => ({ text: tk.label, x: xOf(tk.t), y: plot.b + 14, ax: -50 })),
    );

    // Lanes.
    const hatch = hatchPattern(ctx, withAlpha(p.text, 0.16), 4, 1);
    // Planned states (accent) are a hatched wash, so they never read as the solid red of an outage.
    const planned = hatchPattern(ctx, p.accent, 3, 1);
    const hov = s.hover;
    const shares: { text: string; x: number; y: number; ax: number }[] = [];
    for (let i = 0; i < L.length; i++) {
      const y = laneY(i);
      const rev = revealOf(i);
      const clipR = plot.l + pW * rev;
      ctx.save();
      ctx.beginPath();
      ctx.rect(plot.l, y - 2, clipR - plot.l, laneH + 4);
      ctx.clip();
      // Track behind the lane, so gaps in data read as gaps.
      ctx.fillStyle = withAlpha(p.text, 0.035);
      ctx.beginPath();
      roundRectPath(ctx, plot.l, y, pW, laneH, 4, 4);
      ctx.fill();
      let okMs = 0;
      let seenMs = 0;
      const segs = L[i].segments;
      for (let k = 0; k < segs.length; k++) {
        const sg = segs[k];
        if (sg.end < s.vs || sg.start > s.ve) continue;
        const stt = c.stateMap.get(sg.state);
        const a = Math.max(sg.start, s.vs);
        const b = Math.min(sg.end, s.ve);
        seenMs += b - a;
        if (stt && stt.id === c.shareId) okMs += b - a;
        let x0 = xOf(sg.start);
        let x1 = xOf(sg.end);
        // 2px surface gap between neighbours, unless the segment is too thin to lose it.
        if (x1 - x0 > 4) {
          x0 += 1;
          x1 -= 1;
        }
        const sw = Math.max(1.5, x1 - x0);
        const isHover = !!hov && hov.lane === i && hov.seg === k;
        ctx.beginPath();
        roundRectPath(ctx, x0, y, sw, laneH, Math.min(3, sw / 2), Math.min(3, sw / 2));
        const isPlanned = stt?.tone === "accent" && !!planned;
        ctx.fillStyle = isPlanned ? withAlpha(p.accent, 0.3) : stt ? toneColor(p, stt.tone) : withAlpha(p.text, 0.1);
        ctx.globalAlpha = hov && !isHover ? 0.78 : 1;
        ctx.fill();
        if (stt?.tone === "idle" && hatch) {
          ctx.fillStyle = hatch;
          ctx.fill();
        }
        if (isPlanned) {
          ctx.fillStyle = planned;
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        if (isHover) {
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = p.text;
          ctx.beginPath();
          roundRectPath(ctx, x0 - 1.5, y - 1.5, sw + 3, laneH + 3, 4, 4);
          ctx.stroke();
        }
      }
      ctx.restore();
      if (c.shareId) shares.push({ text: seenMs > 0 ? formatPercent(okMs / seenMs, okMs / seenMs > 0.999 && okMs < seenMs ? 2 : 1) : "–", x: w, y: y + laneH / 2, ax: -100 });
    }
    writeLabels(sharePool.current, s.shareCache, shares.map((sh, i) => ({ ...sh, opacity: revealOf(i) })));

    // Now marker.
    if (c.now !== undefined && c.now >= s.vs && c.now <= s.ve) {
      const x = crisp(xOf(c.now));
      ctx.strokeStyle = p.accentInk;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, plot.t - 8);
      ctx.lineTo(x, plot.b + 4);
      ctx.stroke();
      if (nowRef.current) {
        // Flip to the left of the line near the right edge, clear of the gutter header.
        const flip = x > plot.r - 40;
        nowRef.current.style.opacity = "1";
        nowRef.current.style.transform = `translate3d(${(flip ? x - 5 : x + 5).toFixed(1)}px, ${(plot.t - 6).toFixed(1)}px, 0) translate(${flip ? "-100%" : "0"}, -100%)`;
      }
    } else if (nowRef.current) nowRef.current.style.opacity = "0";

    // Crosshair at the pointer time.
    const tag = timeTagRef.current;
    if (s.pointerT !== null && s.source === "pointer") {
      const x = crisp(xOf(s.pointerT));
      ctx.strokeStyle = p.textSoft;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, plot.t - 4);
      ctx.lineTo(x, plot.b + 4);
      ctx.stroke();
      if (tag) {
        tag.textContent = c.formatTime(s.pointerT, "full");
        const tw = tag.offsetWidth;
        tag.style.opacity = "1";
        tag.style.transform = `translate3d(${clamp(xOf(s.pointerT) - tw / 2, plot.l, plot.r - tw).toFixed(1)}px, ${(plot.b + 5).toFixed(1)}px, 0)`;
      }
    } else if (tag) tag.style.opacity = "0";

    // Tooltip anchor: the pointer time inside the hovered segment, or the segment's visible middle.
    const tip = tipRef.current;
    if (tip?.el && hov) {
      const sg = L[hov.lane]?.segments[hov.seg];
      if (sg) {
        const a = Math.max(sg.start, s.vs);
        const b = Math.min(sg.end, s.ve);
        const t = s.source === "pointer" && s.pointerT !== null ? clamp(s.pointerT, a, b) : (a + b) / 2;
        tip.el.style.visibility = b < a ? "hidden" : "visible";
        const pos = placeTooltip(xOf(t), laneY(hov.lane), tip.size.w, tip.size.h, w, h, 10);
        tip.el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      }
    }

    // Overview: every lane as a hairline, incidents in colour, and the brush window.
    if (plot.ob - plot.ot > 12) {
      const oT = plot.ot;
      const oB = plot.ob;
      ctx.fillStyle = withAlpha(p.text, 0.03);
      ctx.beginPath();
      roundRectPath(ctx, plot.l, oT, pW, oB - oT, 6, 6);
      ctx.fill();
      const rowGap = (oB - oT - 10) / Math.max(1, L.length - 1);
      for (let i = 0; i < L.length; i++) {
        const y = Math.round(oT + 5 + i * rowGap) + 0.5;
        ctx.strokeStyle = withAlpha(p.text, 0.14);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(plot.l + 4, y);
        ctx.lineTo(plot.r - 4, y);
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        for (const sg of L[i].segments) {
          const stt = c.stateMap.get(sg.state);
          if (!stt || stt.tone === "ok") continue;
          ctx.strokeStyle = stt.tone === "accent" ? withAlpha(p.accent, 0.5) : toneColor(p, stt.tone);
          ctx.beginPath();
          const a = oxOf(sg.start);
          const b = Math.max(a + 0.5, oxOf(sg.end));
          ctx.moveTo(a, y);
          ctx.lineTo(b, y);
          ctx.stroke();
        }
        ctx.lineCap = "butt";
      }
      const bx0 = oxOf(s.vs);
      const bx1 = oxOf(s.ve);
      const full = s.vs <= d0 + 1 && s.ve >= d1 - 1;
      if (!full) {
        // Dim what is outside the window.
        ctx.fillStyle = withAlpha(p.stage, 0.62);
        ctx.fillRect(plot.l, oT, bx0 - plot.l, oB - oT);
        ctx.fillRect(bx1, oT, plot.r - bx1, oB - oT);
      }
      ctx.fillStyle = withAlpha(p.accent, full ? 0.05 : 0.08);
      ctx.fillRect(bx0, oT, bx1 - bx0, oB - oT);
      ctx.strokeStyle = withAlpha(p.accentInk, full ? 0.45 : 0.9);
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(bx0) + 0.5, oT + 0.5, Math.max(1, Math.round(bx1 - bx0) - 1), oB - oT - 1);
      // Grips.
      for (const gx of [bx0, bx1]) {
        ctx.fillStyle = p.accent;
        ctx.beginPath();
        roundRectPath(ctx, gx - 2.5, (oT + oB) / 2 - 8, 5, 16, 2.5, 2.5);
        ctx.fill();
      }
    }

    return !settled || s.enter < 1 || !!s.drag || (c.attract && !c.reduce);
  });

  // Prop sync.
  useEffect(() => {
    if (!view) return;
    const s = st.current;
    [s.ts, s.te] = clampView(view[0], view[1]);
    wake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.[0], view?.[1], wake]);

  useEffect(() => {
    const s = st.current;
    if (!view) [s.ts, s.te] = clampView(s.ts, s.te);
    wake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lanes, states, domain[0], domain[1], pal, reduce, attract, wake]);

  useEffect(() => {
    if (focus === undefined) return;
    const s = st.current;
    s.hover = focus ? { lane: focus.lane, seg: focus.segment } : null;
    s.source = focus ? "prop" : null;
    tipRef.current?.set(focus ? tooltipFor(focus.lane, focus.segment) : null);
    wake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.lane, focus?.segment, pal, wake]);

  const setView = (a: number, b: number) => {
    const s = st.current;
    [s.ts, s.te] = clampView(a, b);
    onViewChange?.([s.ts, s.te]);
    wake();
  };

  const describe = (lane: number, seg: number) => {
    const l = sorted[lane];
    const sg = l?.segments[seg];
    if (!sg) return "";
    return `${l.label}: ${stateMap.get(sg.state)?.label ?? sg.state} for ${formatDuration(sg.end - sg.start)}, ${formatTime(sg.start, "full")} to ${formatTime(sg.end, "full")}${sg.note ? `, ${sg.note}` : ""}`;
  };

  const setHover = (hv: { lane: number; seg: number } | null, source: Run["source"]) => {
    const s = st.current;
    const same = (hv === null && s.hover === null) || (hv && s.hover && hv.lane === s.hover.lane && hv.seg === s.hover.seg);
    s.hover = hv;
    s.source = hv ? source : source === "pointer" ? "pointer" : null;
    if (!same) {
      tipRef.current?.set(hv ? tooltipFor(hv.lane, hv.seg) : null);
      if (hv && source === "keyboard") announcer.current?.say(describe(hv.lane, hv.seg));
    }
    wake();
  };

  const local = (e: PointerEvent<HTMLDivElement>) => {
    const r = rectRef.current ?? wrapperRef.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : null;
  };

  const hitLane = (y: number) => {
    const s = st.current;
    for (let i = 0; i < sorted.length; i++) {
      const top = s.plot.t + i * (s.laneH + LANE_GAP);
      if (y >= top - LANE_GAP / 2 && y <= top + s.laneH + LANE_GAP / 2) return i;
    }
    return -1;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    st.current.lastInput = performance.now();
    if (wrapperRef.current) rectRef.current = wrapperRef.current.getBoundingClientRect();
    const pt = local(e);
    if (!pt) return;
    const s = st.current;
    const [d0, d1] = domain;
    const inOverview = pt.y >= s.plot.ot - 4 && pt.y <= s.plot.ob + 4 && pt.x >= s.plot.l - 8 && pt.x <= s.plot.r + 8;
    const inPlot = pt.y >= s.plot.t - 4 && pt.y <= s.plot.b + 4 && pt.x >= s.plot.l && pt.x <= s.plot.r;
    if (!inOverview && !inPlot) return;
    let mode: "pan" | "move" | "left" | "right" = "pan";
    if (inOverview) {
      const ox = (t: number) => s.plot.l + ((t - d0) / (d1 - d0)) * (s.plot.r - s.plot.l);
      const bx0 = ox(s.ts);
      const bx1 = ox(s.te);
      if (Math.abs(pt.x - bx0) < 10) mode = "left";
      else if (Math.abs(pt.x - bx1) < 10) mode = "right";
      else if (pt.x > bx0 && pt.x < bx1) mode = "move";
      else {
        // Jump: centre the window on the click.
        const t = d0 + ((pt.x - s.plot.l) / (s.plot.r - s.plot.l)) * (d1 - d0);
        const wv = s.te - s.ts;
        setView(t - wv / 2, t + wv / 2);
        mode = "move";
      }
    }
    s.drag = { mode, x: pt.x, vs: s.ts, ve: s.te, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    wake();
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    st.current.lastInput = performance.now();
    const pt = local(e);
    if (!pt) return;
    const s = st.current;
    const [d0, d1] = domain;
    const pW = s.plot.r - s.plot.l;
    if (s.drag && s.drag.id === e.pointerId) {
      const dx = pt.x - s.drag.x;
      const dOver = (dx / pW) * (d1 - d0);
      const dView = (dx / pW) * (s.drag.ve - s.drag.vs);
      if (s.drag.mode === "pan") setView(s.drag.vs - dView, s.drag.ve - dView);
      else if (s.drag.mode === "move") setView(s.drag.vs + dOver, s.drag.ve + dOver);
      else if (s.drag.mode === "left") setView(Math.min(s.drag.vs + dOver, s.drag.ve - MIN_SPAN), s.drag.ve);
      else setView(s.drag.vs, Math.max(s.drag.ve + dOver, s.drag.vs + MIN_SPAN));
      return;
    }
    if (pt.x < s.plot.l || pt.x > s.plot.r || pt.y < s.plot.t - 6 || pt.y > s.plot.b + 6) {
      if (s.source === "pointer") {
        s.pointerT = null;
        setHover(null, null);
      }
      return;
    }
    const t = s.vs + ((pt.x - s.plot.l) / pW) * (s.ve - s.vs);
    s.pointerT = t;
    const lane = hitLane(pt.y);
    let hv: { lane: number; seg: number } | null = null;
    if (lane >= 0) {
      const segs = sorted[lane].segments;
      // Nearest segment within 6px, so thin incidents are still easy to land on.
      const slack = (6 / pW) * (s.ve - s.vs);
      let best = -1;
      let bd = Infinity;
      for (let k = 0; k < segs.length; k++) {
        const sg = segs[k];
        const d = t < sg.start ? sg.start - t : t > sg.end ? t - sg.end : 0;
        // Prefer incidents over the quiet state when both are in reach.
        const quiet = stateMap.get(sg.state)?.tone === "ok" ? slack * 0.5 : 0;
        if (d <= slack && d + quiet < bd) {
          bd = d + quiet;
          best = k;
        }
      }
      if (best >= 0) hv = { lane, seg: best };
    }
    s.source = "pointer";
    setHover(hv, "pointer");
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const s = st.current;
    if (s.drag && s.drag.id === e.pointerId) {
      s.drag = null;
      wake();
    }
  };

  // Wheel zoom around the pointer: pinch always, plain wheel once focused.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const focused = el.contains(document.activeElement);
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (!e.ctrlKey && !focused && !horizontal) return;
      e.preventDefault();
      const s = st.current;
      s.lastInput = performance.now();
      const rect = el.getBoundingClientRect();
      const x = clamp(e.clientX - rect.left, s.plot.l, s.plot.r);
      const pW = s.plot.r - s.plot.l;
      if (horizontal && !e.ctrlKey) {
        const dt = (e.deltaX / pW) * (s.te - s.ts);
        setView(s.ts + dt, s.te + dt);
        return;
      }
      const anchor = s.ts + ((x - s.plot.l) / pW) * (s.te - s.ts);
      const k = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      const frac = (anchor - s.ts) / (s.te - s.ts);
      const wv = (s.te - s.ts) * k;
      setView(anchor - frac * wv, anchor - frac * wv + wv);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wake]);

  const ensureVisible = (sg: TimelineSegment) => {
    const s = st.current;
    const wv = s.te - s.ts;
    if (sg.end - sg.start > wv * 0.9) return;
    if (sg.start < s.ts || sg.end > s.te) {
      const mid = (sg.start + sg.end) / 2;
      setView(mid - wv / 2, mid + wv / 2);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = st.current;
    s.lastInput = performance.now();
    if (!sorted.length) return;
    const cur = s.hover && s.source !== "attract" ? s.hover : null;
    let next: { lane: number; seg: number } | null = null;
    const nearestIn = (lane: number, t: number) => {
      const segs = sorted[lane].segments;
      let best = 0;
      let bd = Infinity;
      segs.forEach((sg, k) => {
        const d = t < sg.start ? sg.start - t : t > sg.end ? t - sg.end : 0;
        if (d < bd) {
          bd = d;
          best = k;
        }
      });
      return best;
    };
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      if (!cur) next = { lane: 0, seg: nearestIn(0, (s.ts + s.te) / 2) };
      else {
        const segs = sorted[cur.lane].segments;
        next = { lane: cur.lane, seg: clamp(cur.seg + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 5 : 1), 0, segs.length - 1) };
      }
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const lane = cur ? clamp(cur.lane + (e.key === "ArrowDown" ? 1 : -1), 0, sorted.length - 1) : 0;
      const ref = cur ? sorted[cur.lane].segments[cur.seg] : null;
      const t = ref ? (Math.max(ref.start, s.ts) + Math.min(ref.end, s.te)) / 2 : (s.ts + s.te) / 2;
      next = { lane, seg: nearestIn(lane, t) };
    } else if (e.key === "+" || e.key === "=" || e.key === "-" || e.key === "_") {
      e.preventDefault();
      const k = e.key === "+" || e.key === "=" ? 0.6 : 1 / 0.6;
      const ref = cur ? sorted[cur.lane].segments[cur.seg] : null;
      const anchor = ref ? (ref.start + ref.end) / 2 : (s.ts + s.te) / 2;
      const wv = (s.te - s.ts) * k;
      setView(anchor - wv / 2, anchor + wv / 2);
      return;
    } else if (e.key === "0") {
      e.preventDefault();
      setView(domain[0], domain[1]);
      return;
    } else if (e.key === "Escape") {
      if (!s.hover) return;
      e.preventDefault();
      setHover(null, null);
      return;
    }
    if (!next) return;
    e.preventDefault();
    s.pointerT = null;
    const sg = sorted[next.lane].segments[next.seg];
    if (sg) ensureVisible(sg);
    setHover(next, "keyboard");
  };

  const legend = useMemo(
    () => states.map((s2) => ({ id: s2.id, label: s2.label, color:
          s2.tone === "ok"
            ? withAlpha(pal.text, 0.3)
            : s2.tone === "accent"
              ? `repeating-linear-gradient(135deg, ${pal.accent} 0 1px, ${withAlpha(pal.accent, 0.3)} 1px 3px)`
              : toneColor(pal, s2.tone),
        shape: "rect" as const,
      })),
    [states, pal],
  );

  const tableRows = useMemo(
    () => sorted.flatMap((l) => l.segments.map((sg) => [l.label, stateMap.get(sg.state)?.label ?? sg.state, formatTime(sg.start, "full"), formatTime(sg.end, "full"), formatDuration(sg.end - sg.start)])),
    [sorted, stateMap, formatTime, formatDuration],
  );
  const tableCols = useMemo(() => ["Lane", "State", "Start", "End", "Duration"], []);
  const incidents = tableRows.filter((r) => r[1] !== (shareId ? stateMap.get(shareId)?.label : "")).length;

  const height = TOP + lanes.length * laneHeight + Math.max(0, lanes.length - 1) * LANE_GAP + AXIS_H + OVERVIEW_GAP + OVERVIEW_H + 2;

  return (
    <div ref={rootRef} data-loop="idle" className={cn("@container relative w-full select-none text-[color:var(--bjork-text)]", className)} style={{ ...vars, height }}>
      <div
        ref={wrapperRef}
        role="group"
        aria-roledescription="chart"
        aria-label={`${ariaLabel}. Up and down change lane, left and right move between segments, plus and minus zoom, 0 shows everything.`}
        tabIndex={0}
        onPointerEnter={() => {
          if (wrapperRef.current) rectRef.current = wrapperRef.current.getBoundingClientRect();
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => {
          const s = st.current;
          if (s.source === "pointer") {
            s.pointerT = null;
            setHover(null, null);
          }
        }}
        onDoubleClick={() => setView(domain[0], domain[1])}
        onKeyDown={onKeyDown}
        className={cn("absolute inset-0 touch-pan-y rounded-[10px]", chartFocusRing)}
      >
        <div ref={hostRef} className="absolute inset-0">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`${ariaLabel}: ${lanes.length} lanes, ${incidents} non-${shareId ? (stateMap.get(shareId)?.label ?? "ok").toLowerCase() : "ok"} periods`}
            className="pointer-events-none absolute left-0 top-0"
          />
        </div>
        <ChartLegend items={legend} className="pointer-events-none absolute top-0" />
        {shareId && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-0 font-mono text-[9px] uppercase leading-none tracking-[0.1em] text-[color:var(--bjork-text-soft)] [text-box:trim-both_cap_alphabetic]"
            style={{ top: TOP - 14 }}
          >
            {shareLabel}
          </span>
        )}
        {sorted.map((l, i) => (
          <span
            key={l.id}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 flex max-w-[100px] items-center truncate font-bjork-alpha text-[12px] font-medium leading-none text-[color:var(--bjork-text-medium)] @max-[480px]:max-w-[66px] @max-[480px]:text-[11px]"
            style={{ top: TOP + i * (laneHeight + LANE_GAP), height: laneHeight }}
          >
            {l.label}
          </span>
        ))}
        <LabelPool count={X_LABELS} pool={xPool} />
        <LabelPool count={lanes.length} pool={sharePool} className="font-mono text-[11px] leading-none tabular-nums text-[color:var(--bjork-text-muted)] [text-box:trim-both_cap_alphabetic]" />
        <span
          ref={nowRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 font-mono text-[9px] uppercase leading-none tracking-[0.1em] text-[color:var(--bjork-accent-ink)] opacity-0 [text-box:trim-both_cap_alphabetic]"
        >
          Now
        </span>
        <span
          ref={timeTagRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 inline-flex h-[18px] items-center whitespace-nowrap rounded-[6px] border border-[color:var(--bjork-border-strong)] bg-[color:var(--bjork-surface-hover)] px-1.5 font-mono text-[10px] leading-none tabular-nums text-[color:var(--bjork-text)] opacity-0 [text-box:trim-both_cap_alphabetic]"
        />
        <HoverTooltip ref={tipRef} onMeasure={wake} />
      </div>
      <ChartTable caption={ariaLabel} columns={tableCols} rows={tableRows} />
      <ChartAnnouncer ref={announcer} />
    </div>
  );
}

// Seeded demo data: services over a window, mostly healthy, with a few incidents and maintenance.
export function createIncidentLanes(seed: number, names: string[], domain: [number, number]): TimelineLane[] {
  const rnd = mulberry32(seed);
  const [d0, d1] = domain;
  const span = d1 - d0;
  return names.map((label, i) => {
    const segments: TimelineSegment[] = [];
    let t = d0;
    const events = 1 + Math.floor(rnd() * 3) + (i === 2 ? 2 : 0);
    const marks = Array.from({ length: events }, () => d0 + rnd() * span * 0.94).sort((a, b) => a - b);
    for (const m of marks) {
      if (m <= t + 20 * 60000) continue;
      segments.push({ start: t, end: m, state: "ok" });
      const r = rnd();
      const state = r < 0.45 ? "degraded" : r < 0.75 ? "down" : "maintenance";
      const len = state === "maintenance" ? 2 * 3600000 : (0.3 + rnd() * (state === "down" ? 1.6 : 4)) * 3600000;
      const end = Math.min(d1, m + len);
      segments.push({
        start: m,
        end,
        state,
        note: state === "down" ? "5xx above 20%" : state === "degraded" ? "p95 over SLO" : "Planned window",
      });
      t = end;
    }
    if (t < d1) segments.push({ start: t, end: d1, state: "ok" });
    return { id: label.toLowerCase().replace(/\s+/g, "-"), label, segments };
  });
}
