"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Flame, Snowflake } from "lucide-react";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import { ease } from "@/components/bjork-ui/_core/motion";
import {
  CardButton,
  CardFrame,
  Pill,
  focusRing,
  seeded,
  useCardTheme,
  useReducedMotionSafe,
  type CardTheme,
} from "@/components/bjork-ui/cards/card-kit";
import { cn } from "@/lib/utils";

export interface StreakDay {
  /** "YYYY-MM-DD". */
  date: string;
  /** Activity count that day. 0 or missing means nothing logged. */
  count: number;
}

export interface StreakCardProps {
  title?: string;
  /** Noun for one unit of activity, e.g. "session". */
  unit?: string;
  days?: StreakDay[];
  /** Days covered by a streak freeze ("YYYY-MM-DD"). */
  frozen?: string[];
  freezesLeft?: number;
  /** "YYYY-MM-DD" in the user's zone. */
  today?: string;
  best?: number;
  milestones?: number[];
  /** Weeks in the heatmap. Default 18. */
  weeks?: number;
  onCheckIn?: (date: string) => void;
  locale?: string;
  theme?: CardTheme;
  className?: string;
}

const DAY = 86_400_000;
const toKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const fromKey = (k: string) => Date.parse(`${k}T00:00:00Z`);

function makeSample() {
  const today = "2026-10-08";
  const t = fromKey(today);
  const rnd = seeded(2026);
  const days: StreakDay[] = [];
  const frozen = [toKey(t - 9 * DAY)];
  for (let i = 120; i >= 1; i--) {
    const k = toKey(t - i * DAY);
    if (frozen.includes(k)) continue;
    // A 23-day run up to yesterday, patchier before it.
    const inRun = i <= 23;
    const active = inRun || rnd() > 0.38;
    if (active) days.push({ date: k, count: 1 + Math.floor(rnd() * (inRun ? 4 : 3)) });
  }
  return { today, days, frozen };
}

const SAMPLE = makeSample();

export const STREAK_SAMPLE = {
  title: "Writing streak",
  unit: "session",
  today: SAMPLE.today,
  days: SAMPLE.days,
  frozen: SAMPLE.frozen,
  freezesLeft: 2,
  best: 41,
  milestones: [7, 30, 100, 365],
};

function currentStreak(today: string, active: Set<string>, frozen: Set<string>) {
  let n = 0;
  let k = today;
  // Today counts if done; if not, the streak is still alive from yesterday.
  if (!active.has(k)) k = toKey(fromKey(k) - DAY);
  while (active.has(k) || frozen.has(k)) {
    if (active.has(k)) n += 1;
    k = toKey(fromKey(k) - DAY);
  }
  return n;
}

/**
 * A habit streak: the current run, this week at a glance, a heatmap you can walk with the arrow keys,
 * the next milestone and a check-in that celebrates once.
 */
