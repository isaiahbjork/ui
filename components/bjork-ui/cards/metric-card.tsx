"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, RotateCw } from "lucide-react";
import { ease, springs } from "@/components/bjork-ui/_core/motion";
import {
  CardButton,
  CardFrame,
  Skeleton,
  focusRing,
  seeded,
  useCardTheme,
  useReducedMotionSafe,
  type CardTheme,
} from "@/components/bjork-ui/cards/card-kit";
import { cn } from "@/lib/utils";

export interface MetricPoint {
  /** Epoch ms of the bucket. */
  t: number;
  v: number;
}

export interface MetricSeries {
  points: MetricPoint[];
  /** Values of the previous period, same length, for the comparison line and the delta. */
  previous?: number[];
}

export type MetricStatus = "ready" | "loading" | "error";

export interface MetricCardProps<P extends string = string> {
  label?: string;
  /** Period keys in display order, e.g. ["7d", "30d", "90d"]. */
  periods?: readonly P[];
  periodLabels?: Partial<Record<P, string>>;
  /** Long label used in "vs previous …", e.g. { "30d": "30 days" }. */
  periodNames?: Partial<Record<P, string>>;
  data?: Partial<Record<P, MetricSeries>>;
  period?: P;
  defaultPeriod?: P;
  onPeriodChange?: (period: P) => void;
  /** How the headline is totalled. "sum" for flows like revenue, "last" for levels like MRR. Default "sum". */
  aggregate?: "sum" | "last" | "average";
  format?: "currency" | "number" | "percent";
  currency?: string;
  /** Set for metrics where down is good (churn, latency). Flips delta colours. */
  invert?: boolean;
  status?: MetricStatus;
  onRetry?: () => void;
  locale?: string;
  theme?: CardTheme;
  className?: string;
}

const DAY = 86_400_000;

function makeSeries(days: number, seed: number, base: number, end: number): MetricSeries {
  const rnd = seeded(seed);
  const points: MetricPoint[] = [];
  const previous: number[] = [];
  for (let i = 0; i < days; i++) {
    const trend = 1 + (i / days) * 0.22;
    const weekly = 1 + 0.16 * Math.sin((i / 7) * Math.PI * 2 + 1.2);
    points.push({ t: end - (days - 1 - i) * DAY, v: Math.round(base * trend * weekly * (0.88 + rnd() * 0.24)) });
    previous.push(Math.round(base * 0.94 * weekly * (0.86 + rnd() * 0.24)));
  }
  return { points, previous };
}

const SAMPLE_END = Date.UTC(2026, 9, 7);

export const METRIC_SAMPLE = {
  label: "Net revenue",
  periods: ["7d", "30d", "90d"] as const,
  data: {
    "7d": makeSeries(7, 11, 4_200, SAMPLE_END),
    "30d": makeSeries(30, 23, 3_900, SAMPLE_END),
    "90d": makeSeries(90, 37, 3_500, SAMPLE_END),
  },
};

const W = 320;
const H = 88;
const PAD_Y = 6;

function pathFor(values: number[], min: number, max: number) {
  const n = values.length;
  if (n === 0) return "";
  const span = max - min || 1;
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => PAD_Y + (1 - (v - min) / span) * (H - PAD_Y * 2);
  // Monotone-ish smoothing: cubic segments with horizontal tangents at a third of the gap.
  let d = `M${x(0).toFixed(2)},${y(values[0]).toFixed(2)}`;
  for (let i = 1; i < n; i++) {
    const x0 = x(i - 1);
    const x1 = x(i);
    const dx = (x1 - x0) / 3;
    d += ` C${(x0 + dx).toFixed(2)},${y(values[i - 1]).toFixed(2)} ${(x1 - dx).toFixed(2)},${y(values[i]).toFixed(2)} ${x1.toFixed(2)},${y(values[i]).toFixed(2)}`;
  }
  return d;
}

function useTween(target: number, reduce: boolean) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    if (reduce) {
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 520);
      const e = 1 - Math.pow(1 - p, 3);
      const v = from + (target - from) * e;
      fromRef.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, reduce]);
  return reduce ? target : value;
}

