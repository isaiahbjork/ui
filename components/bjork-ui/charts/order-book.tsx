"use client";

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
import { mulberry32 } from "@/components/bjork-ui/_core/random";
import { useElementSize } from "@/components/bjork-ui/_core/canvas";
import { easeCss } from "@/components/bjork-ui/_core/motion";
import {
  useChartTheme,
  HoverTooltip,
  ChartAnnouncer,
  placeTooltip,
  type TooltipHandle,
  type AnnouncerHandle,
  type TooltipContent,
} from "@/components/bjork-ui/charts/_kit/chrome";
import { clamp, withAlpha, formatCompact, formatFixed, formatNumber, formatSigned, gaussian } from "@/components/bjork-ui/charts/_kit/scale";

// --- Data model -----------------------------------------------------------------------------------
// The same level shape the depth chart takes, so one feed can drive both side by side.

export interface BookLevel {
  price: number;
  size: number;
}

export type BookSide = "bid" | "ask";

/** A full book. Replaces every level. */
export interface OrderBookSnapshot {
  bids: BookLevel[];
  asks: BookLevel[];
  /** Last traded price, if the feed carries trades. */
  last?: number;
}

/** Changed levels only. A size of 0 removes the level. */
export interface OrderBookDelta {
  bids?: BookLevel[];
  asks?: BookLevel[];
  last?: number;
}

/** What a feed sends: the shape most exchange WebSockets reduce to. */
export type OrderBookMessage = ({ type: "snapshot" } & OrderBookSnapshot) | ({ type: "delta" } & OrderBookDelta);

/** One of the viewer's resting orders. Marked on the level that contains its price. */
export interface MyOrder {
  id?: string;
  side: BookSide;
  price: number;
  size: number;
}

/** A level as the book shows it, after grouping. Handed to `onPriceSelect`. */
export interface OrderBookLevelInfo {
  side: BookSide;
  /** Grouped price: bids round down to the tick, asks round up. */
  price: number;
  size: number;
  /** Cumulative size from the touch through this level. */
  total: number;
  /** Cumulative notional (price × size) from the touch through this level. */
  notional: number;
  /** 0 is the best level on its side. */
  depth: number;
  /** Signed distance from mid, in price and in basis points. */
  fromMid: number;
  fromMidBp: number;
  /** Size of the viewer's own orders on this level. */
  mine: number;
}

export interface OrderBookHandle {
  applySnapshot: (snapshot: OrderBookSnapshot) => void;
  applyDelta: (delta: OrderBookDelta) => void;
  /** Routes a feed message to `applySnapshot` or `applyDelta`. */
  apply: (message: OrderBookMessage) => void;
  setLastPrice: (price: number) => void;
  /** The raw (ungrouped) book, best first. Feed it to a DepthChart to show the same book. */
  getSnapshot: () => OrderBookSnapshot;
}

export type OrderBookLayout = "stacked" | "side-by-side" | "auto";

export interface OrderBookProps {
  /** Snapshot as props. Each new pair of arrays is diffed into the book; use the ref's `applyDelta` for streams. */
  bids?: BookLevel[];
  asks?: BookLevel[];
  lastPrice?: number;
  /** Levels per side. Default 12. */
  rows?: number;
  /** Stacked puts asks above the spread and bids below. Auto goes side by side from 600px. Default "auto". */
  layout?: OrderBookLayout;
  /** Grouping choices. Shows the grouping control when there are two or more. */
  tickSizes?: number[];
  /** Controlled grouping. 0 or unset shows raw levels. */
  tickSize?: number;
  defaultTickSize?: number;
  onTickSizeChange?: (tick: number) => void;
  /** Price decimals. Defaults to the decimals of the grouping tick. */
  precision?: number;
  /** Size decimals. Default 0. */
  sizePrecision?: number;
  formatPrice?: (price: number) => string;
  formatSize?: (size: number) => string;
  formatNotional?: (notional: number) => string;
  /** Column header for prices, e.g. "Price (USD)". */
  priceLabel?: string;
  /** Column header for sizes, e.g. "Size (KSTL)". */
  sizeLabel?: string;
  myOrders?: MyOrder[];
  /** Bid against ask size across the visible levels. Default true. */
  showImbalance?: boolean;
  /** Brief highlight on levels whose size changed. Off under reduced motion. Default true. */
  flash?: boolean;
  /** Click, tap or Enter on a level. Use it to fill an order form. */
  onPriceSelect?: (level: OrderBookLevelInfo) => void;
  /** Posed active level, for previews and docs. */
  activeLevel?: { side: BookSide; depth: number } | null;
  /** Polite market summary: while focus is in the book (default), always, or never. */
  announce?: "focus" | "always" | "off";
  /** Minimum gap between spoken summaries, ms. Default 8000. */
  announceInterval?: number;
  /** Row height in px. Default 22. */
  rowHeight?: number;
  ariaLabel?: string;
  tone?: BjorkTone;
  className?: string;
}

// --- Internals ------------------------------------------------------------------------------------

interface Level {
  price: number;
  size: number;
  cum: number;
  notional: number;
  mine: number;
}

interface SlotEls {
  row: HTMLDivElement | null;
  bar: HTMLSpanElement | null;
  flash: HTMLSpanElement | null;
  price: HTMLSpanElement | null;
  size: HTMLSpanElement | null;
  total: HTMLSpanElement | null;
  mine: HTMLSpanElement | null;
  mineSr: HTMLSpanElement | null;
}

interface SlotCache {
  empty: boolean;
  price: string;
  size: string;
  total: string;
  frac: number;
  mine: string;
  flashAt: number;
  flashTint: string;
  anim: Animation | null;
}

type Source = "pointer" | "touch" | "focus" | "prop";

interface Active {
  side: BookSide;
  depth: number;
}

const SPLIT_MIN_W = 600;
const SPLIT_TOTAL_MIN_W = 520;
const FLASH_MS = 450;
const FLASH_GAP_MS = 90;
const BAR_MS = 160;

const SIDES: readonly BookSide[] = ["ask", "bid"];
const EMPTY_LEVELS: Level[] = [];

function decimalsOf(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 2;
  for (let d = 0; d <= 8; d++) if (Math.abs(Math.round(n * 10 ** d) - n * 10 ** d) < 1e-6) return d;
  return 8;
}

// Bids round down into their bucket and asks round up, so a group never crosses the spread.
function bucketOf(price: number, tick: number, side: BookSide): number {
  if (!(tick > 0)) return price;
  const k = price / tick;
  const i = side === "bid" ? Math.floor(k + 1e-7) : Math.ceil(k - 1e-7);
  return +(i * tick).toFixed(10);
}

