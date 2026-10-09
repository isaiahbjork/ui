"use client";

import { useId, useMemo } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowUpRight, RotateCw } from "lucide-react";
import { ease } from "@/components/bjork-ui/_core/motion";
import {
  CardButton,
  CardFrame,
  Pill,
  Skeleton,
  useCardTheme,
  useClock,
  useReducedMotionSafe,
  type CardTheme,
} from "@/components/bjork-ui/cards/card-kit";
import { cn } from "@/lib/utils";

export interface UsageMeter {
  id: string;
  label: string;
  used: number;
  limit: number;
  /** Unit shown after the numbers, e.g. "requests" or "GB". */
  unit?: string;
  /** Fraction digits for the numbers. Default 0. */
  decimals?: number;
  /** What happens past the limit, e.g. "$0.40 per 1K". Shown once the meter is over. */
  overage?: string;
  /** Project the cycle-end total from the pace so far. Turn off for levels such as seats or storage. Default true. */
  paced?: boolean;
}

export type PlanUsageStatus = "ready" | "loading" | "error";

export interface PlanUsageCardProps {
  planName?: string;
  /** Pre-formatted price, e.g. "$20". */
  price?: string;
  interval?: "month" | "year";
  /** ISO date-time the billing cycle started. */
  cycleStart?: string;
  /** ISO date-time the billing cycle ends (renewal). */
  cycleEnd?: string;
  meters?: UsageMeter[];
  status?: PlanUsageStatus;
  errorMessage?: string;
  onRetry?: () => void;
  onUpgrade?: () => void;
  onManage?: () => void;
  upgradeLabel?: string;
  /** Epoch ms. Freezes the clock for previews and tests. */
  now?: number;
  locale?: string;
  theme?: CardTheme;
  className?: string;
}

export const PLAN_USAGE_SAMPLE = {
  planName: "Pro",
  price: "$20",
  interval: "month" as const,
  cycleStart: "2026-10-01T00:00:00Z",
  cycleEnd: "2026-11-01T00:00:00Z",
  now: Date.UTC(2026, 9, 19, 12),
  meters: [
    { id: "requests", label: "API requests", used: 71_840, limit: 100_000, unit: "requests", overage: "$0.40 per 1K" },
    { id: "seats", label: "Seats", used: 6, limit: 10, unit: "seats", paced: false },
    { id: "storage", label: "Storage", used: 41.6, limit: 50, unit: "GB", decimals: 1, overage: "$0.08 per GB", paced: false },
    { id: "builds", label: "Build minutes", used: 3_120, limit: 3_000, unit: "min", overage: "$0.01 per min" },
  ] satisfies UsageMeter[],
};

type MeterState = "ok" | "pace" | "over";

interface MeterView {
  meter: UsageMeter;
  ratio: number;
  projectedRatio: number;
  state: MeterState;
  note: string | null;
}

const DAY = 86_400_000;

