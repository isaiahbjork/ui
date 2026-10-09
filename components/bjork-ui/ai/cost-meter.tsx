"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import { easeCss } from "@/components/bjork-ui/_core/motion";
import {
  AI_PANEL,
  FOCUS_RING,
  formatTokens,
  useAiTone,
  useControllable,
  useHydrated,
  useReduceMotion,
  type BjorkTone,
} from "@/components/bjork-ui/ai/_shared";
import { cn } from "@/lib/utils";

export type CostPeriod = "today" | "7d" | "30d";

export interface ModelUsage {
  id: string;
  model: string;
  /** Uncached input tokens. */
  inputTokens: number;
  outputTokens: number;
  /** Input tokens served from the prompt cache. */
  cachedTokens: number;
  /** Cost for the period, in `currency`. */
  cost: number;
  /** What the cached tokens would have cost at the full input price, minus what they did cost. */
  cacheSavings?: number;
}

export interface DailySpend {
  /** ISO date, such as "2026-10-08". */
  date: string;
  cost: number;
}

export interface CostMeterProps {
  /** Spend for the selected period. */
  spend: number;
  /** Budget for the selected period. Amber at 80%, red at 100%, overage hatched. */
  budget: number;
  breakdown?: ModelUsage[];
  /** Daily spend, oldest first. The last 14 entries are drawn. */
  history?: DailySpend[];
  period?: CostPeriod;
  defaultPeriod?: CostPeriod;
  onPeriodChange?: (period: CostPeriod) => void;
  /** ISO 4217 code. Default "USD". */
  currency?: string;
  /** Header label. Default "Spend". */
  label?: string;
  /** Demo/preview only: shows the crosshair on this history point (0-based, of the drawn points) on mount. */
  defaultActivePoint?: number;
  tone?: BjorkTone;
  className?: string;
}

interface PeriodUsage {
  spend: number;
  budget: number;
  breakdown: ModelUsage[];
}

const HISTORY_VALUES = [0.31, 0.42, 0.28, 0.55, 0.61, 0.38, 0.22, 0.44, 0.63, 0.68, 0.5, 0.55, 0.66, 0.84];

export const SAMPLE_USAGE: { history: DailySpend[]; periods: Record<CostPeriod, PeriodUsage> } = {
  // Fourteen days ending Oct 8, 2026.
  history: HISTORY_VALUES.map((cost, i) => ({ date: `2026-${i < 6 ? "09" : "10"}-${String(i < 6 ? 25 + i : i - 5).padStart(2, "0")}`, cost })),
  periods: {
    today: {
      spend: 0.84,
      budget: 0.75,
      breakdown: [
        { id: "halcyon-3-pro", model: "Halcyon 3 Pro", inputTokens: 148_000, outputTokens: 17_600, cachedTokens: 96_000, cost: 0.64, cacheSavings: 0.26 },
        { id: "corvid-reasoner", model: "Corvid Reasoner", inputTokens: 26_000, outputTokens: 4_100, cachedTokens: 0, cost: 0.17 },
        { id: "kestrel-mini", model: "Kestrel Mini", inputTokens: 92_000, outputTokens: 18_400, cachedTokens: 31_000, cost: 0.03 },
      ],
    },
    "7d": {
      spend: 4.3,
      budget: 5,
      breakdown: [
        { id: "halcyon-3-pro", model: "Halcyon 3 Pro", inputTokens: 812_000, outputTokens: 94_000, cachedTokens: 560_000, cost: 3.41, cacheSavings: 1.51 },
        { id: "corvid-reasoner", model: "Corvid Reasoner", inputTokens: 128_000, outputTokens: 29_000, cachedTokens: 0, cost: 0.75 },
        { id: "kestrel-mini", model: "Kestrel Mini", inputTokens: 384_000, outputTokens: 71_000, cachedTokens: 120_000, cost: 0.14, cacheSavings: 0.02 },
      ],
    },
    "30d": {
      spend: 14.4,
      budget: 20,
      breakdown: [
        { id: "halcyon-3-pro", model: "Halcyon 3 Pro", inputTokens: 2_840_000, outputTokens: 312_000, cachedTokens: 1_900_000, cost: 11.62, cacheSavings: 5.13 },
        { id: "corvid-reasoner", model: "Corvid Reasoner", inputTokens: 410_000, outputTokens: 96_000, cachedTokens: 0, cost: 2.31 },
        { id: "kestrel-mini", model: "Kestrel Mini", inputTokens: 1_200_000, outputTokens: 240_000, cachedTokens: 400_000, cost: 0.47, cacheSavings: 0.05 },
      ],
    },
  },
};