// Groups one side and keeps the best `n` buckets with running totals. O(levels log levels).
function aggregate(map: Map<number, number>, side: BookSide, tick: number, n: number, mine: Map<number, number> | undefined): Level[] {
  const prices: number[] = [];
  for (const [p, s] of map) if (s > 0) prices.push(p);
  prices.sort(side === "bid" ? (a, b) => b - a : (a, b) => a - b);
  const out: Level[] = [];
  let cum = 0;
  let notional = 0;
  let cur: Level | null = null;
  for (const p of prices) {
    const b = bucketOf(p, tick, side);
    if (!cur || cur.price !== b) {
      if (out.length === n) break;
      cur = { price: b, size: 0, cum: 0, notional: 0, mine: 0 };
      out.push(cur);
    }
    const s = map.get(p) ?? 0;
    cur.size += s;
    cum += s;
    notional += s * p;
    cur.cum = cum;
    cur.notional = notional;
  }
  if (mine?.size) for (const lv of out) lv.mine = mine.get(lv.price) ?? 0;
  return out;
}

function applyLevels(map: Map<number, number>, levels: BookLevel[] | undefined) {
  if (!levels) return;
  for (const l of levels) {
    if (!Number.isFinite(l.price)) continue;
    if (!(l.size > 0)) map.delete(l.price);
    else map.set(l.price, l.size);
  }
}

function emptySlot(): SlotEls {
  return { row: null, bar: null, flash: null, price: null, size: null, total: null, mine: null, mineSr: null };
}

function emptyCache(): SlotCache {
  return { empty: false, price: "\u0000", size: "\u0000", total: "\u0000", frac: -1, mine: "\u0000", flashAt: 0, flashTint: "", anim: null };
}

// Bar glide and flash state for the current motion preference.
function applyMotion(slots: Record<BookSide, SlotEls[]>, cache: Record<BookSide, SlotCache[]>, meter: HTMLElement | null, reduce: boolean) {
  const bar = reduce ? "none" : `transform ${BAR_MS}ms ${easeCss.out}`;
  for (const side of SIDES) {
    for (const el of slots[side]) if (el?.bar) el.bar.style.transition = bar;
    if (reduce) for (const k of cache[side]) k?.anim?.cancel();
  }
  if (meter) meter.style.transition = reduce ? "none" : `transform 200ms ${easeCss.out}`;
}

// --- Row --------------------------------------------------------------------------------------------
// Rows are fixed slots keyed by side and depth. React renders them once per layout; the flush writes
// prices, sizes and bars straight into their cells, so a tick never reconciles the table.

type Register = (side: BookSide, depth: number, els: Partial<SlotEls>) => void;

const SlotRow = memo(function SlotRow({
  side,
  depth,
  order,
  anchor,
  showTotal,
  rowHeight,
  columns,
  barColor,
  priceColor,
  register,
}: {
  side: BookSide;
  depth: number;
  /** Cell order left to right. */
  order: readonly ("price" | "size" | "total")[];
  /** Edge the depth bar grows from. */
  anchor: "left" | "right";
  showTotal: boolean;
  rowHeight: number;
  columns: string;
  barColor: string;
  priceColor: string;
  register: Register;
}) {
  const cell = (k: "price" | "size" | "total") => {
    if (k === "total" && !showTotal) return null;
    const align = k === "price" ? (anchor === "right" && order[0] !== "price" ? "justify-end" : "justify-start") : "justify-end";
    if (k === "price") {
      return (
        <span key={k} role="gridcell" className={cn("relative flex min-w-0 items-center gap-1.5", align)}>
          {anchor === "right" && order[0] !== "price" ? null : (
            <span
              ref={(el) => register(side, depth, { mine: el })}
              aria-hidden="true"
              className="inline-block size-[5px] shrink-0 rotate-45 rounded-[1px] bg-[color:var(--bjork-accent)] opacity-0"
            />
          )}
          <span className="sr-only">{side === "ask" ? "Ask " : "Bid "}</span>
          <span ref={(el) => register(side, depth, { price: el })} style={{ color: priceColor }} />
          <span ref={(el) => register(side, depth, { mineSr: el })} className="sr-only" />
          {anchor === "right" && order[0] !== "price" ? (
            <span
              ref={(el) => register(side, depth, { mine: el })}
              aria-hidden="true"
              className="inline-block size-[5px] shrink-0 rotate-45 rounded-[1px] bg-[color:var(--bjork-accent)] opacity-0"
            />
          ) : null}
        </span>
      );
    }
    return (
      <span
        key={k}
        role="gridcell"
        ref={(el) => register(side, depth, k === "size" ? { size: el } : { total: el })}
        className={cn(
          "relative flex items-center",
          align,
          k === "total" ? "text-[color:var(--bjork-text-muted)]" : "text-[color:var(--bjork-text)]",
        )}
      />
    );
  };
  return (
    <div
      ref={(el) => register(side, depth, { row: el })}
      role="row"
      tabIndex={-1}
      data-side={side}
      data-depth={depth}
      data-empty="true"
      aria-hidden="true"
      className={cn(
        "relative grid cursor-pointer items-center gap-3 px-2 font-mono text-[12px] leading-none tabular-nums outline-none",
        "data-[empty=true]:cursor-default",
        "data-[range=true]:bg-[color:color-mix(in_srgb,var(--bjork-text)_4%,transparent)]",
        "data-[active=true]:bg-[color:color-mix(in_srgb,var(--bjork-text)_8%,transparent)]",
        "focus-visible:shadow-[inset_0_0_0_1.5px_var(--bjork-accent)]",
      )}
      style={{ height: rowHeight, gridTemplateColumns: columns }}
    >
      <span
        ref={(el) => register(side, depth, { bar: el })}
        aria-hidden="true"
        className={cn("pointer-events-none absolute inset-y-px w-full", anchor === "right" ? "right-0 origin-right" : "left-0 origin-left")}
        style={{ background: barColor, transform: "scaleX(0)" }}
      />
      <span ref={(el) => register(side, depth, { flash: el })} aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-0" />
      {order.map(cell)}
    </div>
  );
});

// --- Grouping control ---------------------------------------------------------------------------------

function GroupingControl({ ticks, value, onChange }: { ticks: number[]; value: number; onChange: (t: number) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = ticks.indexOf(value);
    let n = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") n = Math.min(ticks.length - 1, i + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = Math.max(0, i - 1);
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = ticks.length - 1;
    if (n < 0) return;
    e.preventDefault();
    onChange(ticks[n]);
    refs.current[n]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label="Price grouping"
      onKeyDown={onKeyDown}
      className="inline-flex shrink-0 items-center gap-px rounded-[8px] border border-[color:var(--bjork-border)] p-[2px]"
    >
      {ticks.map((t, i) => {
        const on = t === value;
        return (
          <button
            key={t}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t)}
            className={cn(
              "h-[22px] min-w-[34px] rounded-[6px] px-1.5 font-mono text-[10px] leading-none tabular-nums transition-colors duration-150 ease-out",
              "outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)]",
              on
                ? "bg-[color:var(--bjork-surface-hover)] text-[color:var(--bjork-text)] shadow-[inset_0_0_0_1px_var(--bjork-border-strong)]"
                : "text-[color:var(--bjork-text-soft)] hover:text-[color:var(--bjork-text-medium)]",
            )}
          >
            {formatFixed(t, decimalsOf(t))}
          </button>
        );
      })}
    </div>
  );
}