export function StreakCard({
  title = STREAK_SAMPLE.title,
  unit = STREAK_SAMPLE.unit,
  days = STREAK_SAMPLE.days,
  frozen = STREAK_SAMPLE.frozen,
  freezesLeft = STREAK_SAMPLE.freezesLeft,
  today = STREAK_SAMPLE.today,
  best = STREAK_SAMPLE.best,
  milestones = STREAK_SAMPLE.milestones,
  weeks = 18,
  onCheckIn,
  locale = "en-US",
  theme = "auto",
  className,
}: StreakCardProps) {
  const { style } = useCardTheme(theme);
  const reduce = useReducedMotionSafe();
  const titleId = useId();
  const readoutId = useId();

  const [extra, setExtra] = useState<StreakDay[]>([]);
  const [burst, setBurst] = useState(0);
  const [message, setMessage] = useState("");

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of [...days, ...extra]) m.set(d.date, (m.get(d.date) ?? 0) + d.count);
    return m;
  }, [days, extra]);
  const active = useMemo(() => new Set([...counts].filter(([, c]) => c > 0).map(([k]) => k)), [counts]);
  const frozenSet = useMemo(() => new Set(frozen), [frozen]);

  const streak = currentStreak(today, active, frozenSet);
  const doneToday = active.has(today);
  const bestShown = Math.max(best, streak);
  const next = milestones.find((m) => m > streak);
  const prevMilestone = [...milestones].reverse().find((m) => m <= streak) ?? 0;

  const fmtDay = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" }), [locale]);
  const fmtLong = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }),
    [locale],
  );

  // Week strip: Monday-start week containing today.
  const t0 = fromKey(today);
  const dow = (new Date(t0).getUTCDay() + 6) % 7;
  const week = Array.from({ length: 7 }, (_, i) => toKey(t0 + (i - dow) * DAY));

  // Heatmap columns are weeks (oldest left), rows Monday..Sunday.
  const start = t0 - (dow + (weeks - 1) * 7) * DAY;
  const grid = Array.from({ length: 7 }, (_, r) =>
    Array.from({ length: weeks }, (_, c) => toKey(start + (c * 7 + r) * DAY)),
  );
  const [focus, setFocus] = useState<[number, number]>([dow, weeks - 1]);
  const [hover, setHover] = useState<string | null>(null);
  const cellRefs = useRef(new Map<string, HTMLSpanElement>());
  const readKey = hover ?? grid[focus[0]][focus[1]];

  const level = (k: string) => {
    const c = counts.get(k) ?? 0;
    if (c <= 0) return 0;
    return Math.min(4, c);
  };

  const describe = (k: string) => {
    if (fromKey(k) > t0) return `${fmtLong.format(fromKey(k))}: upcoming`;
    const c = counts.get(k) ?? 0;
    if (frozenSet.has(k)) return `${fmtLong.format(fromKey(k))}: streak freeze used`;
    return `${fmtLong.format(fromKey(k))}: ${c === 0 ? `no ${unit}s` : `${c} ${unit}${c === 1 ? "" : "s"}`}`;
  };

  const onGridKey = (e: ReactKeyboardEvent) => {
    let [r, c] = focus;
    if (e.key === "ArrowUp") r = Math.max(0, r - 1);
    else if (e.key === "ArrowDown") r = Math.min(6, r + 1);
    else if (e.key === "ArrowLeft") c = Math.max(0, c - 1);
    else if (e.key === "ArrowRight") c = Math.min(weeks - 1, c + 1);
    else if (e.key === "Home") c = 0;
    else if (e.key === "End") c = weeks - 1;
    else return;
    e.preventDefault();
    setFocus([r, c]);
    setHover(null);
    cellRefs.current.get(grid[r][c])?.focus();
  };

  const checkIn = () => {
    if (doneToday) return;
    setExtra((x) => [...x, { date: today, count: 1 }]);
    setBurst((b) => b + 1);
    onCheckIn?.(today);
    const n = streak + 1;
    setMessage(
      milestones.includes(n) ? `Checked in. ${n}-day milestone reached!` : `Checked in. Streak is ${n} days.`,
    );
  };

  const fill = ["var(--bjork-track)", "color-mix(in oklab, var(--bjork-accent) 30%, var(--bjork-track))", "color-mix(in oklab, var(--bjork-accent) 55%, var(--bjork-track))", "color-mix(in oklab, var(--bjork-accent) 80%, var(--bjork-track))", "var(--bjork-accent)"];

  return (
    <CardFrame aria-labelledby={titleId} className={className} style={style} maxWidth={400}>
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div>
          <h3 id={titleId} className="text-[13px] font-medium leading-5 text-[color:var(--bjork-text-medium)]">
            {title}
          </h3>
          <div className="relative mt-1 flex items-center gap-2">
            <span className="relative grid size-9 place-items-center">
              <Flame
                aria-hidden="true"
                className={cn("size-7 transition-colors duration-300", streak > 0 ? "text-[color:var(--bjork-accent)]" : "text-[color:var(--bjork-text-faint)]")}
                fill={doneToday ? "currentColor" : "none"}
                strokeWidth={1.75}
              />
              <AnimatePresence>
                {burst > 0 && !reduce && (
                  <motion.span key={burst} aria-hidden="true" className="pointer-events-none absolute inset-0">
                    {Array.from({ length: 10 }, (_, i) => {
                      const a = (i / 10) * Math.PI * 2;
                      return (
                        <motion.span
                          key={i}
                          className="absolute left-1/2 top-1/2 size-1.5 rounded-full bg-[color:var(--bjork-accent)]"
                          initial={{ x: "-50%", y: "-50%", opacity: 1, scale: 1 }}
                          animate={{ x: `calc(-50% + ${Math.cos(a) * 30}px)`, y: `calc(-50% + ${Math.sin(a) * 30}px)`, opacity: 0, scale: 0.4 }}
                          transition={{ duration: 0.7, ease: ease.out }}
                        />
                      );
                    })}
                    <motion.span
                      className="absolute inset-0 rounded-full border-2 border-[color:var(--bjork-accent)]"
                      initial={{ scale: 0.6, opacity: 0.8 }}
                      animate={{ scale: 2.2, opacity: 0 }}
                      transition={{ duration: 0.6, ease: ease.out }}
                    />
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
            <p className="flex items-baseline gap-1.5">
              <span className="relative inline-flex h-10 overflow-hidden text-[36px] font-semibold leading-10 tracking-[-0.03em]">
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.span
                    key={streak}
                    initial={reduce ? { opacity: 0 } : { y: "100%", opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={reduce ? { opacity: 0 } : { y: "-100%", opacity: 0 }}
                    transition={{ duration: 0.36, ease: ease.out }}
                  >
                    {streak}
                  </motion.span>
                </AnimatePresence>
              </span>
              <span className="text-[14px] text-[color:var(--bjork-text-medium)]">{streak === 1 ? "day" : "days"}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 pt-0.5">
          <span className="text-[12px] leading-4 text-[color:var(--bjork-text-muted)]">
            Best <span className="text-[color:var(--bjork-text)]">{bestShown}</span>
          </span>
          <Pill tone="neutral">
            <Snowflake aria-hidden="true" className="size-3" />
            {freezesLeft} {freezesLeft === 1 ? "freeze" : "freezes"}
          </Pill>
        </div>
      </div>

      {/* This week */}
      <ol className="mt-4 grid grid-cols-7 gap-1.5 px-5" aria-label="This week">
        {week.map((k) => {
          const isToday = k === today;
          const future = fromKey(k) > t0;
          const done = active.has(k);
          const froze = frozenSet.has(k);
          const word = future ? "upcoming" : done ? "done" : froze ? "freeze used" : isToday ? "not yet" : "missed";
          return (
            <li key={k} className="flex flex-col items-center gap-1.5">
              <span className={cn("text-[11px] leading-4", isToday ? "font-semibold text-[color:var(--bjork-text)]" : "text-[color:var(--bjork-text-muted)]")}>
                {fmtDay.format(fromKey(k))}
              </span>
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-full border transition-[background-color,border-color,color] duration-300 motion-reduce:transition-none",
                  done
                    ? "border-transparent bg-[color:var(--bjork-accent-fill)] text-[color:var(--bjork-accent-foreground)]"
                    : froze
                      ? "border-transparent bg-[color:var(--bjork-hair)] text-[color:var(--bjork-text-medium)]"
                      : isToday
                        ? "border-dashed border-[color:var(--bjork-accent)] text-[color:var(--bjork-accent-ink)]"
                        : future
                          ? "border-[color:var(--bjork-border)]"
                          : "border-[color:var(--bjork-border)] text-[color:var(--bjork-text-faint)]",
                )}
              >
                {done ? (
                  <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
                ) : froze ? (
                  <Snowflake aria-hidden="true" className="size-3.5" />
                ) : !future && !isToday ? (
                  <span aria-hidden="true" className="h-px w-2.5 bg-current" />
                ) : null}
                <span className="sr-only">
                  {fmtLong.format(fromKey(k))}, {word}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      {/* Heatmap */}
      <div className="px-5 pt-5">
        <div
          role="grid"
          aria-label={`Last ${weeks} weeks`}
          aria-describedby={readoutId}
          onKeyDown={onGridKey}
          className="grid gap-[3px]"
          style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}
          onPointerLeave={() => setHover(null)}
        >
          {grid.map((row, r) => (
            <div role="row" key={r} className="contents">
              {row.map((k, c) => {
                const future = fromKey(k) > t0;
                const isFocus = focus[0] === r && focus[1] === c;
                return (
                  <span
                    key={k}
                    role="gridcell"
                    ref={(el) => {
                      if (el) cellRefs.current.set(k, el);
                      else cellRefs.current.delete(k);
                    }}
                    tabIndex={isFocus ? 0 : -1}
                    aria-label={describe(k)}
                    aria-selected={isFocus}
                    onFocus={() => setFocus([r, c])}
                    onPointerEnter={() => setHover(k)}
                    className={cn(
                      "aspect-square rounded-[3px] transition-colors duration-300",
                      future && "opacity-30",
                      k === today && "ring-1 ring-[color:var(--bjork-text-soft)] ring-offset-1 ring-offset-[color:var(--bjork-card)]",
                      focusRing,
                      "focus-visible:ring-offset-1",
                    )}
                    style={{
                      background: frozenSet.has(k)
                        ? "repeating-linear-gradient(135deg, var(--bjork-text-soft) 0 1.5px, var(--bjork-track) 1.5px 4px)"
                        : fill[future ? 0 : level(k)],
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-[11px] leading-4 text-[color:var(--bjork-text-muted)]">
          <span id={readoutId} aria-live="off" className="truncate">
            {describe(readKey)}
          </span>
          <span aria-hidden="true" className="flex shrink-0 items-center gap-1">
            Less
            {fill.map((f, i) => (
              <span key={i} className="size-2 rounded-[2px]" style={{ background: f }} />
            ))}
            More
          </span>
        </div>
      </div>

      {/* Milestone + check-in */}
      <div className="mt-4 flex items-center gap-4 border-t border-[color:var(--bjork-border)] bg-[color:var(--bjork-card-raised)] px-5 py-3.5">
        <div className="min-w-0 flex-1">
          {next ? (
            <>
              <p className="text-[12px] leading-4">
                <span className="text-[color:var(--bjork-text)]">{next - streak}</span>
                <span className="text-[color:var(--bjork-text-muted)]"> {next - streak === 1 ? "day" : "days"} to the {next}-day badge</span>
              </p>
              <div
                role="progressbar"
                aria-label={`Progress to the ${next}-day badge`}
                aria-valuemin={prevMilestone}
                aria-valuemax={next}
                aria-valuenow={streak}
                className="mt-2 h-1 overflow-hidden rounded-full bg-[color:var(--bjork-track)]"
              >
                <span
                  className="block h-full rounded-full bg-[color:var(--bjork-accent)] transition-[width] duration-500 motion-reduce:transition-none"
                  style={{ width: `${((streak - prevMilestone) / (next - prevMilestone)) * 100}%` }}
                />
              </div>
            </>
          ) : (
            <p className="text-[12px] text-[color:var(--bjork-text-medium)]">Every badge earned.</p>
          )}
        </div>
        <CardButton
          variant={doneToday ? "secondary" : "primary"}
          onClick={checkIn}
          disabled={doneToday}
          icon={doneToday ? <Check aria-hidden="true" className="size-3.5" /> : undefined}
        >
          {doneToday ? "Done today" : "Check in"}
        </CardButton>
      </div>
      <LiveRegion message={message} />
    </CardFrame>
  );
}
