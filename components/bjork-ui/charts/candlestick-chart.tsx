"use client";

import {
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { cn } from "@/lib/utils";
import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useChartCanvas, easeOut } from "@/components/bjork-ui/charts/_kit/canvas";
import { useChartTheme, chartFocusRing, ChartTable, ChartAnnouncer, type AnnouncerHandle } from "@/components/bjork-ui/charts/_kit/chrome";
import { clamp, crisp, damp, niceTicks, withAlpha, formatPercent, formatCompact } from "@/components/bjork-ui/charts/_kit/scale";

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

export interface CandlestickChartProps {
  data: Candle[];
  /** "ink": hollow rising, solid falling. "semantic": success and error fills. */
  palette?: "ink" | "semantic";
  /** Index window [start, end) to show. Uncontrolled by default. */
  visible?: [number, number];
  defaultVisibleCount?: number;
  onVisibleChange?: (range: [number, number]) => void;
  /** Posed crosshair index. `null` hides it. Pointer and keys take over when they move. */
  cursor?: number | null;
  onCursorChange?: (index: number | null, candle: Candle | null) => void;
  showVolume?: boolean;
  formatPrice?: (v: number) => string;
  formatTime?: (t: number, detail: "axis" | "full") => string;
  formatVolume?: (v: number) => string;
  height?: number;
  ariaLabel?: string;
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

const PAD_TOP = 30; // readout row
const PAD_BOTTOM = 24; // time labels
const PAD_LEFT = 8;
const GUTTER = 64; // price labels and the last-price badge
const VOL_FRAC = 0.2;
const VOL_GAP = 8;
const MIN_CANDLES = 12;
const ENTER_MS = 900;
const CANDLE_ENTER_MS = 320;
const RANGE_TAU = 0.4;
const CONTRACT_PX = 2;
const VIEW_TAU = 0.12;
const HEAD_EASING = 0.12;
const ATTRACT_STEP_MS = 240;
const ATTRACT_IDLE_MS = 4000;
const PRICE_LABELS = 6;
const TABLE_COLUMNS = ["Date", "Open", "High", "Low", "Close", "Volume"];
const TIME_LABELS = 10;

const defaultFormatPrice = (v: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const defaultFormatVolume = (v: number) => formatCompact(v);
const axisDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const fullDate = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const defaultFormatTime = (t: number, detail: "axis" | "full") => (detail === "axis" ? axisDate : fullDate).format(t);

interface RunState {
  vs: number;
  ve: number;
  ts: number;
  te: number;
  range: { lo: number; hi: number } | null;
  volMax: number;
  enter: number;
  head: { c: number; h: number; l: number } | null;
  cursor: number | null;
  cursorSource: "pointer" | "keyboard" | "prop" | "attract" | null;
  pointerY: number | null;
  plot: { l: number; r: number; t: number; b: number; vb: number };
  cw: number;
  readoutKey: string;
  priceText: string[];
  timeText: string[];
  badgeText: string;
  lastInput: number;
  attractAt: number;
  follow: boolean;
  autoFit: boolean;
  drag: { x: number; vs: number; ve: number; id: number; moved: boolean } | null;
}

export function CandlestickChart({
  data,
  palette = "ink",
  visible,
  defaultVisibleCount = 80,
  onVisibleChange,
  cursor,
  onCursorChange,
  showVolume = true,
  formatPrice = defaultFormatPrice,
  formatTime = defaultFormatTime,
  formatVolume = defaultFormatVolume,
  height = 360,
  ariaLabel = "Candlestick chart",
  tone: toneProp,
  attract = false,
  className,
}: CandlestickChartProps) {
  const { pal, reduce, vars } = useChartTheme(toneProp);
  const announcer = useRef<AnnouncerHandle>(null);
  const say = (m: string) => announcer.current?.say(m);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const priceTagRef = useRef<HTMLSpanElement>(null);
  const timeTagRef = useRef<HTMLSpanElement>(null);
  const priceLabelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const timeLabelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rectRef = useRef<DOMRect | null>(null);

  const n = data.length;
  const initialCount = Math.min(n, defaultVisibleCount);
  const init: [number, number] = visible ?? [Math.max(0, n - initialCount), n];

  const cfg = useRef({ defaultVisibleCount, data, palette, showVolume, formatPrice, formatTime, formatVolume, reduce, attract, pal, onCursorChange, onVisibleChange, ariaLabel });
  useEffect(() => {
    cfg.current = { defaultVisibleCount, data, palette, showVolume, formatPrice, formatTime, formatVolume, reduce, attract, pal, onCursorChange, onVisibleChange, ariaLabel };
  });

  const st = useRef<RunState>({
    vs: init[0],
    ve: init[1],
    ts: init[0],
    te: init[1],
    range: null,
    volMax: 0,
    enter: 0,
    head: null,
    cursor: cursor ?? null,
    cursorSource: cursor != null ? "prop" : null,
    pointerY: null,
    plot: { l: 0, r: 0, t: 0, b: 0, vb: 0 },
    cw: 1,
    readoutKey: "",
    priceText: [],
    timeText: [],
    badgeText: "",
    lastInput: 0,
    attractAt: 0,
    follow: !visible,
    autoFit: !visible,
    drag: null,
  });

  const clampView = (s: number, e: number, len: number): [number, number] => {
    const maxW = Math.max(MIN_CANDLES, len + 4);
    let w = clamp(e - s, Math.min(MIN_CANDLES, Math.max(len, 1)), maxW);
    if (!Number.isFinite(w)) w = MIN_CANDLES;
    let a = s;
    let b = s + w;
    const lo = -2;
    const hi = len + 3;
    if (a < lo) {
      a = lo;
      b = a + w;
    }
    if (b > hi) {
      b = hi;
      a = b - w;
    }
    return [a, b];
  };

  const { rootRef, hostRef, canvasRef, wake } = useChartCanvas(({ ctx, w, h, dt }) => {
    const s = st.current;
    const c = cfg.current;
    const p = c.pal;
    const rows = c.data;
    const len = rows.length;
    if (!len) return false;

    // Attract: a slow scrub across the window while nobody is touching the chart.
    if (c.attract && !c.reduce) {
      const now = performance.now();
      const idle = !s.lastInput || now - s.lastInput > ATTRACT_IDLE_MS;
      if (idle && (s.cursorSource === null || s.cursorSource === "attract") && now - s.attractAt > ATTRACT_STEP_MS) {
        s.attractAt = now;
        const a = Math.max(0, Math.ceil(s.vs));
        const b = Math.min(len - 1, Math.floor(s.ve - 1));
        const next = s.cursor === null || s.cursor >= b ? a : s.cursor + 1;
        s.cursor = next;
        s.cursorSource = "attract";
      }
    }

    // Until the reader zooms, the window fits the width: candles stay at least 7px apart.
    if (s.autoFit) {
      const want = Math.min(len, cfg.current.defaultVisibleCount, Math.max(MIN_CANDLES, Math.floor((w - GUTTER - PAD_LEFT) / 7)));
      if (Math.abs(s.te - s.ts - want) > 0.5 || s.te !== len) {
        const first = s.enter === 0;
        s.ts = len - want;
        s.te = len;
        if (first) {
          s.vs = s.ts;
          s.ve = s.te;
        }
      }
    }

    // View window: damped toward its target, so zoom and pan glide.
    if (c.reduce || s.drag) {
      s.vs = s.ts;
      s.ve = s.te;
    } else {
      s.vs = damp(s.vs, s.ts, VIEW_TAU, dt);
      s.ve = damp(s.ve, s.te, VIEW_TAU, dt);
    }
    const viewSettled = Math.abs(s.vs - s.ts) < 1e-3 && Math.abs(s.ve - s.te) < 1e-3;
    if (viewSettled) {
      s.vs = s.ts;
      s.ve = s.te;
    }

    const volH = c.showVolume ? Math.round((h - PAD_TOP - PAD_BOTTOM) * VOL_FRAC) : 0;
    const plot = {
      l: PAD_LEFT,
      r: Math.max(PAD_LEFT + 40, w - GUTTER),
      t: PAD_TOP,
      b: h - PAD_BOTTOM - (volH ? volH + VOL_GAP : 0),
      vb: h - PAD_BOTTOM,
    };
    s.plot = plot;
    const pW = plot.r - plot.l;
    const pH = plot.b - plot.t;
    const span = Math.max(1e-6, s.ve - s.vs);
    const cw = pW / span;
    s.cw = cw;
    const xOf = (i: number) => plot.l + (i + 0.5 - s.vs) * cw;

    // Forming candle: the last close, high and low approach their new values with a damped step.
    const last = rows[len - 1];
    if (!s.head || c.reduce) s.head = { c: last.c, h: last.h, l: last.l };
    else {
      const a = 1 - Math.pow(1 - HEAD_EASING, dt * 60);
      s.head.c += (last.c - s.head.c) * a;
      s.head.h += (last.h - s.head.h) * a;
      s.head.l += (last.l - s.head.l) * a;
    }
    const headSettled = Math.abs(s.head.c - last.c) + Math.abs(s.head.h - last.h) + Math.abs(s.head.l - last.l) < 1e-6 * Math.max(1, Math.abs(last.c));
    const valueAt = (i: number) => {
      const r = rows[i];
      if (i === len - 1 && s.head) return { o: r.o, h: Math.max(s.head.h, r.o, s.head.c), l: Math.min(s.head.l, r.o, s.head.c), c: s.head.c };
      return r;
    };

    // Entrance: candles rise out of their open price, left to right.
    if (c.reduce) s.enter = 1;
    else s.enter = Math.min(1, s.enter + (dt * 1000) / ENTER_MS);
    const i0 = Math.max(0, Math.floor(s.vs) - 1);
    const i1 = Math.min(len - 1, Math.ceil(s.ve) + 1);
    const visCount = Math.max(1, i1 - i0 + 1);
    const growOf = (i: number) => {
      if (s.enter >= 1) return 1;
      const delay = ((i - i0) / visCount) * (ENTER_MS - CANDLE_ENTER_MS);
      return easeOut(clamp((s.enter * ENTER_MS - delay) / CANDLE_ENTER_MS, 0, 1));
    };

    // Y range over the visible candles: expands the same frame, contracts slowly (never clips).
    let lo = Infinity;
    let hi = -Infinity;
    let vMax = 0;
    for (let i = Math.max(0, Math.floor(s.vs)); i <= Math.min(len - 1, Math.ceil(s.ve) - 1); i++) {
      const r = valueAt(i);
      if (r.l < lo) lo = r.l;
      if (r.h > hi) hi = r.h;
      if ((rows[i].v ?? 0) > vMax) vMax = rows[i].v ?? 0;
    }
    if (!Number.isFinite(lo)) {
      lo = last.l;
      hi = last.h;
    }
    const padY = Math.max((hi - lo) * 0.08, Math.abs(hi) * 1e-4, 1e-6);
    const tLo = lo - padY;
    const tHi = hi + padY;
    if (!s.range) s.range = { lo: tLo, hi: tHi };
    const range = s.range;
    if (tLo < range.lo) range.lo = tLo;
    if (tHi > range.hi) range.hi = tHi;
    if (c.reduce) {
      range.lo = tLo;
      range.hi = tHi;
    } else {
      const pxPer = pH / Math.max(1e-9, range.hi - range.lo);
      const cap = CONTRACT_PX / pxPer;
      const k = 1 - Math.exp(-dt / RANGE_TAU);
      if (tLo > range.lo) range.lo += Math.min(cap, (tLo - range.lo) * k);
      if (tHi < range.hi) range.hi -= Math.min(cap, (range.hi - tHi) * k);
    }
    const rangeSettled = Math.abs(range.lo - tLo) + Math.abs(range.hi - tHi) < 1e-4 * (tHi - tLo);
    if (rangeSettled) {
      range.lo = tLo;
      range.hi = tHi;
    }
    const yOf = (v: number) => plot.t + ((range.hi - v) / Math.max(1e-9, range.hi - range.lo)) * pH;
    s.volMax = c.reduce || !s.volMax ? vMax : damp(s.volMax, vMax, RANGE_TAU, dt);
    const volSettled = Math.abs(s.volMax - vMax) < 1e-6 * Math.max(1, vMax);

    // Badge and crosshair tags own their rows: grid labels within 14px of them hide.
    const lastY = yOf(valueAt(len - 1).c);
    const tagY = s.cursor !== null && s.cursorSource === "pointer" && s.pointerY !== null ? s.pointerY : null;
    const tagX = s.cursor !== null && s.cursor >= 0 && s.cursor < len ? xOf(s.cursor) : null;

    // Grid and price labels.
    const ticks = niceTicks(range.lo, range.hi, 5).filter((v) => v > range.lo && v < range.hi);
    ctx.lineWidth = 1;
    ctx.strokeStyle = p.hair;
    ctx.beginPath();
    for (const v of ticks) {
      const y = crisp(yOf(v));
      ctx.moveTo(plot.l, y);
      ctx.lineTo(plot.r, y);
    }
    if (volH) {
      const y = crisp(plot.vb);
      ctx.moveTo(plot.l, y);
      ctx.lineTo(plot.r, y);
    }
    ctx.stroke();
    for (let k = 0; k < PRICE_LABELS; k++) {
      const el = priceLabelRefs.current[k];
      if (!el) continue;
      if (k < ticks.length) {
        const text = c.formatPrice(ticks[k]);
        if (s.priceText[k] !== text) {
          s.priceText[k] = text;
          el.textContent = text;
        }
        const ty = yOf(ticks[k]);
        const covered = Math.abs(ty - clamp(lastY, plot.t, plot.b)) < 20 || (tagY !== null && Math.abs(ty - tagY) < 20);
        el.style.opacity = covered ? "0" : "1";
        el.style.transform = `translate3d(${(plot.r + 8).toFixed(1)}px, ${yOf(ticks[k]).toFixed(2)}px, 0) translateY(-50%)`;
      } else el.style.opacity = "0";
    }

    // Time labels: every k candles, with k a nice step that keeps labels at least 64px apart.
    const steps = [1, 2, 3, 5, 7, 10, 14, 15, 20, 25, 30, 50, 100, 200, 500, 1000];
    const every = steps.find((k) => k * cw >= 64) ?? 1000;
    let slot = 0;
    const firstLabel = Math.ceil(Math.max(0, s.vs) / every) * every;
    for (let i = firstLabel; i < Math.min(len, Math.ceil(s.ve)) && slot < TIME_LABELS; i += every) {
      const x = xOf(i);
      if (x < plot.l + 18 || x > plot.r - 18) continue;
      if (tagX !== null && Math.abs(x - tagX) < 56) continue;
      const el = timeLabelRefs.current[slot++];
      if (!el) continue;
      const text = c.formatTime(rows[i].t, "axis");
      if (s.timeText[slot - 1] !== text) {
        s.timeText[slot - 1] = text;
        el.textContent = text;
      }
      el.style.opacity = "1";
      el.style.transform = `translate3d(${x.toFixed(2)}px, ${(h - PAD_BOTTOM + 8).toFixed(1)}px, 0) translateX(-50%)`;
    }
    for (let k = slot; k < TIME_LABELS; k++) {
      const el = timeLabelRefs.current[k];
      if (el) el.style.opacity = "0";
    }

    // Candles.
    const up = c.palette === "semantic" ? p.success : p.textMedium;
    const down = c.palette === "semantic" ? p.error : p.text;
    const bodyW = Math.max(1, Math.min(18, Math.round(cw * 0.64)));
    const thin = bodyW < 3;
    const hover = s.cursor;
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.l, 0, pW, h);
    ctx.clip();

    // Volume first, so the crosshair sits over it.
    if (volH && s.volMax > 0) {
      for (let i = i0; i <= i1; i++) {
        const r = rows[i];
        if (r.v === undefined) continue;
        const g = growOf(i);
        const vh = (r.v / s.volMax) * (volH - 2) * g;
        const x = Math.round(xOf(i) - bodyW / 2);
        const rising = valueAt(i).c >= r.o;
        const base = c.palette === "semantic" ? (rising ? p.success : p.error) : p.text;
        ctx.fillStyle = withAlpha(base, (hover === i ? 0.4 : rising ? 0.1 : 0.18) * (c.palette === "semantic" ? 1.3 : 1));
        ctx.fillRect(x, Math.round(plot.vb - vh), bodyW, Math.round(vh));
      }
    }

    // The last close: a dashed accent hairline across the plot.
    const lastV = valueAt(len - 1).c;
    ctx.save();
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = withAlpha(p.accent, 0.7);
    ctx.beginPath();
    ctx.moveTo(plot.l, crisp(lastY));
    ctx.lineTo(plot.r, crisp(lastY));
    ctx.stroke();
    ctx.restore();

    for (let i = i0; i <= i1; i++) {
      const g = growOf(i);
      if (g <= 0) continue;
      const r = valueAt(i);
      const o = r.o;
      const cl = o + (r.c - o) * g;
      const hh = o + (r.h - o) * g;
      const ll = o + (r.l - o) * g;
      const rising = r.c >= r.o;
      const color = rising ? up : down;
      const xc = xOf(i);
      const dim = hover !== null && hover !== i ? 0.55 : 1;
      ctx.globalAlpha = g < 1 ? Math.min(1, 0.25 + g) * dim : dim;
      const xw = crisp(xc - 0.5);
      const yH = yOf(hh);
      const yL = yOf(ll);
      const yO = yOf(o);
      const yC = yOf(cl);
      const top = Math.min(yO, yC);
      const bot = Math.max(yO, yC);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      if (thin) {
        ctx.beginPath();
        ctx.moveTo(xw, yH);
        ctx.lineTo(xw, yL);
        ctx.stroke();
        continue;
      }
      // Wick, broken around a hollow body so it never shows through.
      const hollow = c.palette === "ink" && rising;
      ctx.beginPath();
      ctx.moveTo(xw, yH);
      ctx.lineTo(xw, hollow ? top : yL);
      if (hollow) {
        ctx.moveTo(xw, bot);
        ctx.lineTo(xw, yL);
      }
      ctx.stroke();
      const bx = Math.round(xc - bodyW / 2);
      const bh = Math.max(1, Math.round(bot - top));
      const by = Math.round(top);
      if (hollow) {
        ctx.strokeRect(bx + 0.5, by + 0.5, bodyW - 1, Math.max(0, bh - 1));
      } else {
        ctx.fillStyle = color;
        ctx.fillRect(bx, by, bodyW, bh);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Last-close badge in the gutter.
    const badge = badgeRef.current;
    if (badge) {
      const text = c.formatPrice(lastV);
      if (s.badgeText !== text) {
        s.badgeText = text;
        badge.textContent = text;
      }
      badge.style.transform = `translate3d(${(plot.r + 4).toFixed(1)}px, ${(clamp(lastY, plot.t, plot.b) - 11).toFixed(2)}px, 0)`;
      badge.style.opacity = "1";
    }

    // Crosshair, price tag, time tag and the readout row.
    const cur = s.cursor !== null && s.cursor >= 0 && s.cursor < len ? s.cursor : null;
    const priceTag = priceTagRef.current;
    const timeTag = timeTagRef.current;
    if (cur !== null) {
      const x = crisp(xOf(cur) - 0.5);
      ctx.strokeStyle = p.textSoft;
      ctx.beginPath();
      ctx.moveTo(x, plot.t);
      ctx.lineTo(x, plot.vb);
      ctx.stroke();
      if (s.pointerY !== null && s.cursorSource === "pointer" && s.pointerY >= plot.t && s.pointerY <= plot.b) {
        const y = crisp(s.pointerY);
        ctx.strokeStyle = p.textFaint;
        ctx.beginPath();
        ctx.moveTo(plot.l, y);
        ctx.lineTo(plot.r, y);
        ctx.stroke();
        if (priceTag) {
          const v = range.hi - ((s.pointerY - plot.t) / pH) * (range.hi - range.lo);
          priceTag.textContent = c.formatPrice(v);
          priceTag.style.transform = `translate3d(${(plot.r + 4).toFixed(1)}px, ${(s.pointerY - 11).toFixed(2)}px, 0)`;
          priceTag.style.opacity = "1";
        }
      } else if (priceTag) priceTag.style.opacity = "0";
      if (timeTag) {
        timeTag.textContent = c.formatTime(rows[cur].t, "axis");
        const tw = timeTag.offsetWidth;
        const tx = clamp(xOf(cur) - tw / 2, plot.l, plot.r - tw);
        timeTag.style.transform = `translate3d(${tx.toFixed(1)}px, ${(h - PAD_BOTTOM + 2).toFixed(1)}px, 0)`;
        timeTag.style.opacity = "1";
      }
    } else {
      if (priceTag) priceTag.style.opacity = "0";
      if (timeTag) timeTag.style.opacity = "0";
    }

    const ri = cur ?? len - 1;
    const rr = valueAt(ri);
    const key = `${ri}|${rr.c.toFixed(6)}|${cur === null ? "live" : "cur"}`;
    if (key !== s.readoutKey && readoutRef.current) {
      s.readoutKey = key;
      const prev = ri > 0 ? rows[ri - 1].c : rr.o;
      const chg = prev ? (rr.c - prev) / prev : 0;
      const spans = readoutRef.current.querySelectorAll<HTMLSpanElement>("[data-v]");
      const vals = [
        c.formatTime(rows[ri].t, "axis"),
        c.formatPrice(rr.o),
        c.formatPrice(rr.h),
        c.formatPrice(rr.l),
        c.formatPrice(rr.c),
        `${chg >= 0 ? "+" : ""}${formatPercent(chg, 2)}`,
        rows[ri].v !== undefined ? c.formatVolume(rows[ri].v!) : "",
      ];
      spans.forEach((el, k) => {
        el.textContent = vals[k] ?? "";
      });
      const dir = readoutRef.current.querySelector<HTMLSpanElement>("[data-dir]");
      if (dir) {
        dir.textContent = chg >= 0 ? "▲" : "▼";
        dir.style.color = chg >= 0 ? (c.palette === "semantic" ? p.success : p.accentInk) : c.palette === "semantic" ? p.error : p.textMuted;
      }
    }

    const keep =
      !viewSettled || !rangeSettled || !headSettled || !volSettled || s.enter < 1 || (c.attract && !c.reduce) || s.drag !== null;
    return keep;
  });

  // Prop sync: data, posed window and posed cursor.
  useEffect(() => {
    const s = st.current;
    const len = data.length;
    if (s.follow && !visible && len) {
      // Following the live edge: slide the window so the newest candle stays in view.
      const w = s.te - s.ts;
      if (s.te >= len - 1) {
        const [a, b] = clampView(len - w + 0.0, len, len);
        s.ts = a;
        s.te = b;
      }
    }
    wake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, wake]);

  useEffect(() => {
    if (!visible) return;
    const s = st.current;
    const [a, b] = clampView(visible[0], visible[1], data.length);
    s.ts = a;
    s.te = b;
    s.follow = false;
    s.autoFit = false;
    wake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible?.[0], visible?.[1], wake]);

  useEffect(() => {
    if (cursor === undefined) return;
    const s = st.current;
    s.cursor = cursor;
    s.cursorSource = cursor === null ? null : "prop";
    wake();
  }, [cursor, wake]);

  useEffect(() => {
    wake();
  }, [pal, palette, showVolume, reduce, attract, wake]);

  const markInput = () => {
    st.current.lastInput = performance.now();
    if (st.current.cursorSource === "attract") {
      st.current.cursor = null;
      st.current.cursorSource = null;
    }
  };

  const setTarget = (a: number, b: number, source: "user" | "follow" = "user") => {
    const s = st.current;
    const [x, y] = clampView(a, b, data.length);
    s.ts = x;
    s.te = y;
    if (source === "user") s.autoFit = false;
    if (source === "user") s.follow = y >= data.length - 0.5;
    onVisibleChange?.([x, y]);
    wake();
  };

  const describe = (i: number) => {
    const r = data[i];
    if (!r) return "";
    const prev = i > 0 ? data[i - 1].c : r.o;
    const chg = prev ? (r.c - prev) / prev : 0;
    return `${formatTime(r.t, "full")}, open ${formatPrice(r.o)}, high ${formatPrice(r.h)}, low ${formatPrice(r.l)}, close ${formatPrice(r.c)}, ${chg >= 0 ? "up" : "down"} ${formatPercent(Math.abs(chg), 2)}`;
  };

  const setCursor = (i: number | null, source: RunState["cursorSource"]) => {
    const s = st.current;
    if (i === s.cursor && source === s.cursorSource) return;
    s.cursor = i;
    s.cursorSource = i === null ? null : source;
    onCursorChange?.(i, i === null ? null : data[i] ?? null);
    if (i !== null) say(describe(i));
    wake();
  };

  const localX = (e: PointerEvent<HTMLDivElement>) => {
    const rect = rectRef.current ?? wrapperRef.current?.getBoundingClientRect() ?? null;
    if (!rect) return null;
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const indexAt = (x: number) => {
    const s = st.current;
    const i = Math.floor(s.vs + (x - s.plot.l) / s.cw);
    return clamp(i, 0, data.length - 1);
  };

  const onPointerEnter = () => {
    markInput();
    if (wrapperRef.current) rectRef.current = wrapperRef.current.getBoundingClientRect();
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    markInput();
    if (wrapperRef.current) rectRef.current = wrapperRef.current.getBoundingClientRect();
    const pt = localX(e);
    if (!pt) return;
    const s = st.current;
    s.drag = { x: pt.x, vs: s.ts, ve: s.te, id: e.pointerId, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    markInput();
    const pt = localX(e);
    if (!pt) return;
    const s = st.current;
    if (s.drag && s.drag.id === e.pointerId) {
      const dx = pt.x - s.drag.x;
      if (Math.abs(dx) > 3) s.drag.moved = true;
      if (s.drag.moved) {
        const shift = -dx / s.cw;
        setTarget(s.drag.vs + shift, s.drag.ve + shift);
      }
    }
    if (pt.x < s.plot.l || pt.x > s.plot.r || pt.y < s.plot.t || pt.y > s.plot.vb) {
      if (s.cursorSource === "pointer") setCursor(null, null);
      return;
    }
    s.pointerY = pt.y;
    setCursor(indexAt(pt.x), "pointer");
    wake();
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const s = st.current;
    if (s.drag && s.drag.id === e.pointerId) {
      s.drag = null;
      wake();
    }
  };

  const onPointerLeave = () => {
    const s = st.current;
    s.pointerY = null;
    if (s.cursorSource === "pointer") setCursor(null, null);
  };

  // Wheel: pinch (ctrl+wheel) always zooms; plain wheel zooms once the chart has focus, so the page
  // still scrolls past an unfocused chart. Horizontal wheel pans.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const s = st.current;
      const focused = el.contains(document.activeElement);
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (!e.ctrlKey && !focused && !horizontal) return;
      e.preventDefault();
      s.lastInput = performance.now();
      s.autoFit = false;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const len = cfg.current.data.length;
      if (horizontal && !e.ctrlKey) {
        const shift = e.deltaX / Math.max(1, s.cw);
        const [a, b] = clampView(s.ts + shift, s.te + shift, len);
        s.ts = a;
        s.te = b;
        s.follow = b >= len - 0.5;
      } else {
        const k = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
        const anchor = s.vs + (clamp(x, s.plot.l, s.plot.r) - s.plot.l) / Math.max(1e-6, s.cw);
        const frac = (anchor - s.ts) / Math.max(1e-6, s.te - s.ts);
        const w = clamp((s.te - s.ts) * k, Math.min(MIN_CANDLES, len), len + 4);
        const a0 = anchor - frac * w;
        const [a, b] = clampView(a0, a0 + w, len);
        s.ts = a;
        s.te = b;
        s.follow = b >= len - 0.5;
      }
      cfg.current.onVisibleChange?.([s.ts, s.te]);
      wake();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [wake]);

  const zoomBy = (k: number) => {
    const s = st.current;
    const len = data.length;
    const anchor = s.cursor ?? s.te - 1;
    const frac = (anchor + 0.5 - s.ts) / Math.max(1e-6, s.te - s.ts);
    const w = clamp((s.te - s.ts) * k, Math.min(MIN_CANDLES, len), len + 4);
    const a0 = anchor + 0.5 - frac * w;
    setTarget(a0, a0 + w);
  };

  const ensureVisible = (i: number) => {
    const s = st.current;
    const w = s.te - s.ts;
    if (i < s.ts + 1) setTarget(i - 1, i - 1 + w);
    else if (i > s.te - 2) setTarget(i + 2 - w, i + 2);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    markInput();
    const s = st.current;
    const len = data.length;
    if (!len) return;
    const cur = s.cursor ?? len - 1;
    let next: number | null = null;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const step = (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 10 : 1);
      // The first press lands on the newest candle; later presses step from there.
      next = s.cursor === null ? len - 1 : clamp(cur + step, 0, len - 1);
    } else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = len - 1;
    else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomBy(0.8);
      return;
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      zoomBy(1.25);
      return;
    } else if (e.key === "0") {
      e.preventDefault();
      s.autoFit = true;
      s.follow = true;
      wake();
      return;
    } else if (e.key === "Escape") {
      if (s.cursor === null) return;
      e.preventDefault();
      setCursor(null, null);
      return;
    }
    if (next === null) return;
    e.preventDefault();
    s.pointerY = null;
    ensureVisible(next);
    setCursor(next, "keyboard");
  };

  const tableRows = useMemo(
    () => data.map((r) => [formatTime(r.t, "full"), formatPrice(r.o), formatPrice(r.h), formatPrice(r.l), formatPrice(r.c), r.v !== undefined ? formatVolume(r.v) : ""]),
    [data, formatTime, formatPrice, formatVolume],
  );
  const last = data[data.length - 1];
  const summary = last
    ? `${ariaLabel}, ${data.length} candles, last close ${formatPrice(last.c)} on ${formatTime(last.t, "full")}`
    : `${ariaLabel}, no data`;

  return (
    <div
      ref={rootRef}
      data-loop="idle"
      className={cn("@container relative w-full select-none text-[color:var(--bjork-text)]", className)}
      style={{ ...vars, height }}
    >
      <div
        ref={wrapperRef}
        role="group"
        aria-label={`${ariaLabel}. Arrow keys move between candles, plus and minus zoom, 0 resets.`}
        aria-roledescription="chart"
        tabIndex={0}
        onPointerEnter={onPointerEnter}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={onPointerLeave}
        onDoubleClick={() => {
          st.current.autoFit = true;
          st.current.follow = true;
          wake();
        }}
        onKeyDown={onKeyDown}
        onFocus={markInput}
        className={cn("absolute inset-0 cursor-crosshair touch-pan-y rounded-[10px]", chartFocusRing)}
      >
        <div ref={hostRef} className="absolute inset-0">
          <canvas ref={canvasRef} role="img" aria-label={summary} className="pointer-events-none absolute left-0 top-0" />
        </div>

        {/* Readout: date, OHLC, change, volume. Text is written from the loop. */}
        <div
          ref={readoutRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-2 top-1 flex h-5 items-center gap-3 overflow-hidden whitespace-nowrap font-mono text-[11px] leading-none tabular-nums text-[color:var(--bjork-text-soft)]"
          style={{ right: GUTTER }}
        >
          <span data-v className="text-[color:var(--bjork-text-medium)] @max-[460px]:hidden" />
          <span>
            O <span data-v className="text-[color:var(--bjork-text)]" />
          </span>
          <span>
            H <span data-v className="text-[color:var(--bjork-text)]" />
          </span>
          <span>
            L <span data-v className="text-[color:var(--bjork-text)]" />
          </span>
          <span>
            C <span data-v className="text-[color:var(--bjork-text)]" />
          </span>
          <span className="inline-flex items-center gap-1">
            {/* The triangles sit low on the cap line; 0.5px up centres them on the digits (blur test). */}
            <span data-dir className="-translate-y-[0.5px] text-[8px]" />
            <span data-v className="text-[color:var(--bjork-text)]" />
          </span>
          {showVolume && (
            <span className="@max-[600px]:hidden">
              Vol <span data-v className="text-[color:var(--bjork-text-medium)]" />
            </span>
          )}
        </div>

        {Array.from({ length: PRICE_LABELS }).map((_, i) => (
          <span
            key={`p${i}`}
            ref={(el) => {
              priceLabelRefs.current[i] = el;
            }}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 whitespace-nowrap font-mono text-[10px] leading-none tabular-nums text-[color:var(--bjork-text-faint)] opacity-0 [text-box:trim-both_cap_alphabetic]"
          />
        ))}
        {Array.from({ length: TIME_LABELS }).map((_, i) => (
          <span
            key={`t${i}`}
            ref={(el) => {
              timeLabelRefs.current[i] = el;
            }}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 whitespace-nowrap font-mono text-[10px] leading-none tabular-nums text-[color:var(--bjork-text-faint)] opacity-0 [text-box:trim-both_cap_alphabetic]"
          />
        ))}

        <span
          ref={badgeRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 inline-flex h-[22px] items-center rounded-[6px] bg-[color:var(--bjork-accent-fill)] px-1.5 font-mono text-[11px] leading-none tabular-nums text-[color:var(--bjork-accent-foreground)] opacity-0 [text-box:trim-both_cap_alphabetic]"
        />
        <span
          ref={priceTagRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 inline-flex h-[22px] items-center rounded-[6px] border border-[color:var(--bjork-border-strong)] bg-[color:var(--bjork-surface-hover)] px-1.5 font-mono text-[11px] leading-none tabular-nums text-[color:var(--bjork-text)] opacity-0 [text-box:trim-both_cap_alphabetic]"
        />
        <span
          ref={timeTagRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 inline-flex h-5 items-center rounded-[6px] border border-[color:var(--bjork-border-strong)] bg-[color:var(--bjork-surface-hover)] px-1.5 font-mono text-[10px] leading-none tabular-nums text-[color:var(--bjork-text)] opacity-0 [text-box:trim-both_cap_alphabetic]"
        />
      </div>

      <ChartTable caption={ariaLabel} columns={TABLE_COLUMNS} rows={tableRows} />
      <ChartAnnouncer ref={announcer} />
    </div>
  );
}

// Seeded OHLC series for demos: a drifting walk with volatility clustering.
export function createCandles(seed: number, count: number, opts?: { start?: number; base?: number; stepMs?: number; vol?: number }): Candle[] {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(rnd(), 1e-9))) * Math.cos(2 * Math.PI * rnd());
  const start = opts?.start ?? Date.UTC(2025, 0, 2);
  const stepMs = opts?.stepMs ?? 86400000;
  let price = opts?.base ?? 100;
  let sigma = opts?.vol ?? 0.016;
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    sigma = Math.max(0.006, Math.min(0.05, sigma * (0.92 + 0.16 * rnd()) + (rnd() < 0.04 ? 0.01 : 0)));
    const o = price;
    const drift = 0.0006 + Math.sin(i / 23) * 0.002;
    const c = o * (1 + drift + gauss() * sigma);
    const h = Math.max(o, c) * (1 + Math.abs(gauss()) * sigma * 0.55);
    const l = Math.min(o, c) * (1 - Math.abs(gauss()) * sigma * 0.55);
    const v = Math.round((0.6 + rnd() * 0.8) * 1_200_000 * (1 + (sigma - 0.012) * 30));
    out.push({ t: start + i * stepMs, o, h, l, c, v });
    price = c;
  }
  return out;
}