// --- Component ----------------------------------------------------------------------------------------

export const OrderBook = forwardRef<OrderBookHandle, OrderBookProps>(function OrderBook(
  {
    bids,
    asks,
    lastPrice,
    rows = 12,
    layout = "auto",
    tickSizes,
    tickSize: tickProp,
    defaultTickSize,
    onTickSizeChange,
    precision,
    sizePrecision = 0,
    formatPrice: formatPriceProp,
    formatSize: formatSizeProp,
    formatNotional = (v: number) => formatCompact(v, 2),
    priceLabel = "Price",
    sizeLabel = "Size",
    myOrders,
    showImbalance = true,
    flash = true,
    onPriceSelect,
    activeLevel,
    announce = "focus",
    announceInterval = 8000,
    rowHeight = 22,
    ariaLabel = "Order book",
    tone: toneProp,
    className,
  },
  ref,
) {
  const { pal, reduce, vars } = useChartTheme(toneProp);
  const rootRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<TooltipHandle>(null);
  const announcer = useRef<AnnouncerHandle>(null);
  const { width } = useElementSize(rootRef);

  const [tickState, setTickState] = useState(defaultTickSize ?? tickSizes?.[0] ?? 0);
  const tick = tickProp ?? tickState;
  const setTick = (t: number) => {
    if (tickProp === undefined) setTickState(t);
    onTickSizeChange?.(t);
    announcer.current?.say(`Grouped by ${formatFixed(t, decimalsOf(t))}`);
  };

  const n = Math.max(1, Math.floor(rows));
  const split = layout === "side-by-side" || (layout === "auto" && width >= SPLIT_MIN_W);
  const showTotal = !split || width === 0 || width >= SPLIT_TOTAL_MIN_W;
  const narrow = width > 0 && width < 440;

  const pricePlaces = precision ?? decimalsOf(tick > 0 ? tick : 0.01);
  const formatPrice = useMemo(() => formatPriceProp ?? ((p: number) => formatFixed(p, pricePlaces)), [formatPriceProp, pricePlaces]);
  const formatSize = useMemo(() => formatSizeProp ?? ((s: number) => formatFixed(s, sizePrecision)), [formatSizeProp, sizePrecision]);

  // The viewer's orders, bucketed with the book's grouping.
  const mine = useMemo(() => {
    const m: Record<BookSide, Map<number, number>> = { bid: new Map(), ask: new Map() };
    for (const o of myOrders ?? []) {
      if (!(o.size > 0)) continue;
      const b = bucketOf(o.price, tick, o.side);
      m[o.side].set(b, (m[o.side].get(b) ?? 0) + o.size);
    }
    return m;
  }, [myOrders, tick]);

  // Everything the flush reads, current without re-subscribing anything.
  const cfg = useRef({ tick, n, mine, reduce, flash, pal, pricePlaces, formatPrice, formatSize, formatNotional, announce, announceInterval, onPriceSelect });
  useLayoutEffect(() => {
    cfg.current = { tick, n, mine, reduce, flash, pal, pricePlaces, formatPrice, formatSize, formatNotional, announce, announceInterval, onPriceSelect };
  });

  const store = useRef({
    bids: new Map<number, number>(),
    asks: new Map<number, number>(),
    last: null as number | null,
    lastDir: 0 as -1 | 0 | 1,
    shown: null as number | null,
    shownDir: 0 as -1 | 0 | 1,
  });
  const view = useRef<Record<BookSide, Level[]>>({ bid: EMPTY_LEVELS, ask: EMPTY_LEVELS });
  const mid = useRef(0);
  const prevSizes = useRef<Record<BookSide, Map<number, number>>>({ bid: new Map(), ask: new Map() });
  const prevBest = useRef<Record<BookSide, number | null>>({ bid: null, ask: null });
  const resetFlash = useRef(true);
  const slots = useRef<Record<BookSide, SlotEls[]>>({ bid: [], ask: [] });
  const cache = useRef<Record<BookSide, SlotCache[]>>({ bid: [], ask: [] });
  const raf = useRef(0);
  const st = useRef({
    active: null as Active | null,
    source: null as Source | null,
    pointerX: 0,
    tabStop: null as Active | null,
    focusWithin: false,
    lastSay: 0,
  });

  // Fixed elements the flush writes.
  const lastRef = useRef<HTMLSpanElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);
  const dirSrRef = useRef<HTMLSpanElement>(null);
  const midRef = useRef<HTMLSpanElement>(null);
  const spreadRef = useRef<HTMLSpanElement>(null);
  const imbBarRef = useRef<HTMLSpanElement>(null);
  const imbBidRef = useRef<HTMLSpanElement>(null);
  const imbAskRef = useRef<HTMLSpanElement>(null);
  const imbMeterRef = useRef<HTMLDivElement>(null);
  const spreadCache = useRef({ last: "", arrow: "", color: "", mid: "", spread: "", imb: -1 });

  const register = useCallback<Register>((side, depth, els) => {
    const arr = slots.current[side];
    const slot = arr[depth] ?? (arr[depth] = emptySlot());
    Object.assign(slot, els);
  }, []);

  // --- Active level, tooltip and range highlight ---------------------------------------------------

  const levelInfo = (side: BookSide, depth: number): OrderBookLevelInfo | null => {
    const lv = view.current[side][depth];
    if (!lv) return null;
    const m = mid.current;
    const d = lv.price - m;
    return {
      side,
      price: lv.price,
      size: lv.size,
      total: lv.cum,
      notional: lv.notional,
      depth,
      fromMid: d,
      fromMidBp: m ? (d / m) * 1e4 : 0,
      mine: lv.mine,
    };
  };

  const tooltipFor = (a: Active): TooltipContent | null => {
    const c = cfg.current;
    const info = levelInfo(a.side, a.depth);
    if (!info) return null;
    const p = c.pal;
    const rows: TooltipContent["rows"] = [
      { key: "s", label: "Level size", value: c.formatSize(info.size), color: a.side === "ask" ? p.accent : p.text },
      { key: "t", label: `Total, ${a.depth + 1} level${a.depth ? "s" : ""}`, value: c.formatSize(info.total) },
      { key: "n", label: "Notional", value: c.formatNotional(info.notional) },
      {
        key: "d",
        label: "From mid",
        value: `${formatSigned(info.fromMid, c.formatPrice)} · ${formatSigned(info.fromMidBp, (v) => formatNumber(v, 1))} bp`,
        strong: false,
      },
    ];
    if (info.mine > 0) rows.push({ key: "m", label: "Your orders", value: c.formatSize(info.mine), color: p.accent, dashed: true });
    return {
      key: `${a.side}${a.depth}|${info.price}|${info.size}|${info.total}|${info.mine}|${p.text}|${Math.round(info.fromMidBp * 10)}`,
      title: `${a.side === "ask" ? "Ask" : "Bid"} · ${c.formatPrice(info.price)}`,
      rows,
    };
  };

  const placeTip = () => {
    const tip = tipRef.current;
    const a = st.current.active;
    const root = rootRef.current;
    if (!tip?.el || !a || !root) return;
    const row = slots.current[a.side][a.depth]?.row;
    if (!row) return;
    const rr = root.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    const x = st.current.source === "pointer" || st.current.source === "touch" ? st.current.pointerX : r.left - rr.left + r.width * 0.55;
    const pos = placeTooltip(clamp(x, 0, rr.width), r.top - rr.top + 2, tip.size.w, tip.size.h, rr.width, rr.height, 10);
    // Never over the column headers: drop below the level instead.
    const grid = row.closest('[role="grid"]');
    const headerBottom = grid ? grid.getBoundingClientRect().top - rr.top + 24 : 0;
    if (pos.y < headerBottom) pos.y = Math.round(Math.min(rr.height - tip.size.h, r.bottom - rr.top + 8));
    tip.el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
  };

  const paintActive = () => {
    const a = st.current.active;
    for (const side of SIDES) {
      const arr = slots.current[side];
      for (let i = 0; i < arr.length; i++) {
        const row = arr[i]?.row;
        if (!row) continue;
        const on = !!a && a.side === side && a.depth === i;
        const inRange = !!a && a.side === side && i < a.depth;
        if ((row.dataset.active === "true") !== on) row.setAttribute("data-active", on ? "true" : "false");
        if ((row.dataset.range === "true") !== inRange) row.setAttribute("data-range", inRange ? "true" : "false");
      }
    }
  };

  const setActive = (a: Active | null, source: Source | null) => {
    const s = st.current;
    if (a && !view.current[a.side][a.depth]) a = null;
    const same = (!a && !s.active) || (a && s.active && a.side === s.active.side && a.depth === s.active.depth);
    s.active = a;
    s.source = a ? source : null;
    if (!same) paintActive();
    tipRef.current?.set(a ? tooltipFor(a) : null);
    placeTip();
  };

  const setTabStop = (a: Active | null) => {
    const s = st.current;
    const prev = s.tabStop;
    if (prev && a && prev.side === a.side && prev.depth === a.depth) return;
    if (prev) slots.current[prev.side][prev.depth]?.row?.setAttribute("tabindex", "-1");
    s.tabStop = a;
    if (a) slots.current[a.side][a.depth]?.row?.setAttribute("tabindex", "0");
  };

  // --- Flush: one DOM pass per frame, however many messages arrived ---------------------------------

  const flush = () => {
    raf.current = 0;
    const c = cfg.current;
    const S = store.current;
    const p = c.pal;
    const now = performance.now();
    const levels: Record<BookSide, Level[]> = {
      bid: aggregate(S.bids, "bid", c.tick, c.n, c.mine.bid),
      ask: aggregate(S.asks, "ask", c.tick, c.n, c.mine.ask),
    };
    view.current = levels;
    const bb = levels.bid[0]?.price;
    const ba = levels.ask[0]?.price;
    // Mid and spread from the raw touch, so grouping never widens the quoted spread.
    let rawBid = -Infinity;
    let rawAsk = Infinity;
    for (const [px, sz] of S.bids) if (sz > 0 && px > rawBid) rawBid = px;
    for (const [px, sz] of S.asks) if (sz > 0 && px < rawAsk) rawAsk = px;
    const hasTouch = Number.isFinite(rawBid) && Number.isFinite(rawAsk);
    const m = hasTouch ? (rawBid + rawAsk) / 2 : (bb ?? ba ?? 0);
    mid.current = m;
    const maxCum = Math.max(levels.bid[levels.bid.length - 1]?.cum ?? 0, levels.ask[levels.ask.length - 1]?.cum ?? 0, 1e-12);
    const doFlash = c.flash && !c.reduce && !resetFlash.current;

    for (const side of SIDES) {
      const L = levels[side];
      const els = slots.current[side];
      const ch = cache.current[side];
      const prev = prevSizes.current[side];
      const best = prevBest.current[side];
      const sideTint = side === "ask" ? withAlpha(p.accent, 0.24) : withAlpha(p.text, 0.11);
      const dropTint = withAlpha(p.text, 0.05);
      for (let i = 0; i < c.n; i++) {
        const el = els[i];
        if (!el?.row) continue;
        const k = ch[i] ?? (ch[i] = emptyCache());
        const lv = L[i];
        if (!lv) {
          if (!k.empty) {
            k.empty = true;
            if (el.price) el.price.textContent = "";
            if (el.size) el.size.textContent = "";
            if (el.total) el.total.textContent = "";
            if (el.mineSr) el.mineSr.textContent = "";
            if (el.mine) el.mine.style.opacity = "0";
            if (el.bar) el.bar.style.transform = "scaleX(0)";
            el.row.dataset.empty = "true";
            el.row.setAttribute("aria-hidden", "true");
            k.price = k.size = k.total = k.mine = "\u0000";
            k.frac = 0;
          }
          continue;
        }
        if (k.empty || el.row.dataset.empty !== "false") {
          k.empty = false;
          el.row.dataset.empty = "false";
          el.row.removeAttribute("aria-hidden");
        }
        const pt = c.formatPrice(lv.price);
        if (k.price !== pt && el.price) el.price.textContent = k.price = pt;
        const sz = c.formatSize(lv.size);
        if (k.size !== sz && el.size) el.size.textContent = k.size = sz;
        const tt = c.formatSize(lv.cum);
        if (k.total !== tt && el.total) el.total.textContent = k.total = tt;
        const mn = lv.mine > 0 ? `, your orders ${c.formatSize(lv.mine)}` : "";
        if (k.mine !== mn) {
          k.mine = mn;
          if (el.mineSr) el.mineSr.textContent = mn;
          if (el.mine) el.mine.style.opacity = mn ? "1" : "0";
        }
        const frac = clamp(lv.cum / maxCum, 0, 1);
        if (Math.abs(frac - k.frac) > 0.002 && el.bar) {
          k.frac = frac;
          el.bar.style.transform = `scaleX(${frac.toFixed(4)})`;
        }
        // Flash a level whose size changed, or a new level that improved the touch. A level that
        // only moved slot as the book shifted keeps its size and stays quiet.
        if (doFlash && el.flash && now - k.flashAt > FLASH_GAP_MS) {
          const before = prev.get(lv.price);
          const isNewTouch = before === undefined && best !== null && (side === "bid" ? lv.price > best : lv.price < best);
          const changed = before !== undefined ? Math.abs(before - lv.size) > 1e-12 : isNewTouch;
          if (changed) {
            const tint = before === undefined || lv.size > before ? sideTint : dropTint;
            if (k.flashTint !== tint) el.flash.style.background = k.flashTint = tint;
            k.anim?.cancel();
            k.anim = el.flash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FLASH_MS, easing: easeCss.out });
            k.flashAt = now;
          }
        }
      }
      const next = new Map<number, number>();
      for (const lv of L) next.set(lv.price, lv.size);
      prevSizes.current[side] = next;
      prevBest.current[side] = L[0]?.price ?? null;
    }
    resetFlash.current = false;

    // Keep the tab stop on a real level.
    const s = st.current;
    if (!s.tabStop || !levels[s.tabStop.side][s.tabStop.depth]) {
      const first: Active | null = levels.ask.length ? { side: "ask", depth: 0 } : levels.bid.length ? { side: "bid", depth: 0 } : null;
      const keep = s.tabStop && levels[s.tabStop.side].length ? { side: s.tabStop.side, depth: levels[s.tabStop.side].length - 1 } : first;
      setTabStop(keep);
    }

    // Centre row: last trade when there is one, else mid; arrows carry the direction as well as colour.
    const shown = S.last ?? (hasTouch ? m : null);
    if (shown !== null) {
      if (S.last === null && S.shown !== null && shown !== S.shown) S.shownDir = shown > S.shown ? 1 : -1;
      if (S.last !== null) S.shownDir = S.lastDir;
      S.shown = shown;
    }
    const sc = spreadCache.current;
    const lastText = shown === null ? "–" : c.formatPrice(shown);
    if (sc.last !== lastText && lastRef.current) lastRef.current.textContent = sc.last = lastText;
    const dir = S.shownDir;
    const arrow = dir > 0 ? "↑" : dir < 0 ? "↓" : "";
    const color = dir > 0 ? p.success : dir < 0 ? p.error : p.text;
    if (sc.arrow !== arrow) {
      sc.arrow = arrow;
      if (arrowRef.current) arrowRef.current.textContent = arrow;
      if (dirSrRef.current) dirSrRef.current.textContent = dir > 0 ? ", up" : dir < 0 ? ", down" : "";
    }
    if (sc.color !== color) {
      sc.color = color;
      if (lastRef.current) lastRef.current.style.color = color;
      if (arrowRef.current) arrowRef.current.style.color = color;
    }
    const midText = hasTouch && S.last !== null ? `Mid ${c.formatPrice(m)}` : hasTouch ? "Mid" : "";
    if (sc.mid !== midText && midRef.current) midRef.current.textContent = sc.mid = midText;
    const spread = hasTouch ? rawAsk - rawBid : NaN;
    const spreadText = hasTouch
      ? `Spread ${formatFixed(spread, Math.max(c.pricePlaces, decimalsOf(spread)))} · ${formatNumber(m ? (spread / m) * 1e4 : 0, 1)} bp`
      : "No spread";
    if (sc.spread !== spreadText && spreadRef.current) spreadRef.current.textContent = sc.spread = spreadText;

    // Imbalance across the visible levels.
    const bidVol = levels.bid[levels.bid.length - 1]?.cum ?? 0;
    const askVol = levels.ask[levels.ask.length - 1]?.cum ?? 0;
    const f = bidVol + askVol > 0 ? bidVol / (bidVol + askVol) : 0.5;
    if (Math.abs(f - sc.imb) > 0.001) {
      sc.imb = f;
      if (imbBarRef.current) imbBarRef.current.style.transform = `translateX(${(f * 100).toFixed(2)}%)`;
      const pct = Math.round(f * 100);
      if (imbBidRef.current) imbBidRef.current.textContent = `${pct}%`;
      if (imbAskRef.current) imbAskRef.current.textContent = `${100 - pct}%`;
      const meter = imbMeterRef.current;
      if (meter && meter.getAttribute("aria-valuenow") !== String(pct)) {
        meter.setAttribute("aria-valuenow", String(pct));
        meter.setAttribute("aria-valuetext", `Bids ${pct} percent, asks ${100 - pct} percent of visible size`);
      }
    }

    // Live tooltip.
    if (s.active) {
      if (!levels[s.active.side][s.active.depth]) setActive(null, null);
      else tipRef.current?.set(tooltipFor(s.active));
    }

    // Spoken summary, throttled; never every tick.
    if (c.announce !== "off" && (c.announce === "always" || s.focusWithin) && shown !== null && now - s.lastSay >= c.announceInterval) {
      s.lastSay = now;
      const pct = Math.round(f * 100);
      announcer.current?.say(
        `${S.last !== null ? "Last" : "Mid"} ${c.formatPrice(shown)}${dir > 0 ? ", up" : dir < 0 ? ", down" : ""}. ${
          hasTouch ? `Spread ${c.formatPrice(spread)}. ` : ""
        }Bids ${pct} percent of visible size.`,
      );
    }
  };
  const flushRef = useRef(flush);
  useLayoutEffect(() => {
    flushRef.current = flush;
  });

  const schedule = useCallback(() => {
    if (raf.current || typeof window === "undefined") return;
    raf.current = requestAnimationFrame(() => flushRef.current());
  }, []);
  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
    },
    [],
  );

  const setLast = useCallback((price: number | undefined) => {
    if (price === undefined || !Number.isFinite(price)) return;
    const S = store.current;
    if (S.last !== null && price !== S.last) S.lastDir = price > S.last ? 1 : -1;
    S.last = price;
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      applySnapshot: (snap) => {
        const S = store.current;
        S.bids.clear();
        S.asks.clear();
        applyLevels(S.bids, snap.bids);
        applyLevels(S.asks, snap.asks);
        setLast(snap.last);
        schedule();
      },
      applyDelta: (d) => {
        const S = store.current;
        applyLevels(S.bids, d.bids);
        applyLevels(S.asks, d.asks);
        setLast(d.last);
        schedule();
      },
      apply: (msg) => {
        const S = store.current;
        if (msg.type === "snapshot") {
          S.bids.clear();
          S.asks.clear();
        }
        applyLevels(S.bids, msg.bids);
        applyLevels(S.asks, msg.asks);
        setLast(msg.last);
        schedule();
      },
      setLastPrice: (price) => {
        setLast(price);
        schedule();
      },
      getSnapshot: () => {
        const S = store.current;
        const toLevels = (map: Map<number, number>, desc: boolean) =>
          [...map].filter(([, s]) => s > 0).sort((a, b) => (desc ? b[0] - a[0] : a[0] - b[0])).map(([price, size]) => ({ price, size }));
        return { bids: toLevels(S.bids, true), asks: toLevels(S.asks, false), last: S.last ?? undefined };
      },
    }),
    [schedule, setLast],
  );

  // Props as a snapshot.
  useEffect(() => {
    if (!bids && !asks) return;
    const S = store.current;
    S.bids.clear();
    S.asks.clear();
    applyLevels(S.bids, bids);
    applyLevels(S.asks, asks);
    schedule();
  }, [bids, asks, schedule]);

  useEffect(() => {
    setLast(lastPrice);
    schedule();
  }, [lastPrice, setLast, schedule]);

  // Grouping, row count or layout changed: the slots are new, so rewrite them all without flashing.
  useLayoutEffect(() => {
    cache.current = { bid: [], ask: [] };
    spreadCache.current = { last: "", arrow: "", color: "", mid: "", spread: "", imb: -1 };
    resetFlash.current = true;
    const s = st.current;
    const stop = s.tabStop;
    s.tabStop = null;
    if (stop) setTabStop(stop);
    flushRef.current();
    paintActive();
    if (s.active) setActive(s.active, s.source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, n, split, showTotal, mine, pal, formatPrice, formatSize]);

  // Motion is set here, after hydration, so server and client markup agree. Reduced motion
  // drops the bar glide and stops any flash in flight.
  useLayoutEffect(() => {
    applyMotion(slots.current, cache.current, imbBarRef.current, reduce);
  }, [reduce, n, split, showTotal, showImbalance]);

  // Posed level.
  useEffect(() => {
    if (activeLevel === undefined) return;
    const id = requestAnimationFrame(() => setActive(activeLevel, activeLevel ? "prop" : null));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLevel?.side, activeLevel?.depth]);

  // A touch-pinned tooltip stays until the next tap outside the book.
  useEffect(() => {
    const onDown = (e: globalThis.PointerEvent) => {
      if (st.current.source !== "touch") return;
      if (rootRef.current?.contains(e.target as Node)) return;
      setActive(null, null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Input -----------------------------------------------------------------------------------------

  const rowOf = (target: EventTarget | null): Active | null => {
    const row = (target as HTMLElement | null)?.closest?.("[data-depth]") as HTMLElement | null;
    if (!row || row.dataset.empty === "true" || !rootRef.current?.contains(row)) return null;
    return { side: row.dataset.side as BookSide, depth: Number(row.dataset.depth) };
  };

  const localX = (clientX: number) => clientX - (rootRef.current?.getBoundingClientRect().left ?? 0);

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    const a = rowOf(e.target);
    const s = st.current;
    if (!a) {
      if (s.source === "pointer") setActive(null, null);
      return;
    }
    s.pointerX = localX(e.clientX);
    setActive(a, "pointer");
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "touch") return;
    const a = rowOf(e.target);
    if (!a) return;
    st.current.pointerX = localX(e.clientX);
    setActive(a, "touch");
  };

  const onPointerLeave = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    const s = st.current;
    if (s.source !== "pointer") return;
    const focused = rowOf(document.activeElement);
    setActive(focused, focused ? "focus" : null);
  };

  const select = (a: Active) => {
    const info = levelInfo(a.side, a.depth);
    if (!info) return;
    cfg.current.onPriceSelect?.(info);
    announcer.current?.say(`Selected ${a.side} ${cfg.current.formatPrice(info.price)}`);
  };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const a = rowOf(e.target);
    if (a) select(a);
  };

  // Mouse clicks select without stealing focus, so a keyboard position survives a stray click.
  const onMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (rowOf(e.target)) e.preventDefault();
  };

  const focusLevel = (a: Active) => {
    const row = slots.current[a.side][a.depth]?.row;
    if (!row) return;
    setTabStop(a);
    row.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const a = rowOf(e.target);
    if (!a) return;
    const L = view.current;
    const k = e.key;
    if (k === "Enter" || k === " ") {
      e.preventDefault();
      select(a);
      return;
    }
    if (k === "Escape") {
      if (st.current.active) {
        e.preventDefault();
        setActive(null, null);
      }
      return;
    }
    const step = k === "PageUp" || k === "PageDown" ? 5 : 1;
    let next: Active | null = null;
    if (split) {
      if (k === "ArrowUp" || k === "PageUp") next = { side: a.side, depth: Math.max(0, a.depth - step) };
      else if (k === "ArrowDown" || k === "PageDown") next = { side: a.side, depth: Math.min(L[a.side].length - 1, a.depth + step) };
      else if (k === "ArrowLeft" || k === "ArrowRight") {
        const side: BookSide = k === "ArrowLeft" ? "bid" : "ask";
        if (L[side].length) next = { side, depth: Math.min(a.depth, L[side].length - 1) };
      } else if (k === "Home") next = { side: a.side, depth: 0 };
      else if (k === "End") next = { side: a.side, depth: L[a.side].length - 1 };
    } else {
      // Visual order top to bottom: deepest ask … best ask, best bid … deepest bid.
      const list: Active[] = [];
      for (let i = L.ask.length - 1; i >= 0; i--) list.push({ side: "ask", depth: i });
      for (let i = 0; i < L.bid.length; i++) list.push({ side: "bid", depth: i });
      const at = list.findIndex((x) => x.side === a.side && x.depth === a.depth);
      if (k === "ArrowUp" || k === "PageUp") next = list[Math.max(0, at - step)];
      else if (k === "ArrowDown" || k === "PageDown") next = list[Math.min(list.length - 1, at + step)];
      // Home and End jump to the touch and the deepest level on the current side.
      else if (k === "Home") next = { side: a.side, depth: 0 };
      else if (k === "End") next = { side: a.side, depth: L[a.side].length - 1 };
    }
    if (!next) return;
    e.preventDefault();
    if (next.depth >= 0) focusLevel(next);
  };

  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    st.current.focusWithin = true;
    const a = rowOf(e.target);
    if (!a) return;
    setTabStop(a);
    setActive(a, "focus");
  };

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (rootRef.current?.contains(e.relatedTarget as Node)) return;
    st.current.focusWithin = false;
    if (st.current.source === "focus") setActive(null, null);
  };

  // --- Layout ------------------------------------------------------------------------------------------

  // Price gets a little more room than size and total, wherever it sits in the row.
  const colsFor = (order: readonly ("price" | "size" | "total")[]) =>
    order
      .filter((k) => k !== "total" || showTotal)
      .map((k) => (k === "price" ? "minmax(0,1.1fr)" : "minmax(0,1fr)"))
      .join(" ");
  const bidBar = withAlpha(pal.text, 0.075);
  const askBar = withAlpha(pal.accent, 0.13);
  const bidInk = pal.text;
  const askInk = pal.accentInk;

  const renderSide = (side: BookSide, order: readonly ("price" | "size" | "total")[], anchor: "left" | "right", reverse: boolean) => {
    const out: ReactNode[] = [];
    for (let j = 0; j < n; j++) {
      const depth = reverse ? n - 1 - j : j;
      out.push(
        <SlotRow
          key={`${side}${depth}`}
          side={side}
          depth={depth}
          order={order}
          anchor={anchor}
          showTotal={showTotal}
          rowHeight={rowHeight}
          columns={colsFor(order)}
          barColor={side === "ask" ? askBar : bidBar}
          priceColor={side === "ask" ? askInk : bidInk}
          register={register}
        />,
      );
    }
    return out;
  };

  const headerCell = "font-mono text-[9px] uppercase leading-none tracking-[0.1em] text-[color:var(--bjork-text-soft)] [text-box:trim-both_cap_alphabetic]";
  const header = (order: readonly ("price" | "size" | "total")[], priceRight: boolean) => (
    <div role="row" className="grid h-6 items-center gap-3 px-2" style={{ gridTemplateColumns: colsFor(order) }}>
      {order.map((k) =>
        k === "total" && !showTotal ? null : (
          <span key={k} role="columnheader" className={cn(headerCell, "flex", k === "price" && !priceRight ? "justify-start" : "justify-end")}>
            {k === "price" ? priceLabel : k === "size" ? sizeLabel : "Total"}
          </span>
        ),
      )}
    </div>
  );

  const centre = (
    <div className={cn("flex min-w-0 items-center gap-3 px-2", split ? "h-9" : "h-[38px]")}>
      <span className="flex min-w-0 items-center gap-1 font-mono text-[15px] leading-none tabular-nums">
        <span ref={lastRef} className="[text-box:trim-both_cap_alphabetic]" />
        <span ref={arrowRef} aria-hidden="true" className="w-[1ch] text-[13px]" />
        <span ref={dirSrRef} className="sr-only" />
      </span>
      <span ref={midRef} className={cn("font-mono text-[11px] leading-none tabular-nums text-[color:var(--bjork-text-soft)]", narrow && "hidden")} />
      <span ref={spreadRef} className="ml-auto whitespace-nowrap font-mono text-[11px] leading-none tabular-nums text-[color:var(--bjork-text-muted)]" />
    </div>
  );

  const PRICE_FIRST = ["price", "size", "total"] as const;
  const PRICE_LAST = ["total", "size", "price"] as const;

  const sideKeys = !narrow && (
    <div aria-hidden="true" className="flex items-center gap-4 font-bjork-alpha text-[11px] font-medium leading-3 text-[color:var(--bjork-text-medium)]">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-[2px] w-2.5 rounded-[1px] bg-[color:var(--bjork-text-medium)]" />
        Bids
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-[2px] w-2.5 rounded-[1px] bg-[color:var(--bjork-accent)]" />
        Asks
      </span>
    </div>
  );

  const keyHelp = split
    ? "Up and down move through a side, left and right switch between bids and asks, Enter selects a price."
    : "Up and down move through the levels, Home and End jump to the best and deepest level, Enter selects a price.";

  return (
    <div
      ref={rootRef}
      className={cn("relative w-full select-none text-[color:var(--bjork-text)]", className)}
      style={vars as CSSProperties}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerLeave={onPointerLeave}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <div className="mb-1 flex min-h-7 items-center justify-between gap-3">
        {sideKeys || <span />}
        {tickSizes && tickSizes.length > 1 && <GroupingControl ticks={tickSizes} value={tick} onChange={setTick} />}
      </div>

      {split ? (
        <>
          <div className="border-y border-[color:var(--bjork-hair)]">{centre}</div>
          <div className="grid grid-cols-2 gap-2">
            <div role="grid" aria-label={`${ariaLabel}, bids. ${keyHelp}`}>
              {header(PRICE_LAST, true)}
              <div role="rowgroup">{renderSide("bid", PRICE_LAST, "right", false)}</div>
            </div>
            <div role="grid" aria-label={`${ariaLabel}, asks. ${keyHelp}`}>
              {header(PRICE_FIRST, false)}
              <div role="rowgroup">{renderSide("ask", PRICE_FIRST, "left", false)}</div>
            </div>
          </div>
        </>
      ) : (
        <div role="grid" aria-label={`${ariaLabel}. ${keyHelp}`}>
          {header(PRICE_FIRST, false)}
          <div role="rowgroup" aria-label="Asks">
            {renderSide("ask", PRICE_FIRST, "right", true)}
          </div>
          <div role="row" className="border-y border-[color:var(--bjork-hair)]">
            <div role="gridcell" aria-colspan={showTotal ? 3 : 2}>
              {centre}
            </div>
          </div>
          <div role="rowgroup" aria-label="Bids">
            {renderSide("bid", PRICE_FIRST, "right", false)}
          </div>
        </div>
      )}

      {showImbalance && (
        <div className="mt-2 flex items-center gap-2 px-2 font-mono text-[10px] leading-none tabular-nums">
          <span className="text-[color:var(--bjork-text-medium)]">
            B <span ref={imbBidRef} />
          </span>
          <div
            ref={imbMeterRef}
            role="meter"
            aria-label="Book imbalance"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={50}
            className="relative h-1 flex-1 overflow-hidden rounded-full"
            style={{ background: withAlpha(pal.text, 0.6) }}
          >
            {/* Ask share: an accent panel slides in from the right, a stage-coloured edge marks the split. */}
            <span
              ref={imbBarRef}
              aria-hidden="true"
              className={cn("absolute inset-y-0 left-0 w-full border-l-2 border-[color:var(--bjork-chart-bg)]")}
              style={{ background: pal.accent, transform: "translateX(50%)" }}
            />
          </div>
          <span className="text-[color:var(--bjork-text-medium)]">
            <span ref={imbAskRef} /> A
          </span>
        </div>
      )}

      <HoverTooltip ref={tipRef} onMeasure={placeTip} />
      <ChartAnnouncer ref={announcer} />
    </div>
  );
});

