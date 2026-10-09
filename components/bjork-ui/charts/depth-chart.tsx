"use client";

import { useDeferredValue, useEffect, useMemo, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
import { mulberry32 } from "@/components/bjork-ui/_core/random";
import { useChartCanvas, easeOut, writeLabels } from "@/components/bjork-ui/charts/_kit/canvas";
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
import { clamp, crisp, damp, niceTicks, withAlpha, formatCompact, formatFixed, formatNumber, formatSigned } from "@/components/bjork-ui/charts/_kit/scale";

export interface BookLevel {
  price: number;
  size: number;
}

export interface DepthChartProps {
  bids: BookLevel[];
  asks: BookLevel[];
  /** Half-width of the view around mid, as a fraction of mid. Auto by default. */
  range?: number;
  formatPrice?: (p: number) => string;
  formatSize?: (s: number) => string;
  /** Posed probe: side and level index from the touch. */
  probe?: { side: "bid" | "ask"; level: number } | null;
  height?: number;
  ariaLabel?: string;
  tone?: BjorkTone;
  attract?: boolean;
  className?: string;
}

const TOP = 34;
const BOTTOM = 26;
const PAD_LEFT = 46;
const PAD_RIGHT = 8;
const SAMPLE_PX = 1;
const DEPTH_TAU = 0.1;
const RANGE_TAU = 0.4;
const CONTRACT_PX = 2;
const ENTER_MS = 800;
const X_LABELS = 10;
const Y_LABELS = 6;
const ATTRACT_STEP_MS = 900;
const ATTRACT_IDLE_MS = 4000;

const clock = () => performance.now();
// Fixed decimals so 101.30 and 101.28 line up in the tooltip and table.
const defaultFormatPrice = (p: number) => formatFixed(p, 2);
const defaultFormatSize = (s: number) => formatCompact(s, 1);

interface Book {
  bids: BookLevel[]; // best first (desc)
  asks: BookLevel[]; // best first (asc)
  cumB: number[];
  cumA: number[];
  mid: number;
  spread: number;
}

function prepareBook(bids: BookLevel[], asks: BookLevel[]): Book {
  const b = bids.filter((l) => l.size > 0).sort((x, y) => y.price - x.price);
  const a = asks.filter((l) => l.size > 0).sort((x, y) => x.price - y.price);
  const cumB: number[] = [];
  const cumA: number[] = [];
  b.reduce((s, l, i) => (cumB[i] = s + l.size), 0);
  a.reduce((s, l, i) => (cumA[i] = s + l.size), 0);
  const bb = b[0]?.price ?? 0;
  const ba = a[0]?.price ?? bb;
  return { bids: b, asks: a, cumB, cumA, mid: (bb + ba) / 2, spread: ba - bb };
}

// Walking the book to a level: total size, volume-weighted fill and impact from mid.
function walk(book: Book, side: "bid" | "ask", level: number) {
  const levels = side === "bid" ? book.bids : book.asks;
  let size = 0;
  let notional = 0;
  for (let i = 0; i <= level && i < levels.length; i++) {
    size += levels[i].size;
    notional += levels[i].size * levels[i].price;
  }
  const vwap = size ? notional / size : book.mid;
  const last = levels[Math.min(level, levels.length - 1)]?.price ?? book.mid;
  return { size, vwap, price: last, impactBp: ((vwap - book.mid) / book.mid) * 1e4, slipBp: ((last - book.mid) / book.mid) * 1e4 };
}

// Cumulative depth rises away from mid, so the empty space next to a probe is on the mid side:
// above-left of an ask point, above-right of a bid point. Fall back to the other side at the edge.
function placeProbeTooltip(side: "bid" | "ask", x: number, y: number, tw: number, th: number, w: number, h: number, gap = 12) {
  let tx = side === "ask" ? x - gap - tw : x + gap;
  if (tx < 0) tx = x + gap;
  if (tx + tw > w) tx = x - gap - tw;
  tx = clamp(tx, 0, Math.max(0, w - tw));
  const ty = clamp(y - th - gap, 0, Math.max(0, h - th));
  return { x: Math.round(tx), y: Math.round(ty) };
}

interface Run {
  tmpB: Float32Array;
  tmpA: Float32Array;
  bidDisp: Float32Array;
  askDisp: Float32Array;
  ready: boolean;
  yMax: number;
  enter: number;
  probe: { side: "bid" | "ask"; level: number } | null;
  source: "pointer" | "keyboard" | "prop" | "attract" | null;
  plot: { l: number; r: number; t: number; b: number };
  view: { lo: number; hi: number };
  xCache: string[];
  yCache: string[];
  lastInput: number;
  attractAt: number;
}

export function DepthChart({
  bids,
  asks,
  range,
  formatPrice = defaultFormatPrice,
  formatSize = defaultFormatSize,
  probe,
  height = 320,
  ariaLabel = "Order book depth",
  tone: toneProp,
  attract = false,
  className,
}: DepthChartProps) {
  const { pal, reduce, vars } = useChartTheme(toneProp);
  const announcer = useRef<AnnouncerHandle>(null);
  const tipRef = useRef<TooltipHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const midRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const xPool = useRef<(HTMLSpanElement | null)[]>([]);
  const yPool = useRef<(HTMLSpanElement | null)[]>([]);
  const rectRef = useRef<DOMRect | null>(null);

  const book = useMemo(() => prepareBook(bids, asks), [bids, asks]);

  const cfg = useRef({ book, range, reduce, pal, formatPrice, formatSize, attract });
  useEffect(() => {
    cfg.current = { book, range, reduce, pal, formatPrice, formatSize, attract };
  });

  const st = useRef<Run>({
    tmpB: new Float32Array(0),
    tmpA: new Float32Array(0),
    bidDisp: new Float32Array(0),
    askDisp: new Float32Array(0),
    ready: false,
    yMax: 0,
    enter: 0,
    probe: probe ?? null,
    source: probe ? "prop" : null,
    plot: { l: 0, r: 0, t: 0, b: 0 },
    view: { lo: 0, hi: 1 },
    xCache: [],
    yCache: [],
    lastInput: 0,
    attractAt: 0,
  });
  const probeRef = useRef<(pr: Run["probe"], source: Run["source"]) => void>(() => {});

  const { rootRef, hostRef, canvasRef, wake } = useChartCanvas(({ ctx, w, h, dt }) => {
    const s = st.current;
    const c = cfg.current;
    const p = c.pal;
    const B = c.book;
    if (!B.bids.length || !B.asks.length) return false;
    const plot = { l: PAD_LEFT, r: w - PAD_RIGHT, t: TOP, b: h - BOTTOM };
    s.plot = plot;
    const pW = plot.r - plot.l;
    const half = c.range ?? Math.max(B.mid - B.bids[B.bids.length - 1].price, B.asks[B.asks.length - 1].price - B.mid) / B.mid;
    const lo = B.mid * (1 - half);
    const hi = B.mid * (1 + half);
    s.view = { lo, hi };
    const xOf = (price: number) => plot.l + ((price - lo) / (hi - lo)) * pW;

    // Depth sampled per pixel column, each column easing to the new book, so updates glide.
    const cols = Math.max(2, Math.floor(pW / SAMPLE_PX));
    if (s.bidDisp.length !== cols) {
      s.bidDisp = new Float32Array(cols);
      s.askDisp = new Float32Array(cols);
      s.ready = false;
    }
    let moving = false;
    let maxTarget = 0;
    const midX = xOf(B.mid);
    // One merge pass per side: columns walk outward from mid as the book does. O(columns + levels).
    const tB = s.tmpB.length === cols ? s.tmpB : (s.tmpB = new Float32Array(cols));
    const tA = s.tmpA.length === cols ? s.tmpA : (s.tmpA = new Float32Array(cols));
    tB.fill(0);
    tA.fill(0);
    const colPrice = (k: number) => lo + (k / (cols - 1)) * (hi - lo);
    let bi = -1;
    for (let k = cols - 1; k >= 0; k--) {
      const price = colPrice(k);
      if (price > B.mid) continue;
      while (bi + 1 < B.bids.length && B.bids[bi + 1].price >= price) bi++;
      tB[k] = bi >= 0 ? B.cumB[bi] : 0;
    }
    let ai = -1;
    for (let k = 0; k < cols; k++) {
      const price = colPrice(k);
      if (price <= B.mid) continue;
      while (ai + 1 < B.asks.length && B.asks[ai + 1].price <= price) ai++;
      tA[k] = ai >= 0 ? B.cumA[ai] : 0;
    }
    for (let k = 0; k < cols; k++) maxTarget = Math.max(maxTarget, tB[k], tA[k]);
    for (let k = 0; k < cols; k++) {
      if (!s.ready || c.reduce) {
        s.bidDisp[k] = tB[k];
        s.askDisp[k] = tA[k];
      } else {
        s.bidDisp[k] = damp(s.bidDisp[k], tB[k], DEPTH_TAU, dt);
        s.askDisp[k] = damp(s.askDisp[k], tA[k], DEPTH_TAU, dt);
        if (Math.abs(s.bidDisp[k] - tB[k]) + Math.abs(s.askDisp[k] - tA[k]) > maxTarget * 1e-4 + 1e-6) moving = true;
      }
    }
    // Y range: expands at once, contracts slowly and never clips (the live-line rule).
    const target = maxTarget * 1.1;
    if (!s.ready || c.reduce || target > s.yMax) s.yMax = target;
    else if (target < s.yMax) {
      const pxPer = (plot.b - plot.t) / s.yMax;
      const cap = CONTRACT_PX / pxPer;
      s.yMax -= Math.min(cap, (s.yMax - target) * (1 - Math.exp(-dt / RANGE_TAU)));
      if (s.yMax - target > target * 1e-4) moving = true;
    }
    s.ready = true;
    const yOf = (d: number) => plot.b - (d / Math.max(1e-9, s.yMax)) * (plot.b - plot.t);

    s.enter = c.reduce ? 1 : Math.min(1, s.enter + (dt * 1000) / ENTER_MS);
    const e = easeOut(s.enter);

    // Grid.
    const yt = niceTicks(0, s.yMax, 4);
    ctx.strokeStyle = p.hair;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const v of yt) {
      if (v <= 0) continue;
      ctx.moveTo(plot.l, crisp(yOf(v)));
      ctx.lineTo(plot.r, crisp(yOf(v)));
    }
    ctx.stroke();
    writeLabels(yPool.current, s.yCache, yt.map((v) => ({ text: c.formatSize(v), x: plot.l - 8, y: yOf(v), ax: -100 })));
    const xt = niceTicks(lo, hi, Math.max(3, Math.floor(pW / 90)));
    writeLabels(xPool.current, s.xCache, xt.map((v) => ({ text: c.formatPrice(v), x: xOf(v), y: plot.b + 13, ax: -50 })));

    // Areas grow outward from mid during the entrance.
    const reachL = midX - (midX - plot.l) * e;
    const reachR = midX + (plot.r - midX) * e;
    const side = (disp: Float32Array, fill: string, line: string, fromMid: boolean) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(fromMid ? reachL : midX, 0, fromMid ? midX - reachL : reachR - midX, h);
      ctx.clip();
      ctx.beginPath();
      let started = false;
      for (let k = 0; k < cols; k++) {
        const x = plot.l + (k / (cols - 1)) * pW;
        const d = disp[k];
        if (d <= 0) continue;
        if (!started) {
          ctx.moveTo(x, plot.b);
          started = true;
        }
        ctx.lineTo(x, yOf(d));
      }
      if (!started) {
        ctx.restore();
        return;
      }
      ctx.save();
      ctx.lineTo(fromMid ? midX : plot.r, plot.b);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      started = false;
      for (let k = 0; k < cols; k++) {
        const x = plot.l + (k / (cols - 1)) * pW;
        const d = disp[k];
        if (d <= 0) continue;
        if (!started) {
          ctx.moveTo(x, yOf(d));
          started = true;
        } else ctx.lineTo(x, yOf(d));
      }
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.strokeStyle = line;
      ctx.stroke();
      ctx.restore();
    };
    side(s.bidDisp, withAlpha(p.text, 0.1), withAlpha(p.text, 0.78), true);
    side(s.askDisp, withAlpha(p.accent, 0.14), p.accent, false);

    // Mid line and the spread pill.
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = p.textSoft;
    ctx.beginPath();
    ctx.moveTo(crisp(midX), plot.t - 4);
    ctx.lineTo(crisp(midX), plot.b);
    ctx.stroke();
    ctx.restore();
    const mid = midRef.current;
    if (mid) {
      const mw = Number(mid.dataset.w) || mid.offsetWidth;
      // Centred on mid, but never over the legend.
      const legendR = (legendRef.current?.offsetWidth ?? 0) + 12;
      mid.style.transform = `translate3d(${clamp(midX - mw / 2, Math.max(plot.l, legendR), plot.r - mw).toFixed(1)}px, ${(plot.t - 30).toFixed(1)}px, 0)`;
    }

    // Probe: the cost of walking the book to a level.
    const tip = tipRef.current;
    if (s.probe) {
      const levels = s.probe.side === "bid" ? B.bids : B.asks;
      const lvl = clamp(s.probe.level, 0, levels.length - 1);
      const r = walk(B, s.probe.side, lvl);
      const x = xOf(r.price);
      const y = yOf(r.size);
      ctx.strokeStyle = p.textSoft;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(crisp(x), plot.t);
      ctx.lineTo(crisp(x), plot.b);
      ctx.moveTo(x, crisp(y));
      ctx.lineTo(midX, crisp(y));
      ctx.stroke();
      // The average fill sits between mid and the last level touched.
      const vx = xOf(r.vwap);
      ctx.fillStyle = s.probe.side === "ask" ? p.accentInk : p.text;
      ctx.beginPath();
      ctx.moveTo(vx, plot.b - 1);
      ctx.lineTo(vx - 4, plot.b + 5);
      ctx.lineTo(vx + 4, plot.b + 5);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = s.probe.side === "ask" ? p.accent : p.text;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = p.stage;
      ctx.stroke();
      if (tip?.el) {
        const pos = placeProbeTooltip(s.probe.side, x, y, tip.size.w, tip.size.h, w, h);
        tip.el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      }
    }

    if (c.attract && !c.reduce && (!s.lastInput || clock() - s.lastInput > ATTRACT_IDLE_MS)) {
      if (clock() - s.attractAt > ATTRACT_STEP_MS) {
        s.attractAt = clock();
        const sideNow = s.probe?.side ?? "ask";
        const levels = sideNow === "bid" ? B.bids : B.asks;
        const next = (s.probe?.level ?? -1) + 1;
        probeRef.current(next >= Math.min(levels.length, 12) ? { side: sideNow === "bid" ? "ask" : "bid", level: 0 } : { side: sideNow, level: next }, "attract");
      }
      return true;
    }
    return moving || s.enter < 1;
  });

  const tooltipFor = (pr: NonNullable<Run["probe"]>): TooltipContent | null => {
    const levels = pr.side === "bid" ? book.bids : book.asks;
    if (!levels.length) return null;
    const lvl = clamp(pr.level, 0, levels.length - 1);
    const r = walk(book, pr.side, lvl);
    return {
      key: `${pr.side}${lvl}|${r.size}|${r.vwap}|${pal.text}`,
      title: `${pr.side === "bid" ? "Sell into bids" : "Buy through asks"} · ${lvl + 1} level${lvl ? "s" : ""}`,
      rows: [
        { key: "s", label: "Size", value: formatSize(r.size), color: pr.side === "ask" ? pal.accent : pal.text },
        { key: "v", label: "Avg fill", value: formatPrice(r.vwap) },
        { key: "i", label: "Impact", value: `${formatSigned(r.impactBp, (n) => formatNumber(n, 1))} bp`, strong: false },
        { key: "l", label: "Last level", value: formatPrice(r.price), strong: false },
      ],
    };
  };

  const setProbe = (pr: Run["probe"], source: Run["source"]) => {
    const s = st.current;
    const same = (!pr && !s.probe) || (pr && s.probe && pr.side === s.probe.side && pr.level === s.probe.level);
    s.probe = pr;
    s.source = pr ? source : null;
    tipRef.current?.set(pr ? tooltipFor(pr) : null);
    if (!same && pr && source === "keyboard") {
      const r = walk(book, pr.side, pr.level);
      announcer.current?.say(`${pr.side === "bid" ? "Selling" : "Buying"} ${formatSize(r.size)} fills at ${formatPrice(r.vwap)} on average, ${formatNumber(Math.abs(r.impactBp), 1)} basis points from mid`);
    }
    wake();
  };
  useEffect(() => {
    probeRef.current = setProbe;
  });

  // Live books: keep the probe's tooltip current as levels change.
  useEffect(() => {
    const s = st.current;
    if (s.probe) tipRef.current?.set(tooltipFor(s.probe));
    wake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, range, pal, reduce, attract, wake]);

  useEffect(() => {
    if (probe === undefined) return;
    setProbe(probe, probe ? "prop" : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probe?.side, probe?.level]);

  useEffect(() => {
    if (midRef.current) midRef.current.dataset.w = String(midRef.current.offsetWidth);
  });

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    st.current.lastInput = clock();
    const rect = rectRef.current ?? wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const s = st.current;
    const x = e.clientX - rect.left;
    if (x < s.plot.l || x > s.plot.r) {
      setProbe(null, null);
      return;
    }
    const price = s.view.lo + ((x - s.plot.l) / (s.plot.r - s.plot.l)) * (s.view.hi - s.view.lo);
    const sideNow: "bid" | "ask" = price <= book.mid ? "bid" : "ask";
    const levels = sideNow === "bid" ? book.bids : book.asks;
    // The deepest level the pointer has reached on that side.
    let lvl = 0;
    for (let i = 0; i < levels.length; i++) {
      if (sideNow === "bid" ? levels[i].price >= price : levels[i].price <= price) lvl = i;
      else break;
    }
    setProbe({ side: sideNow, level: lvl }, "pointer");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = st.current;
    s.lastInput = clock();
    const cur = s.probe && s.source !== "attract" ? s.probe : null;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      // Left walks away from mid on the bid side, right on the ask side.
      const dir = e.key === "ArrowLeft" ? "bid" : "ask";
      if (!cur) {
        setProbe({ side: dir, level: 0 }, "keyboard");
        return;
      }
      if (cur.side === dir) setProbe({ side: dir, level: Math.min(cur.level + (e.shiftKey ? 5 : 1), (dir === "bid" ? book.bids : book.asks).length - 1) }, "keyboard");
      else if (cur.level > 0) setProbe({ side: cur.side, level: Math.max(0, cur.level - (e.shiftKey ? 5 : 1)) }, "keyboard");
      else setProbe({ side: dir, level: 0 }, "keyboard");
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      // Home: the touch on the current side. End: the deepest level on it.
      const sideNow = cur?.side ?? "ask";
      const levels = sideNow === "bid" ? book.bids : book.asks;
      setProbe({ side: sideNow, level: e.key === "Home" ? 0 : Math.max(0, levels.length - 1) }, "keyboard");
    } else if (e.key === "Escape") setProbe(null, null);
  };

  // A live book changes often; the table twin follows at low priority so it never blocks a frame.
  const tableBook = useDeferredValue(book);
  const tableRows = useMemo(
    () => [
      ...tableBook.bids.map((l, i) => ["Bid", formatPrice(l.price), formatSize(l.size), formatSize(tableBook.cumB[i])]),
      ...tableBook.asks.map((l, i) => ["Ask", formatPrice(l.price), formatSize(l.size), formatSize(tableBook.cumA[i])]),
    ],
    [tableBook, formatPrice, formatSize],
  );
  const tableCols = useMemo(() => ["Side", "Price", "Size", "Cumulative"], []);
  const spreadBp = book.mid ? (book.spread / book.mid) * 1e4 : 0;

  return (
    <div ref={rootRef} data-loop="idle" className={cn("relative w-full select-none text-[color:var(--bjork-text)]", className)} style={{ ...vars, height }}>
      <div
        ref={wrapperRef}
        role="group"
        aria-roledescription="chart"
        aria-label={`${ariaLabel}. Left walks down the bids, right walks up the asks, Home and End jump to the touch and the deepest level, reading the size, average fill and impact.`}
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
          // A touch tap fires leave right after up; keep the probe until the next tap.
          if (e.pointerType !== "touch") setProbe(null, null);
        }}
        onKeyDown={onKeyDown}
        className={cn("absolute inset-0 cursor-crosshair touch-pan-y rounded-[10px]", chartFocusRing)}
      >
        <div ref={hostRef} className="absolute inset-0">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`${ariaLabel}: mid ${formatPrice(book.mid)}, spread ${formatPrice(book.spread)}, ${formatSize(book.cumB[book.cumB.length - 1] ?? 0)} bid and ${formatSize(book.cumA[book.cumA.length - 1] ?? 0)} offered`}
            className="pointer-events-none absolute left-0 top-0"
          />
        </div>
        {/* Legend keys: line for each side. */}
        <div ref={legendRef} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 flex items-center gap-4 font-bjork-alpha text-[11px] font-medium leading-3 text-[color:var(--bjork-text-medium)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-[2px] w-2.5 rounded-[1px] bg-[color:var(--bjork-text-medium)]" />
            Bids
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-[2px] w-2.5 rounded-[1px] bg-[color:var(--bjork-accent)]" />
            Asks
          </span>
        </div>
        <div
          ref={midRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 flex h-[22px] items-center gap-2 whitespace-nowrap rounded-[11px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-surface-hover)] px-2.5 font-mono text-[11px] leading-none tabular-nums"
        >
          <span className="text-[color:var(--bjork-text)] [text-box:trim-both_cap_alphabetic]">{formatPrice(book.mid)}</span>
          <span className="text-[color:var(--bjork-text-soft)] [text-box:trim-both_cap_alphabetic]">
            spread {formatPrice(book.spread)} · {formatNumber(spreadBp, 1)} bp
          </span>
        </div>
        <LabelPool count={X_LABELS} pool={xPool} />
        <LabelPool count={Y_LABELS} pool={yPool} />
        <HoverTooltip ref={tipRef} onMeasure={wake} />
      </div>
      <ChartTable caption={ariaLabel} columns={tableCols} rows={tableRows} />
      <ChartAnnouncer ref={announcer} />
    </div>
  );
}