/**
 * A KPI tile: headline value, delta against the previous period, and a sparkline you can scrub with
 * the pointer or the arrow keys. Switching the period re-totals and redraws.
 */
export function MetricCard<P extends string = "7d" | "30d" | "90d">({
  label = METRIC_SAMPLE.label,
  periods = METRIC_SAMPLE.periods as unknown as readonly P[],
  periodLabels,
  periodNames,
  data = METRIC_SAMPLE.data as unknown as Partial<Record<P, MetricSeries>>,
  period: periodProp,
  defaultPeriod,
  onPeriodChange,
  aggregate = "sum",
  format = "currency",
  currency = "USD",
  invert = false,
  status = "ready",
  onRetry,
  locale = "en-US",
  theme = "auto",
  className,
}: MetricCardProps<P>) {
  const { style } = useCardTheme(theme);
  const reduce = useReducedMotionSafe();
  const titleId = useId();
  const gradId = useId().replace(/:/g, "");
  const segRef = useRef<HTMLDivElement>(null);

  const [innerPeriod, setInnerPeriod] = useState<P>(defaultPeriod ?? periods[1] ?? periods[0]);
  const period = periodProp ?? innerPeriod;
  const [cursor, setCursor] = useState<number | null>(null);

  const setPeriod = (p: P) => {
    setInnerPeriod(p);
    setCursor(null);
    onPeriodChange?.(p);
  };

  const series = data[period];
  const points = useMemo(() => series?.points ?? [], [series]);
  const values = useMemo(() => points.map((p) => p.v), [points]);
  const previous = useMemo(() => series?.previous ?? [], [series]);
  const empty = status === "ready" && values.length === 0;

  const total = (vals: number[]) => {
    if (vals.length === 0) return 0;
    if (aggregate === "last") return vals[vals.length - 1];
    const sum = vals.reduce((a, b) => a + b, 0);
    return aggregate === "average" ? sum / vals.length : sum;
  };

  const headline = total(values);
  const prevTotal = previous.length ? total(previous) : null;
  const delta = prevTotal ? (headline - prevTotal) / prevTotal : null;
  const good = delta === null ? null : invert ? delta <= 0 : delta >= 0;

  const fmt = useMemo(() => {
    if (format === "currency")
      return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 });
    if (format === "percent") return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  }, [format, currency, locale]);
  const fmtDate = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }),
    [locale],
  );
  const fmtPct = useMemo(
    () => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" }),
    [locale],
  );

  const shown = cursor !== null && points[cursor] ? points[cursor].v : headline;
  const tweened = useTween(status === "ready" ? shown : 0, reduce || cursor !== null);

  const [min, max] = useMemo(() => {
    const all = [...values, ...previous];
    if (all.length === 0) return [0, 1];
    return [Math.min(...all) * 0.96, Math.max(...all) * 1.02];
  }, [values, previous]);
  const line = useMemo(() => pathFor(values, min, max), [values, min, max]);
  const ghost = useMemo(() => pathFor(previous, min, max), [previous, min, max]);
  const area = line ? `${line} L${W},${H} L0,${H} Z` : "";

  const peakIndex = values.length ? values.indexOf(Math.max(...values)) : -1;
  const n = values.length;
  const cx = cursor !== null && n > 1 ? (cursor / (n - 1)) * W : null;
  const cy = cursor !== null && n ? PAD_Y + (1 - (values[cursor] - min) / (max - min || 1)) * (H - PAD_Y * 2) : null;

  const onPointer = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!n) return;
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
    setCursor(Math.max(0, Math.min(n - 1, i)));
  };

  const onKey = (e: ReactKeyboardEvent) => {
    if (!n) return;
    const cur = cursor ?? n - 1;
    let next: number | null = null;
    if (e.key === "ArrowLeft") next = Math.max(0, cur - 1);
    if (e.key === "ArrowRight") next = Math.min(n - 1, cur + 1);
    if (e.key === "PageDown") next = Math.max(0, cur - 7);
    if (e.key === "PageUp") next = Math.min(n - 1, cur + 7);
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = n - 1;
    if (e.key === "Escape") {
      setCursor(null);
      return;
    }
    if (next !== null) {
      e.preventDefault();
      setCursor(next);
    }
  };

  const onSegKey = (e: ReactKeyboardEvent) => {
    const i = periods.indexOf(period);
    let j = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % periods.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i - 1 + periods.length) % periods.length;
    if (j >= 0) {
      e.preventDefault();
      setPeriod(periods[j]);
      segRef.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")[j]?.focus();
    }
  };

  const periodName = periodNames?.[period] ?? defaultName(period);
  const startLabel = points[0] ? fmtDate.format(points[0].t) : "";
  const endLabel = points[n - 1] ? fmtDate.format(points[n - 1].t) : "";

  return (
    <CardFrame aria-labelledby={titleId} aria-busy={status === "loading" || undefined} className={className} style={style}>
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <h3 id={titleId} className="text-[13px] font-medium leading-5 text-[color:var(--bjork-text-medium)]">
          {label}
        </h3>
        <div
          ref={segRef}
          role="radiogroup"
          aria-label="Period"
          onKeyDown={onSegKey}
          className="relative flex rounded-[9px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-card-inset)] p-0.5"
        >
          {periods.map((p) => {
            const on = p === period;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                onClick={() => setPeriod(p)}
                className={cn(
                  "relative h-6 min-w-9 cursor-pointer rounded-[7px] px-2 text-[11px] font-medium uppercase tracking-[0.04em] transition-colors",
                  on ? "text-[color:var(--bjork-text)]" : "text-[color:var(--bjork-text-muted)] hover:text-[color:var(--bjork-text-medium)]",
                  focusRing,
                )}
              >
                {on && (
                  <motion.span
                    layoutId={`${gradId}-seg`}
                    className="absolute inset-0 rounded-[7px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-card-raised)] shadow-[var(--bjork-raised-shadow)]"
                    transition={reduce ? { duration: 0 } : springs.snappy}
                  />
                )}
                <span className="relative">{periodLabels?.[p] ?? p}</span>
              </button>
            );
          })}
        </div>
      </div>

      {status === "loading" && (
        <div className="px-5 pb-5 pt-3" aria-label="Loading">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="mt-2 h-4 w-28" />
          <Skeleton className="mt-5 h-[88px] w-full rounded-[10px]" />
        </div>
      )}

      {status === "error" && (
        <div role="alert" className="flex flex-col items-start gap-3 px-5 pb-6 pt-4">
          <p className="flex items-center gap-2 text-[13px] text-[color:var(--bjork-text-medium)]">
            <AlertTriangle aria-hidden="true" className="size-4 text-[color:var(--bjork-error)]" />
            Couldn’t load {label.toLowerCase()}.
          </p>
          {onRetry && (
            <CardButton size="sm" onClick={onRetry} icon={<RotateCw aria-hidden="true" className="size-3.5" />}>
              Try again
            </CardButton>
          )}
        </div>
      )}

      {status === "ready" && (
        <>
          <div className="px-5 pt-2">
            <p className="text-[30px] font-semibold leading-9 tracking-[-0.02em]" aria-live="off">
              {empty ? "—" : fmt.format(Math.round(tweened))}
            </p>
            <div className="mt-1 flex h-5 items-center gap-2 text-[12px] leading-5">
              {cursor !== null && points[cursor] ? (
                <span className="text-[color:var(--bjork-text-muted)]">{fmtDate.format(points[cursor].t)}</span>
              ) : delta !== null && !empty ? (
                <>
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 rounded-full px-1.5 font-medium",
                      good
                        ? "bg-[color:var(--bjork-success-soft)] text-[color:var(--bjork-success)]"
                        : "bg-[color:var(--bjork-error-soft)] text-[color:var(--bjork-error)]",
                    )}
                  >
                    {delta >= 0 ? (
                      <ArrowUpRight aria-hidden="true" className="size-3" />
                    ) : (
                      <ArrowDownRight aria-hidden="true" className="size-3" />
                    )}
                    {fmtPct.format(delta)}
                  </span>
                  <span className="text-[color:var(--bjork-text-muted)]">vs previous {periodName}</span>
                </>
              ) : (
                <span className="text-[color:var(--bjork-text-muted)]">{empty ? "No data for this period" : " "}</span>
              )}
            </div>
          </div>

          <div className="relative px-5 pb-2 pt-4">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className={cn("block h-[88px] w-full touch-none overflow-visible rounded-[6px]", n ? "cursor-crosshair" : "", focusRing)}
              role="slider"
              tabIndex={n ? 0 : -1}
              aria-label={`${label} by day. Arrow keys move through days`}
              aria-valuemin={0}
              aria-valuemax={Math.max(0, n - 1)}
              aria-valuenow={cursor ?? Math.max(0, n - 1)}
              aria-valuetext={
                n
                  ? `${fmtDate.format(points[cursor ?? n - 1].t)}: ${fmt.format(values[cursor ?? n - 1])}`
                  : "No data"
              }
              onPointerMove={onPointer}
              onPointerDown={onPointer}
              onPointerLeave={(e) => e.pointerType === "mouse" && setCursor(null)}
              onKeyDown={onKey}
              onBlur={() => setCursor(null)}
            >
              <defs>
                <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--bjork-accent)" stopOpacity="0.24" />
                  <stop offset="100%" stopColor="var(--bjork-accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {empty ? (
                <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="var(--bjork-border-strong)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
              ) : (
                <g key={period}>
                  {ghost && (
                    <path d={ghost} fill="none" stroke="var(--bjork-text-faint)" strokeWidth="1.25" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
                  )}
                  <motion.path
                    d={area}
                    fill={`url(#${gradId})`}
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.25, ease: ease.out }}
                  />
                  <motion.path
                    d={line}
                    fill="none"
                    stroke="var(--bjork-accent)"
                    strokeWidth="1.75"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    initial={reduce ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.7, ease: ease.out }}
                  />
                </g>
              )}
              {cx !== null && cy !== null && (
                <g pointerEvents="none">
                  <line x1={cx} x2={cx} y1={0} y2={H} stroke="var(--bjork-text-soft)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                </g>
              )}
            </svg>
            {/* The dot is HTML so it stays round while the SVG stretches. */}
            {cx !== null && cy !== null && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[color:var(--bjork-card)] bg-[color:var(--bjork-accent)]"
                style={{ left: `calc(20px + (100% - 40px) * ${cx / W})`, top: `calc(16px + 88px * ${cy / H})` }}
              />
            )}
            <div className="mt-1.5 flex justify-between text-[11px] leading-4 text-[color:var(--bjork-text-soft)]">
              <span>{startLabel}</span>
              <span>{endLabel}</span>
            </div>
          </div>

          {!empty && (
            <dl className="grid grid-cols-3 border-t border-[color:var(--bjork-border)] text-[12px] leading-4">
              <Stat label="Average" value={fmt.format(Math.round(values.reduce((a, b) => a + b, 0) / n))} />
              <Stat label="Peak" value={fmt.format(values[peakIndex])} sub={fmtDate.format(points[peakIndex].t)} />
              <Stat label="Low" value={fmt.format(Math.min(...values))} />
            </dl>
          )}
        </>
      )}
    </CardFrame>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border-l border-[color:var(--bjork-border)] px-5 py-3 first:border-l-0 @max-[360px]:px-3">
      <dt className="text-[color:var(--bjork-text-muted)]">{label}</dt>
      <dd className="mt-1 truncate font-medium">
        {value}
        {sub && <span className="sr-only"> on {sub}</span>}
      </dd>
    </div>
  );
}

function defaultName(p: string) {
  const m = /^(\d+)([dwmy])$/i.exec(p);
  if (!m) return "period";
  const unit = { d: "days", w: "weeks", m: "months", y: "years" }[m[2].toLowerCase() as "d"];
  return `${m[1]} ${unit}`;
}