// --- Simulated feed ---------------------------------------------------------------------------------------

export interface OrderBookFeedOptions {
  seed?: number;
  /** Starting mid. Default 101.2. */
  mid?: number;
  /** Exchange tick. Default 0.05. */
  tick?: number;
  /** Levels kept per side. Default 48. */
  depth?: number;
  /** Quiet-market message rate per second. Default 10. */
  rate?: number;
  /** Mean seconds between spontaneous bursts. 0 turns them off. Default 9. */
  burstEvery?: number;
}

export interface OrderBookFeed {
  snapshot: () => OrderBookSnapshot;
  /** Advances one message and returns it. Deterministic for a seed. */
  step: (intensity?: number) => OrderBookDelta;
  /** Streams a snapshot then deltas, like a WebSocket. Returns the unsubscribe. */
  subscribe: (listener: (message: OrderBookMessage) => void) => () => void;
  /** A volatile spell: several times the message rate and step size, for `ms`. */
  burst: (ms?: number) => void;
  setPaused: (paused: boolean) => void;
}

// A seeded random-walk book for demos and tests. Prices are kept as integer ticks internally so
// levels never drift apart through float error. Swap it for your exchange's socket in production.
export function createOrderBookFeed(opts: OrderBookFeedOptions = {}): OrderBookFeed {
  const rnd = mulberry32(opts.seed ?? 7);
  const tick = opts.tick ?? 0.05;
  const depth = opts.depth ?? 48;
  const rate = opts.rate ?? 10;
  const burstEvery = opts.burstEvery ?? 9;
  const dec = decimalsOf(tick);
  const px = (i: number) => +(i * tick).toFixed(dec);
  let fair = (opts.mid ?? 101.2) / tick;
  const bids = new Map<number, number>();
  const asks = new Map<number, number>();
  let last = Math.round(fair);
  let burstUntil = 0;
  let paused = false;
  const sizeAt = (k: number) => Math.max(1, Math.round((18 + rnd() * 110) * (1 + k * 0.05) * (rnd() < 0.06 ? 4.5 : 1)));

  let bestBid = Math.floor(fair - 0.5);
  for (let k = 0; k < depth; k++) {
    bids.set(bestBid - k, sizeAt(k));
    asks.set(bestBid + 1 + k, sizeAt(k));
  }

  const toLevels = (m: Map<number, number>, desc: boolean) =>
    [...m].sort((a, b) => (desc ? b[0] - a[0] : a[0] - b[0])).map(([i, size]) => ({ price: px(i), size }));

  const snapshot = (): OrderBookSnapshot => ({ bids: toLevels(bids, true), asks: toLevels(asks, false), last: px(last) });

  const step = (intensity = 1): OrderBookDelta => {
    const dB = new Map<number, number>();
    const dA = new Map<number, number>();
    const set = (side: BookSide, i: number, size: number) => {
      const m = side === "bid" ? bids : asks;
      if (size > 0) m.set(i, size);
      else m.delete(i);
      (side === "bid" ? dB : dA).set(i, Math.max(0, size));
    };
    let traded = false;

    // Fair value walks; bursts move it further and faster.
    fair += gaussian(rnd) * 0.22 * intensity;

    // Aggressive orders take liquidity at the touch and lean fair value their way.
    if (rnd() < 0.35 * intensity) {
      const buy = rnd() < 0.5 + clamp((fair - last) * 0.15, -0.3, 0.3);
      const m = buy ? asks : bids;
      let best = buy ? Infinity : -Infinity;
      for (const i of m.keys()) best = buy ? Math.min(best, i) : Math.max(best, i);
      if (Number.isFinite(best)) {
        const have = m.get(best) ?? 0;
        const take = Math.max(1, Math.round(have * (0.15 + rnd() * (intensity > 1 ? 1.1 : 0.7))));
        set(buy ? "ask" : "bid", best, have - take);
        last = best;
        traded = true;
        if (take >= have) fair += buy ? 0.45 : -0.45;
      }
    }

    // Re-centre: quote around fair value with a mostly one-tick spread.
    const spreadTicks = rnd() < 0.86 ? 1 : rnd() < 0.8 ? 2 : 3;
    bestBid = Math.floor(fair - spreadTicks / 2);
    const bestAsk = bestBid + spreadTicks;
    for (const i of [...bids.keys()]) if (i > bestBid || i < bestBid - depth - 3) set("bid", i, 0);
    for (const i of [...asks.keys()]) if (i < bestAsk || i > bestAsk + depth + 3) set("ask", i, 0);
    for (let k = 0; k < depth; k++) {
      if (!bids.has(bestBid - k) && (k > 0 || rnd() < 0.9)) set("bid", bestBid - k, k === 0 ? Math.round(sizeAt(0) * 0.6) : sizeAt(k));
      if (!asks.has(bestAsk + k) && (k > 0 || rnd() < 0.9)) set("ask", bestAsk + k, k === 0 ? Math.round(sizeAt(0) * 0.6) : sizeAt(k));
    }

    // Makers add, trim and cancel, mostly near the touch.
    const churn = 1 + Math.floor(rnd() * 3 * intensity);
    for (let j = 0; j < churn; j++) {
      const side: BookSide = rnd() < 0.5 ? "bid" : "ask";
      const k = Math.floor(rnd() * rnd() * depth);
      const i = side === "bid" ? bestBid - k : bestAsk + k;
      const m = side === "bid" ? bids : asks;
      const cur = m.get(i) ?? 0;
      const r = rnd();
      // Multipliers average just under 1, and walls are capped, so the book never inflates over a long session.
      const size = r < 0.06 ? Math.min(cur + sizeAt(k) * 3, 2400) : r < 0.16 && k > 2 ? 0 : Math.max(1, Math.min(2400, Math.round(cur * (0.68 + rnd() * 0.62))));
      set(side, i, size);
    }

    const out = (d: Map<number, number>) => [...d].map(([i, size]) => ({ price: px(i), size }));
    return { bids: out(dB), asks: out(dA), last: traded ? px(last) : undefined };
  };

  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<(m: OrderBookMessage) => void>();
  const loop = () => {
    timer = null;
    const now = performance.now();
    if (burstEvery > 0 && now > burstUntil && rnd() < 1 / (burstEvery * rate)) burstUntil = now + 1200 + rnd() * 1600;
    const hot = now < burstUntil;
    if (!paused) {
      const msg: OrderBookMessage = { type: "delta", ...step(hot ? 2.4 : 1) };
      for (const l of listeners) l(msg);
    }
    const base = 1000 / (hot ? rate * 6 : rate);
    timer = setTimeout(loop, base * (0.4 + rnd() * 1.2));
  };

  return {
    snapshot,
    step,
    subscribe(listener) {
      listeners.add(listener);
      listener({ type: "snapshot", ...snapshot() });
      if (!timer && typeof window !== "undefined") timer = setTimeout(loop, 1000 / rate);
      return () => {
        listeners.delete(listener);
        if (!listeners.size && timer) {
          clearTimeout(timer);
          timer = null;
        }
      };
    },
    burst(ms = 2200) {
      burstUntil = performance.now() + ms;
    },
    setPaused(p) {
      paused = p;
    },
  };
}