const PERIODS: { id: CostPeriod; label: string; long: string }[] = [
  { id: "today", label: "Today", long: "today" },
  { id: "7d", label: "7d", long: "the last 7 days" },
  { id: "30d", label: "30d", long: "the last 30 days" },
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HATCH =
  "repeating-linear-gradient(-45deg, var(--bjork-error) 0 2px, color-mix(in srgb, var(--bjork-error) 28%, transparent) 2px 4.5px)";

function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : iso;
}

function money(n: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

/**
 * Spend against a budget: a large springing figure, a budget bar that turns amber then red, a per-model breakdown
 * with cache savings, and a 14-day sparkline you can scrub with a pointer or the arrow keys.
 */
export function CostMeter({
  spend,
  budget,
  breakdown = [],
  history = [],
  period,
  defaultPeriod = "30d",
  onPeriodChange,
  currency = "USD",
  label = "Spend",
  defaultActivePoint,
  tone: toneProp,
  className,
}: CostMeterProps) {
  const { style } = useAiTone(toneProp);
  const reduce = useReduceMotion();
  const hydrated = useHydrated();
  const [current, setPeriod] = useControllable(period, defaultPeriod, onPeriodChange);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();
  const labelId = `${baseId}-label`;

  const ratio = budget > 0 ? spend / budget : 0;
  const level = ratio >= 1 ? "over" : ratio >= 0.8 ? "warn" : "ok";
  const levelColor = level === "over" ? "var(--bjork-error)" : level === "warn" ? "var(--bjork-warning)" : "var(--bjork-accent)";
  const base = Math.max(budget, spend) || 1;
  const within = Math.min(spend, budget) / base;
  const over = Math.max(0, spend - budget) / base;
  const fmt = (n: number) => money(n, currency);

  // The figure springs to new values; reduced motion jumps.
  const figure = useSpring(spend, { stiffness: 140, damping: 24, mass: 0.9 });
  const figureText = useTransform(figure, (v) => fmt(Math.max(0, v)));
  useEffect(() => {
    if (reduce) figure.jump(spend);
    else figure.set(spend);
  }, [spend, reduce, figure]);

  // Announce crossing into amber or red.
  const [seen, setSeen] = useState({ level, message: "" });
  if (seen.level !== level) {
    setSeen({
      level,
      message:
        level === "over" ? `Over budget: ${fmt(spend)} of ${fmt(budget)}` : level === "warn" ? `${Math.round(ratio * 100)}% of budget used` : "",
    });
  }

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    let next = delta ? (i + delta + PERIODS.length) % PERIODS.length : -1;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = PERIODS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setPeriod(PERIODS[next].id);
    tabRefs.current[next]?.focus();
  };

  const transition = reduce || !hydrated ? "none" : `transform 520ms ${easeCss.out}, background-color 200ms ease-out`;

  return (
    <section
      aria-labelledby={labelId}
      className={cn(AI_PANEL, "@container w-full max-w-[560px] font-bjork-alpha text-[color:var(--bjork-text)]", className)}
      style={style}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={labelId} className="text-[14px] font-semibold leading-5">
          {label}
        </h2>
        <div role="tablist" aria-label="Period" className="flex rounded-[9px] bg-[color:var(--bjork-surface-active)] p-0.5">
          {PERIODS.map((p, i) => {
            const selected = p.id === current;
            return (
              <button
                key={p.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${p.id}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setPeriod(p.id)}
                onKeyDown={(e) => onTabKey(e, i)}
                className={cn(
                  "h-7 min-w-[44px] cursor-pointer rounded-[7px] px-2.5 font-mono text-[11px] transition-[background-color,color,box-shadow] duration-150",
                  selected
                    ? "bg-[color:var(--bjork-field)] text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-surface)]"
                    : "text-[color:var(--bjork-text-muted)] hover:text-[color:var(--bjork-text)]",
                  FOCUS_RING,
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${current}`}>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <motion.span className="min-w-[5ch] text-[40px] font-semibold leading-[44px] tracking-[-0.03em] tabular-nums">
            {figureText}
          </motion.span>
          <span className="font-mono text-[13px] tabular-nums text-[color:var(--bjork-text-muted)]">of {fmt(budget)}</span>
          <span
            className="ml-auto min-w-[4ch] text-right font-mono text-[12px] tabular-nums transition-colors duration-200"
            style={{ color: level === "ok" ? "var(--bjork-text-muted)" : levelColor }}
          >
            {level === "over" ? `${fmt(spend - budget)} over` : `${Math.round(ratio * 100)}%`}
          </span>
        </div>

        <div
          role="meter"
          aria-labelledby={labelId}
          aria-valuemin={0}
          aria-valuemax={budget}
          aria-valuenow={Math.min(spend, budget)}
          aria-valuetext={`${fmt(spend)} of ${fmt(budget)} budget for ${PERIODS.find((p) => p.id === current)?.long}, ${Math.round(ratio * 100)}%`}
          className="relative mt-3"
        >
          <div className="relative h-2 overflow-hidden rounded-full bg-[color:var(--bjork-hair)]">
            <div
              className="absolute inset-0 origin-left rounded-full"
              style={{ transform: `scaleX(${hydrated ? within : 0})`, background: levelColor, transition }}
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 origin-left"
              style={{
                transform: `translateX(${within * 100}%) scaleX(${hydrated ? over : 0})`,
                background: HATCH,
                transition,
              }}
            />
          </div>
          {/* Budget line when over, and the 80% warning tick. */}
          <div aria-hidden="true" className="relative h-2">
            <span
              className="absolute top-1 h-1.5 w-px -translate-x-1/2 bg-[color:var(--bjork-warning)]"
              style={{ left: `${(budget * 0.8 * 100) / base}%`, opacity: level === "ok" ? 0.45 : 0.9 }}
            />
            {level === "over" && (
              <span
                className="absolute -top-3 h-[18px] w-0.5 -translate-x-1/2 rounded-full bg-[color:var(--bjork-text)]"
                style={{ left: `${(budget * 100) / base}%` }}
              />
            )}
          </div>
        </div>

        {breakdown.length > 0 && <Breakdown rows={breakdown} fmt={fmt} />}
      </div>

      {history.length > 1 && <Sparkline points={history.slice(-14)} fmt={fmt} defaultActive={defaultActivePoint} />}

      <LiveRegion message={seen.message} />
    </section>
  );
}

function Breakdown({ rows, fmt }: { rows: ModelUsage[]; fmt: (n: number) => string }) {
  const th = "pb-1.5 text-right font-mono text-[10px] font-normal uppercase tracking-[0.08em] text-[color:var(--bjork-text-faint)]";
  return (
    <table className="mt-4 w-full table-fixed border-collapse">
      <caption className="sr-only">Usage by model</caption>
      <colgroup>
        <col />
        <col className="w-[30%] @[440px]:w-[26%]" />
        <col className="w-[22%] @[440px]:w-[20%]" />
        <col className="w-[18%] @[440px]:w-[16%]" />
      </colgroup>
      <thead>
        <tr className="border-b border-[color:var(--bjork-border)]">
          <th scope="col" className={cn(th, "text-left")}>
            Model
          </th>
          <th scope="col" className={th}>
            In / out
          </th>
          <th scope="col" className={th}>
            Cached
          </th>
          <th scope="col" className={th}>
            Cost
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-[color:var(--bjork-border)] last:border-b-0">
            <th scope="row" className="truncate py-2 pr-2 text-left text-[13px] font-medium leading-5">
              {r.model}
            </th>
            <td className="py-2 text-right font-mono text-[11.5px] leading-5 tabular-nums text-[color:var(--bjork-text-muted)]">
              {formatTokens(r.inputTokens)}
              <span className="text-[color:var(--bjork-text-faint)]"> / </span>
              {formatTokens(r.outputTokens)}
            </td>
            <td className="py-2 text-right align-top font-mono text-[11.5px] leading-5 tabular-nums">
              <span className={r.cachedTokens ? "text-[color:var(--bjork-text-muted)]" : "text-[color:var(--bjork-text-faint)]"}>
                {r.cachedTokens ? formatTokens(r.cachedTokens) : "—"}
              </span>
              {r.cacheSavings ? (
                <span className="block text-[10.5px] leading-4 text-[color:var(--bjork-success)]">−{fmt(r.cacheSavings)}</span>
              ) : null}
            </td>
            <td className="py-2 text-right align-top font-mono text-[12px] leading-5 tabular-nums text-[color:var(--bjork-text)]">
              {fmt(r.cost)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const CHART_H = 64;
const PAD_TOP = 8;

function Sparkline({ points, fmt, defaultActive }: { points: DailySpend[]; fmt: (n: number) => string; defaultActive?: number }) {
  const [active, setActive] = useState<number | null>(defaultActive ?? null);
  const [said, setSaid] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const summaryId = useId();
  // useId output contains characters that break url(#id) references.
  const gradId = `spend-grad-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const n = points.length;
  const max = Math.max(...points.map((p) => p.cost), 0.0001);
  const total = points.reduce((s, p) => s + p.cost, 0);
  const peak = points.reduce((best, p, i) => (p.cost > points[best].cost ? i : best), 0);
  // x in 0..100 (percent of width), y in px.
  const xs = points.map((_, i) => (i / (n - 1)) * 100);
  const ys = points.map((p) => PAD_TOP + (1 - p.cost / max) * (CHART_H - PAD_TOP - 2));
  const line = points.map((_, i) => `${i ? "L" : "M"}${xs[i]},${ys[i]}`).join(" ");
  const area = `${line} L100,${CHART_H} L0,${CHART_H} Z`;

  const point = active !== null ? points[active] : null;
  const say = (i: number) => setSaid(`${shortDate(points[i].date)}: ${fmt(points[i].cost)}`);

  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
    setActive(Math.min(n - 1, Math.max(0, i)));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = active ?? n - 1;
    let next = cur;
    if (e.key === "ArrowRight") next = Math.min(n - 1, cur + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, cur - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else if (e.key === "Escape") {
      setActive(null);
      return;
    } else return;
    e.preventDefault();
    setActive(next);
    say(next);
  };

  // Tooltip hugs the crosshair but never leaves the chart: pinned left near the start, right near the end.
  const tipAlign = active === null ? 0 : active / (n - 1);

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--bjork-text-faint)]">Last {n} days</span>
        <span className="font-mono text-[11px] tabular-nums text-[color:var(--bjork-text-muted)]">{fmt(total)}</span>
      </div>
      <p id={summaryId} className="sr-only">
        Daily spend over the last {n} days, {fmt(total)} in total, highest on {shortDate(points[peak].date)} at {fmt(points[peak].cost)}.
        Use the left and right arrow keys to read each day.
      </p>
      <div
        ref={boxRef}
        tabIndex={0}
        role="group"
        aria-label="Daily spend chart"
        aria-describedby={summaryId}
        onKeyDown={onKey}
        onFocus={() => {
          if (active === null) {
            setActive(n - 1);
            say(n - 1);
          }
        }}
        onBlur={() => setActive(null)}
        onPointerMove={fromPointer}
        onPointerDown={fromPointer}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse" && document.activeElement !== boxRef.current) setActive(null);
        }}
        className={cn("relative cursor-crosshair touch-pan-y rounded-[6px]", FOCUS_RING)}
        style={{ height: CHART_H }}
      >
        <svg width="100%" height={CHART_H} viewBox={`0 0 100 ${CHART_H}`} preserveAspectRatio="none" aria-hidden="true" className="block overflow-visible">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--bjork-accent)" stopOpacity="0.16" />
              <stop offset="100%" stopColor="var(--bjork-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="0" x2="100" y1={CHART_H - 0.5} y2={CHART_H - 0.5} stroke="var(--bjork-border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <path d={area} fill={`url(#${gradId})`} />
          <path
            d={line}
            fill="none"
            stroke="var(--bjork-accent)"
            strokeWidth="1.75"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {/* The crosshair and dot are HTML so they stay round and crisp under the stretched viewBox. */}
        {point && active !== null && (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 top-0 w-px -translate-x-1/2 bg-[color:var(--bjork-text-faint)]"
              style={{ left: `${xs[active]}%` }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[color:var(--bjork-accent)] bg-[color:var(--bjork-ring-offset)]"
              style={{ left: `${xs[active]}%`, top: ys[active] }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-[calc(100%+6px)] whitespace-nowrap rounded-[7px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-menu)] px-2 py-1 font-mono text-[11px] leading-4 tabular-nums shadow-[var(--bjork-shadow-menu)]"
              style={{ left: `${xs[active]}%`, transform: `translateX(-${tipAlign * 100}%)` }}
            >
              <span className="text-[color:var(--bjork-text-muted)]">{shortDate(point.date)}</span>{" "}
              <span className="text-[color:var(--bjork-text)]">{fmt(point.cost)}</span>
            </span>
          </>
        )}
      </div>
      <div aria-hidden="true" className="mt-1.5 flex justify-between font-mono text-[10px] tabular-nums text-[color:var(--bjork-text-faint)]">
        <span>{shortDate(points[0].date)}</span>
        <span>{shortDate(points[n - 1].date)}</span>
      </div>
      <LiveRegion message={said} />
    </div>
  );
}