function clamp(v: number, lo = 0, hi = 1) {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Plan usage for the current billing cycle. Each meter projects the cycle-end total from the pace so
 * far, warns before a limit is hit and says what happens past it.
 */
export function PlanUsageCard({
  planName = PLAN_USAGE_SAMPLE.planName,
  price = PLAN_USAGE_SAMPLE.price,
  interval = PLAN_USAGE_SAMPLE.interval,
  cycleStart = PLAN_USAGE_SAMPLE.cycleStart,
  cycleEnd = PLAN_USAGE_SAMPLE.cycleEnd,
  meters = PLAN_USAGE_SAMPLE.meters,
  status = "ready",
  errorMessage = "Usage could not be loaded.",
  onRetry,
  onUpgrade,
  onManage,
  upgradeLabel = "Upgrade to Team",
  now,
  locale = "en-US",
  theme = "auto",
  className,
}: PlanUsageCardProps) {
  const { style } = useCardTheme(theme);
  const reduce = useReducedMotionSafe();
  const titleId = useId();
  const clock = useClock(now, 60_000);

  const start = Date.parse(cycleStart);
  const end = Date.parse(cycleEnd);
  const at = clock ?? start;
  const elapsed = clamp((at - start) / (end - start));
  const daysLeft = Math.max(0, Math.ceil((end - at) / DAY));

  const fmtDate = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }),
    [locale],
  );

  const views = useMemo<MeterView[]>(() => {
    const num = (m: UsageMeter, v: number) =>
      new Intl.NumberFormat(locale, {
        maximumFractionDigits: m.decimals ?? 0,
        minimumFractionDigits: m.decimals ?? 0,
        notation: v >= 100_000 ? "compact" : "standard",
      }).format(v);
    return meters.map((meter) => {
      const ratio = meter.limit > 0 ? meter.used / meter.limit : 0;
      // Pace needs a few percent of the cycle behind it before it means anything.
      const projected = meter.paced !== false && elapsed > 0.04 ? meter.used / elapsed : meter.used;
      const projectedRatio = meter.limit > 0 ? projected / meter.limit : 0;
      let state: MeterState = "ok";
      let note: string | null = null;
      if (ratio >= 1) {
        state = "over";
        note = meter.overage ? `Over by ${num(meter, meter.used - meter.limit)} · ${meter.overage}` : "Limit reached";
      } else if (projectedRatio > 1 && elapsed > 0.04) {
        state = "pace";
        const hitAt = start + (meter.limit / meter.used) * (at - start);
        note = `On pace to hit the limit ${fmtDate.format(hitAt)}`;
      }
      return { meter, ratio, projectedRatio, state, note };
    });
  }, [meters, elapsed, locale, start, at, fmtDate]);

  const attention = views.filter((v) => v.state !== "ok").length;
  const ready = status === "ready";

  return (
    <CardFrame aria-labelledby={titleId} aria-busy={status === "loading" || undefined} className={className} style={style}>
      <header className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 id={titleId} className="text-[15px] font-semibold leading-5">
              {planName} plan
            </h3>
            {ready && attention > 0 && (
              <Pill tone={views.some((v) => v.state === "over") ? "error" : "warning"}>
                {attention} {attention === 1 ? "meter needs" : "meters need"} attention
              </Pill>
            )}
          </div>
          <p className="mt-1 text-[13px] leading-5 text-[color:var(--bjork-text-muted)]">
            <span className="text-[color:var(--bjork-text-medium)]">{price}</span> per {interval}
          </p>
        </div>
        {onManage && (
          <CardButton size="sm" variant="ghost" onClick={onManage} className="-mr-1.5">
            Manage
          </CardButton>
        )}
      </header>

      {/* Billing cycle */}
      <div className="px-5 pt-4">
        <div className="flex items-baseline justify-between text-[12px] leading-4 text-[color:var(--bjork-text-muted)]">
          <span>
            {fmtDate.format(start)} – {fmtDate.format(end - 1)}
          </span>
          <span className="text-[color:var(--bjork-text-medium)]">
            {clock === null ? " " : daysLeft === 0 ? "Renews today" : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`}
          </span>
        </div>
        <div
          className="relative mt-2 h-[3px] overflow-hidden rounded-full bg-[color:var(--bjork-track)]"
          role="progressbar"
          aria-label="Billing cycle elapsed"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(elapsed * 100)}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-[color:var(--bjork-text-soft)]"
            style={{ width: `${elapsed * 100}%` }}
          />
        </div>
      </div>

      <div className="mt-4 border-t border-[color:var(--bjork-border)]">
        {status === "loading" && (
          <ul className="space-y-5 px-5 py-5" aria-label="Loading usage">
            {[0, 1, 2].map((i) => (
              <li key={i} className="space-y-2.5">
                <div className="flex justify-between">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3.5 w-20" />
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
              </li>
            ))}
          </ul>
        )}

        {status === "error" && (
          <div role="alert" className="flex flex-col items-start gap-3 px-5 py-6">
            <div className="flex items-center gap-2 text-[13px] text-[color:var(--bjork-text-medium)]">
              <AlertTriangle aria-hidden="true" className="size-4 text-[color:var(--bjork-error)]" />
              {errorMessage}
            </div>
            {onRetry && (
              <CardButton size="sm" onClick={onRetry} icon={<RotateCw aria-hidden="true" className="size-3.5" />}>
                Try again
              </CardButton>
            )}
          </div>
        )}

        {ready && meters.length === 0 && (
          <p className="px-5 py-6 text-[13px] text-[color:var(--bjork-text-muted)]">This plan has no metered usage.</p>
        )}

        {ready && meters.length > 0 && (
          <ul className="divide-y divide-[color:var(--bjork-border)]">
            {views.map((view, i) => (
              <MeterRow key={view.meter.id} view={view} index={i} reduce={reduce} locale={locale} />
            ))}
          </ul>
        )}
      </div>

      {ready && onUpgrade && (
        <footer className="flex items-center justify-between gap-3 border-t border-[color:var(--bjork-border)] bg-[color:var(--bjork-card-raised)] px-5 py-3.5">
          <p className="min-w-0 text-[12px] leading-4 text-[color:var(--bjork-text-muted)]">
            {attention > 0 ? "Team raises every limit and pools seats." : "Need more room? Compare plans."}
          </p>
          <CardButton
            size="sm"
            variant={attention > 0 ? "primary" : "secondary"}
            onClick={onUpgrade}
            icon={<ArrowUpRight aria-hidden="true" className="size-3.5" />}
            className="flex-row-reverse"
          >
            {upgradeLabel}
          </CardButton>
        </footer>
      )}
    </CardFrame>
  );
}

function MeterRow({
  view,
  index,
  reduce,
  locale,
}: {
  view: MeterView;
  index: number;
  reduce: boolean;
  locale: string;
}) {
  const noteId = useId();
  const labelId = useId();
  const { meter, ratio, projectedRatio, state, note } = view;
  const fmt = new Intl.NumberFormat(locale, {
    maximumFractionDigits: meter.decimals ?? 0,
    minimumFractionDigits: meter.decimals ?? 0,
  });
  const pct = Math.round(ratio * 100);
  const fill = clamp(ratio);
  const ghost = clamp(projectedRatio);
  const color =
    state === "over" ? "var(--bjork-error)" : state === "pace" ? "var(--bjork-warning)" : "var(--bjork-accent)";
  const unit = meter.unit ? ` ${meter.unit}` : "";

  return (
    <li className="px-5 py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="truncate text-[13px] font-medium leading-5">
          {meter.label}
        </span>
        <span className="shrink-0 text-[12px] leading-5 text-[color:var(--bjork-text-muted)]">
          <span className="text-[color:var(--bjork-text)]">{fmt.format(meter.used)}</span>
          {" / "}
          {fmt.format(meter.limit)}
          <span className="hidden @[360px]:inline">{unit}</span>
          <span
            className={cn(
              "ml-2 inline-block min-w-[4ch] text-right",
              state === "over" && "text-[color:var(--bjork-error)]",
              state === "pace" && "text-[color:var(--bjork-warning)]",
            )}
          >
            {pct}%
          </span>
        </span>
      </div>

      <div
        role="meter"
        aria-labelledby={labelId}
        aria-describedby={note ? noteId : undefined}
        aria-valuemin={0}
        aria-valuemax={meter.limit}
        aria-valuenow={Math.min(meter.used, meter.limit)}
        aria-valuetext={`${fmt.format(meter.used)} of ${fmt.format(meter.limit)}${unit}, ${pct}%`}
        className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--bjork-track)]"
      >
        {/* Projected cycle-end usage, drawn as a hatched ghost behind the real fill. */}
        {state === "pace" && (
          <motion.div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 origin-left rounded-full"
            style={{
              width: `${ghost * 100}%`,
              backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 2px, transparent 2px 5px)`,
              opacity: 0.45,
            }}
            initial={reduce ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.7, delay: 0.25 + index * 0.06, ease: ease.out }}
          />
        )}
        <motion.div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 origin-left rounded-full"
          style={{ width: `${fill * 100}%`, background: color }}
          initial={reduce ? false : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.7, delay: 0.1 + index * 0.06, ease: ease.out }}
        />
      </div>

      {note && (
        <p
          id={noteId}
          className={cn(
            "mt-1.5 text-[12px] leading-4",
            state === "over" ? "text-[color:var(--bjork-error)]" : "text-[color:var(--bjork-warning)]",
          )}
        >
          {note}
        </p>
      )}
    </li>
  );
}