// A seeded, slowly evolving order book for demos. next() returns the following snapshot.
export function createOrderBook(seed: number, opts?: { mid?: number; tick?: number; levels?: number }) {
  const rnd = mulberry32(seed);
  const tick = opts?.tick ?? 0.05;
  const levels = opts?.levels ?? 40;
  let mid = opts?.mid ?? 101.2;
  const sizeAt = (k: number) => Math.round((40 + rnd() * 160) * (1 + k * 0.08) * (rnd() < 0.07 ? 4 : 1));
  let bidSizes = Array.from({ length: levels }, (_, k) => sizeAt(k));
  let askSizes = Array.from({ length: levels }, (_, k) => sizeAt(k));
  const snapshot = () => {
    const bestBid = Math.floor(mid / tick) * tick;
    const bestAsk = bestBid + tick;
    return {
      bids: bidSizes.map((size, k) => ({ price: +(bestBid - k * tick).toFixed(4), size })),
      asks: askSizes.map((size, k) => ({ price: +(bestAsk + k * tick).toFixed(4), size })),
    };
  };
  return {
    snapshot,
    next() {
      mid += (rnd() - 0.5) * tick * 1.2;
      const jitter = (arr: number[]) => arr.map((sz, k) => Math.max(5, Math.round(sz * (0.86 + rnd() * 0.28) + (rnd() < 0.03 ? sizeAt(k) : 0))));
      bidSizes = jitter(bidSizes);
      askSizes = jitter(askSizes);
      return snapshot();
    },
  };
}
