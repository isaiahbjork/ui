"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useElementSize } from "../_core/canvas";
import {
  type BjorkTableThemeMode,
  getBjorkSignalPalette,
  getBjorkTablePalette,
  useBjorkTableIsDark,
} from "./table-theme";

export type LeaderboardPeriod = "week" | "month" | "all";

export interface LeaderboardEntry {
  id: string;
  handle: string;
  /** Team, crew or region shown under the handle. */
  team: string;
  score: number;
  /** Rank at the end of the previous period. `null` marks a new entrant. */
  previousRank: number | null;
  /** Win rate between 0 and 1. */
  winRate: number;
  /** Positive for a win streak, negative for a losing streak. */
  streak: number;
}

export interface LeaderboardTableProps {
  /** Entries for every period. Used when `entries` is not passed. */
  entriesByPeriod?: Partial<Record<LeaderboardPeriod, LeaderboardEntry[]>>;
  /** Entries for the active period when you fetch them yourself in `onPeriodChange`. */
  entries?: LeaderboardEntry[];
  currentUserId?: string;
  defaultPeriod?: LeaderboardPeriod;
  /** Controlled period. */
  period?: LeaderboardPeriod;
  onPeriodChange?: (period: LeaderboardPeriod) => void;
  title?: string;
  scoreLabel?: string;
  /** Height of the scrolling list. The current user's row pins to its bottom edge. */
  maxHeight?: number;
  loading?: boolean;
  className?: string;
  theme?: BjorkTableThemeMode;
  enableAnimations?: boolean;
}

const PERIODS: { value: LeaderboardPeriod; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "all", label: "All time" },
];

type Seed = [id: string, handle: string, team: string];

const PLAYERS: Seed[] = [
  ["p01", "quietfox", "Harbor · EU West"],
  ["p02", "lune.ash", "Kestrel · NA East"],
  ["p03", "t.varga", "Ninefold · EU Central"],
  ["p04", "okapi_runs", "Harbor · Africa"],
  ["p05", "brindle", "Saltmarsh · NA West"],
  ["p06", "r.ilunga", "Kestrel · Africa"],
  ["p07", "kestrel9", "Kestrel · APAC"],
  ["p08", "nori.k", "Ninefold · APAC"],
  ["p09", "halcyon_d", "Saltmarsh · EU West"],
  ["p10", "pebbleworks", "Harbor · NA East"],
  ["p11", "s.amadi", "Ninefold · Africa"],
  ["p12", "fernwhistle", "Saltmarsh · APAC"],
  ["p13", "ivo.petrak", "Kestrel · EU Central"],
  ["p14", "driftwood", "Harbor · NA West"],
  ["p15", "moth_lantern", "Ninefold · NA East"],
  ["p16", "c.oyelaran", "Saltmarsh · Africa"],
];

function build(
  rows: [id: string, score: number, previousRank: number | null, winRate: number, streak: number][]
): LeaderboardEntry[] {
  return rows.map(([id, score, previousRank, winRate, streak]) => {
    const seed = PLAYERS.find((player) => player[0] === id)!;
    return { id, handle: seed[1], team: seed[2], score, previousRank, winRate, streak };
  });
}

export const LEADERBOARD_TABLE_SAMPLE: Record<LeaderboardPeriod, LeaderboardEntry[]> = {
  week: build([
    ["p02", 4_812, 4, 0.81, 7],
    ["p01", 4_655, 1, 0.77, 3],
    ["p07", 4_390, 2, 0.74, -1],
    ["p05", 4_204, 9, 0.71, 5],
    ["p03", 4_118, 3, 0.69, 2],
    ["p09", 3_960, null, 0.72, 4],
    ["p06", 3_874, 5, 0.66, -2],
    ["p12", 3_702, 8, 0.64, 1],
    ["p08", 3_655, 6, 0.63, -1],
    ["p04", 3_511, 7, 0.6, 2],
    ["p11", 3_390, 13, 0.61, 3],
    ["p10", 3_247, 10, 0.58, -3],
    ["p15", 3_110, 12, 0.57, 1],
    ["p14", 2_986, 17, 0.55, 2],
    ["p13", 2_874, 11, 0.52, -1],
    ["p16", 2_701, 14, 0.5, -2],
  ]),
  month: build([
    ["p01", 18_420, 1, 0.76, 3],
    ["p07", 17_865, 3, 0.73, -1],
    ["p02", 17_310, 2, 0.78, 7],
    ["p03", 16_902, 6, 0.7, 2],
    ["p06", 15_744, 4, 0.67, -2],
    ["p05", 15_120, 5, 0.69, 5],
    ["p08", 14_655, 7, 0.64, -1],
    ["p04", 14_212, 12, 0.62, 2],
    ["p12", 13_870, 8, 0.63, 1],
    ["p10", 13_402, 9, 0.59, -3],
    ["p13", 12_955, 10, 0.56, -1],
    ["p09", 12_611, 15, 0.7, 4],
    ["p11", 12_240, 11, 0.6, 3],
    ["p15", 11_906, 16, 0.57, 1],
    ["p14", 11_480, 14, 0.55, 2],
    ["p16", 10_932, 13, 0.51, -2],
  ]),
  all: build([
    ["p07", 212_480, 1, 0.71, -1],
    ["p01", 208_115, 2, 0.74, 3],
    ["p03", 196_702, 3, 0.68, 2],
    ["p02", 188_940, 5, 0.75, 7],
    ["p06", 181_366, 4, 0.66, -2],
    ["p08", 176_020, 6, 0.63, -1],
    ["p10", 169_455, 7, 0.6, -3],
    ["p13", 163_810, 8, 0.57, -1],
    ["p04", 158_200, 10, 0.61, 2],
    ["p05", 154_675, 9, 0.66, 5],
    ["p12", 149_930, 11, 0.62, 1],
    ["p16", 141_208, 12, 0.53, -2],
    ["p11", 137_644, 14, 0.59, 3],
    ["p15", 131_290, 13, 0.56, 1],
    ["p14", 126_875, 15, 0.54, 2],
    ["p09", 98_412, null, 0.69, 4],
  ]),
};

const subscribeNoop = () => () => {};

// False during SSR and hydration, true afterwards.
function useMounted() {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

function initials(handle: string) {
  const parts = handle.split(/[._\-\d]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return handle.slice(0, 2).toUpperCase();
}

const numberFormat = new Intl.NumberFormat("en-US");

export function LeaderboardTable({
  entriesByPeriod = LEADERBOARD_TABLE_SAMPLE,
  entries: entriesOverride,
  currentUserId = "p14",
  defaultPeriod = "month",
  period: controlledPeriod,
  onPeriodChange,
  title = "Season 4 ladder",
  scoreLabel = "Points",
  maxHeight = 520,
  loading = false,
  className,
  theme = "auto",
  enableAnimations = true,
}: LeaderboardTableProps) {
  const mounted = useMounted();
  const { resolvedTheme } = useTheme();
  const forcedTheme = theme === "auto" ? undefined : theme;
  const detectedIsDark = useBjorkTableIsDark(resolvedTheme, forcedTheme);
  const isDark = !mounted && theme === "auto" ? true : detectedIsDark;
  const palette = getBjorkTablePalette(isDark);
  const shouldReduceMotion = useReducedMotion();
  const shouldAnimate = enableAnimations && !shouldReduceMotion;

  const [uncontrolledPeriod, setUncontrolledPeriod] = useState<LeaderboardPeriod>(defaultPeriod);
  const period = controlledPeriod ?? uncontrolledPeriod;
  const [instant, setInstant] = useState(false);
  const [hasMountedRows, setHasMountedRows] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userRowRef = useRef<HTMLTableRowElement>(null);
  const [userPinned, setUserPinned] = useState(false);
  const { width: rootWidth } = useElementSize(rootRef);
  const layout = rootWidth > 0 && rootWidth < 560 ? "narrow" : "wide";
  const uid = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const ranked = useMemo(() => {
    const source = entriesOverride ?? entriesByPeriod[period] ?? [];
    return [...source]
      .sort((a, b) => b.score - a.score)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  }, [entriesOverride, entriesByPeriod, period]);

  const leaderScore = ranked[0]?.score ?? 0;
  const hasUser = ranked.some((entry) => entry.id === currentUserId);

  useEffect(() => {
    const timer = window.setTimeout(() => setHasMountedRows(true), 900);
    return () => window.clearTimeout(timer);
  }, []);

  // A sticky row is "pinned" while it sits clipped against the bottom edge.
  useEffect(() => {
    const row = userRowRef.current;
    const root = scrollRef.current;
    if (!row || !root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const rootTop = entry.rootBounds?.top ?? 0;
        setUserPinned(entry.intersectionRatio < 1 && entry.boundingClientRect.top > rootTop);
      },
      { root, rootMargin: "0px 0px -1px 0px", threshold: [0, 1] }
    );
    observer.observe(row);
    return () => observer.disconnect();
  }, [hasUser, period, ranked.length, loading]);

  const selectPeriod = (next: LeaderboardPeriod, fromKeyboard: boolean) => {
    setInstant(fromKeyboard);
    if (controlledPeriod === undefined) setUncontrolledPeriod(next);
    onPeriodChange?.(next);
  };

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % PERIODS.length;
    if (event.key === "ArrowLeft") next = (index - 1 + PERIODS.length) % PERIODS.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = PERIODS.length - 1;
    if (next < 0) return;
    event.preventDefault();
    selectPeriod(PERIODS[next].value, true);
    tabRefs.current[next]?.focus();
  };

  const strongText = isDark ? "text-[#ededed]" : "text-[#171717]";
  const surface = isDark ? "bg-[#111]" : "bg-[#fffcf6]";
  const headerSurface = isDark ? "bg-[#181818]" : "bg-[#fbf7ef]";
  const podiumSurface = isDark ? "bg-[#151515]" : "bg-[#fcf8f1]";
  const userSurface = isDark ? "bg-[#1a1512]" : "bg-[#fbf1e8]";
  const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[#ec5c13]/50";
  const headerLabel = "text-[11px] font-medium uppercase tracking-[0.08em]";
  const green = getBjorkSignalPalette("green", isDark);
  const red = getBjorkSignalPalette("red", isDark);
  const orange = getBjorkSignalPalette("orange", isDark);
  const neutral = getBjorkSignalPalette("neutral", isDark);
  const wide = layout === "wide";
  const animateLayout = shouldAnimate && !instant;
  const periodLabel = PERIODS.find((p) => p.value === period)?.label ?? "";

  const renderChange = (entry: (typeof ranked)[number]) => {
    if (entry.previousRank === null) {
      return (
        <span className={cn("inline-flex rounded-[6px] border px-1.5 py-[1px] text-[10.5px] font-medium", orange.bgColor, orange.borderColor, orange.textColor)}>
          New<span className="sr-only"> entrant</span>
        </span>
      );
    }
    const delta = entry.previousRank - entry.rank;
    if (delta === 0) {
      return (
        <span className={cn("text-[12px]", neutral.textColor)}>
          <span aria-hidden="true">—</span>
          <span className="sr-only">No change</span>
        </span>
      );
    }
    const up = delta > 0;
    const tone = up ? green : red;
    return (
      <span className={cn("inline-flex items-center gap-0.5 text-[12px] font-medium tabular-nums", tone.textColor)}>
        <span aria-hidden="true" className="text-[9px]">{up ? "▲" : "▼"}</span>
        <span aria-hidden="true">{Math.abs(delta)}</span>
        <span className="sr-only">
          {up ? "Up" : "Down"} {Math.abs(delta)} {Math.abs(delta) === 1 ? "place" : "places"}
        </span>
      </span>
    );
  };

  const renderRank = (rank: number, isUser: boolean) => {
    if (rank <= 3) {
      return (
        <span
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-full border text-[12px] font-semibold tabular-nums",
            rank === 1
              ? cn(palette.accentBg, palette.accentBorder, palette.accent)
              : isDark
                ? "border-[#2c2c2c] bg-[#1d1d1d] text-[#ededed]/80"
                : "border-[#e6dccb] bg-[#f5eee2] text-[#171717]/75"
          )}
        >
          {rank}
        </span>
      );
    }
    return (
      <span className={cn("inline-flex w-6 justify-center text-[13px] tabular-nums", isUser ? palette.accent : palette.secondaryText)}>
        {rank}
      </span>
    );
  };

  const cellBase = cn("border-b px-3", palette.divider);

  return (
    <div ref={rootRef} className={cn("mx-auto w-full max-w-[880px]", className)}>
      <div className={cn("relative overflow-hidden rounded-[18px] border", palette.container)}>
        <div className={cn("flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3", palette.divider)}>
          <div className="min-w-0">
            <p className={cn("text-[13px] font-medium", palette.primaryText)}>{title}</p>
            <p className={cn("text-[12px] tabular-nums", palette.secondaryText)}>
              {ranked.length} players · {periodLabel.toLowerCase()}
            </p>
          </div>
          <div
            role="tablist"
            aria-label="Leaderboard period"
            className={cn("inline-flex rounded-[10px] border p-0.5", palette.divider, palette.mutedSurface)}
          >
            {PERIODS.map((option, index) => {
              const selected = option.value === period;
              return (
                <button
                  key={option.value}
                  ref={(node) => {
                    tabRefs.current[index] = node;
                  }}
                  type="button"
                  role="tab"
                  id={`${uid}-tab-${option.value}`}
                  aria-selected={selected}
                  aria-controls={`${uid}-panel`}
                  tabIndex={selected ? 0 : -1}
                  onClick={(event) => selectPeriod(option.value, event.detail === 0)}
                  onKeyDown={(event) => onTabKey(event, index)}
                  className={cn(
                    "relative rounded-[8px] px-3 py-1 text-[12.5px] font-medium transition-colors",
                    focusRing,
                    selected ? strongText : palette.secondaryText
                  )}
                >
                  {selected && (
                    <motion.span
                      layoutId={animateLayout ? `${uid}-period-pill` : undefined}
                      transition={{ type: "spring", stiffness: 520, damping: 40 }}
                      aria-hidden="true"
                      className={cn(
                        "absolute inset-0 rounded-[8px] border",
                        isDark ? "border-[#2a2a2a] bg-[#202020]" : "border-[#eadfce] bg-[#fffcf6] shadow-[var(--bjork-shadow-soft)]"
                      )}
                    />
                  )}
                  <span className="relative">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          ref={scrollRef}
          id={`${uid}-panel`}
          role="tabpanel"
          aria-labelledby={`${uid}-tab-${period}`}
          tabIndex={0}
          className={cn("relative overflow-auto overscroll-contain", focusRing, "focus-visible:ring-inset")}
          style={{ maxHeight }}
        >
          <table className="w-full table-fixed border-separate border-spacing-0">
            <caption className="sr-only">
              {title}, {periodLabel} rankings{hasUser ? ". Your row stays pinned to the bottom while scrolled away." : ""}
            </caption>
            <colgroup>
              <col style={{ width: wide ? 64 : 44 }} />
              <col style={{ width: wide ? 72 : 52 }} />
              <col />
              <col style={{ width: wide ? 200 : 84 }} />
              {wide && <col style={{ width: 92 }} />}
              {wide && <col style={{ width: 84 }} />}
            </colgroup>
            <thead>
              <tr className={palette.header}>
                {[
                  { label: "Rank", align: "text-center" },
                  { label: wide ? "Change" : "+/−", align: "text-left", sr: "Rank change" },
                  { label: "Player", align: "text-left" },
                  { label: scoreLabel, align: "text-right" },
                  ...(wide
                    ? [
                        { label: "Win rate", align: "text-right" },
                        { label: "Streak", align: "text-right" },
                      ]
                    : []),
                ].map((column) => (
                  <th
                    key={column.label}
                    scope="col"
                    className={cn(
                      "sticky top-0 z-20 border-b px-3 py-2.5",
                      headerSurface,
                      palette.divider,
                      headerLabel,
                      column.align
                    )}
                  >
                    {column.sr ? (
                      <>
                        <span aria-hidden="true">{column.label}</span>
                        <span className="sr-only">{column.sr}</span>
                      </>
                    ) : (
                      column.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <LayoutGroup id={uid}>
              <tbody aria-busy={loading || undefined}>
                {loading
                  ? Array.from({ length: 8 }, (_, row) => (
                      <tr key={row}>
                        <td className={cn(cellBase, "py-3")}>
                          <span className={cn("mx-auto block size-6 animate-pulse rounded-full motion-reduce:animate-none", palette.mutedSurface)} />
                        </td>
                        <td className={cn(cellBase, "py-3")}>
                          <span className={cn("block h-2.5 w-6 animate-pulse rounded-full motion-reduce:animate-none", palette.mutedSurface)} />
                        </td>
                        <td className={cn(cellBase, "py-3")}>
                          <span className="flex items-center gap-2.5">
                            <span className={cn("size-8 shrink-0 animate-pulse rounded-full motion-reduce:animate-none", palette.mutedSurface)} />
                            <span className={cn("block h-2.5 animate-pulse rounded-full motion-reduce:animate-none", palette.mutedSurface)} style={{ width: `${40 + ((row * 23) % 40)}%` }} />
                          </span>
                        </td>
                        <td className={cn(cellBase, "py-3")}>
                          <span className={cn("ml-auto block h-2.5 w-16 animate-pulse rounded-full motion-reduce:animate-none", palette.mutedSurface)} />
                        </td>
                        {wide && (
                          <>
                            <td className={cn(cellBase, "py-3")}>
                              <span className={cn("ml-auto block h-2.5 w-9 animate-pulse rounded-full motion-reduce:animate-none", palette.mutedSurface)} />
                            </td>
                            <td className={cn(cellBase, "py-3")}>
                              <span className={cn("ml-auto block h-2.5 w-7 animate-pulse rounded-full motion-reduce:animate-none", palette.mutedSurface)} />
                            </td>
                          </>
                        )}
                      </tr>
                    ))
                  : ranked.map((entry, index) => {
                      const isUser = entry.id === currentUserId;
                      const podium = entry.rank <= 3;
                      const share = leaderScore > 0 ? entry.score / leaderScore : 0;
                      const rowSurface = isUser ? userSurface : podium ? podiumSurface : surface;
                      const stickyCell = isUser
                        ? cn(
                            "sticky bottom-0 z-10",
                            "before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-5 before:bg-gradient-to-t before:to-transparent before:transition-opacity before:duration-200",
                            isDark ? "before:from-[rgba(0,0,0,0.45)]" : "before:from-[rgba(66,52,33,0.09)]",
                            userPinned
                              ? cn("before:opacity-100", isDark ? "border-t border-t-[#2e241e]" : "border-t border-t-[#eadbc9]")
                              : "before:opacity-0"
                          )
                        : "";
                      const td = cn(cellBase, "py-2.5", rowSurface, stickyCell);
                      return (
                        <motion.tr
                          key={entry.id}
                          ref={isUser ? userRowRef : undefined}
                          layout={animateLayout ? "position" : false}
                          initial={shouldAnimate && !hasMountedRows ? { opacity: 0, y: 8 } : false}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            layout: { type: "spring", stiffness: 380, damping: 36, mass: 0.8 },
                            opacity: { duration: 0.24, delay: hasMountedRows ? 0 : index * 0.03 },
                            y: { type: "spring", stiffness: 420, damping: 32, delay: hasMountedRows ? 0 : index * 0.03 },
                          }}
                          aria-current={isUser ? "true" : undefined}
                          className="group/row"
                        >
                          <td className={cn(td, !isUser && "relative", "text-center")}>
                            {isUser && (
                              <span aria-hidden="true" className={cn("absolute inset-y-1.5 left-0 w-[3px] rounded-r-full", isDark ? "bg-[#d86a2c]" : "bg-[#bd4514]")} />
                            )}
                            {renderRank(entry.rank, isUser)}
                          </td>
                          <td className={td}>{renderChange(entry)}</td>
                          <th scope="row" className={cn(td, "text-left font-normal")}>
                            <span className="flex min-w-0 items-center gap-2.5">
                              <span
                                aria-hidden="true"
                                className={cn(
                                  "inline-flex size-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tracking-tight",
                                  isUser
                                    ? cn(palette.accentBg, palette.accentBorder, palette.accent)
                                    : isDark
                                      ? "border-[#2a2a2a] bg-[#1b1b1b] text-[#ededed]/62"
                                      : "border-[#eadfce] bg-[#f8f2e7] text-[#171717]/60"
                                )}
                              >
                                {initials(entry.handle)}
                              </span>
                              <span className="min-w-0">
                                <span className="flex min-w-0 items-center gap-1.5">
                                  <span className={cn("truncate text-[13px] font-medium", strongText, !isUser && "opacity-90")}>
                                    {entry.handle}
                                  </span>
                                  {isUser && (
                                    <span className={cn("shrink-0 rounded-[5px] px-1 py-[1px] text-[10px] font-medium uppercase tracking-[0.06em]", palette.accentBg, palette.accent)}>
                                      You
                                    </span>
                                  )}
                                </span>
                                <span className={cn("block truncate text-[11.5px]", palette.secondaryText)}>
                                  {entry.team}
                                </span>
                              </span>
                            </span>
                          </th>
                          <td className={cn(td, "text-right")}>
                            <span className="flex items-center justify-end gap-3">
                              {wide && (
                                <span
                                  aria-hidden="true"
                                  className={cn("relative h-1 w-[72px] shrink-0 overflow-hidden rounded-full", isDark ? "bg-[#ededed]/8" : "bg-[#171717]/8")}
                                >
                                  <motion.span
                                    className={cn(
                                      "absolute inset-y-0 left-0 origin-left rounded-full",
                                      entry.rank === 1 || isUser
                                        ? isDark
                                          ? "bg-[#d86a2c]"
                                          : "bg-[#bd4514]"
                                        : isDark
                                          ? "bg-[#ededed]/38"
                                          : "bg-[#171717]/34"
                                    )}
                                    style={{ width: "100%" }}
                                    initial={false}
                                    animate={{ scaleX: share }}
                                    transition={animateLayout ? { type: "spring", stiffness: 260, damping: 32 } : { duration: 0 }}
                                  />
                                </span>
                              )}
                              <span className={cn("text-[13px] font-medium tabular-nums", strongText)}>
                                {numberFormat.format(entry.score)}
                              </span>
                            </span>
                            {wide && <span className="sr-only">, {Math.round(share * 100)}% of the leader</span>}
                            {!wide && (
                              <span className={cn("block text-[11.5px] tabular-nums", palette.secondaryText)}>
                                {Math.round(entry.winRate * 100)}% wins
                              </span>
                            )}
                          </td>
                          {wide && (
                            <>
                              <td className={cn(td, "text-right text-[13px] tabular-nums", palette.primaryText)}>
                                {(entry.winRate * 100).toFixed(1)}%
                              </td>
                              <td className={cn(td, "text-right")}>
                                <span
                                  className={cn(
                                    "text-[12.5px] font-medium tabular-nums",
                                    entry.streak >= 3 ? green.textColor : entry.streak < 0 ? red.textColor : palette.primaryText
                                  )}
                                >
                                  <span aria-hidden="true">{entry.streak >= 0 ? "W" : "L"}{Math.abs(entry.streak)}</span>
                                  <span className="sr-only">
                                    {Math.abs(entry.streak)} {entry.streak >= 0 ? "win" : "loss"} streak
                                  </span>
                                </span>
                              </td>
                            </>
                          )}
                        </motion.tr>
                      );
                    })}
              </tbody>
            </LayoutGroup>
          </table>
          {!loading && ranked.length === 0 && (
            <div className="flex flex-col items-center gap-1 px-6 py-14 text-center">
              <p className={cn("text-[14px] font-medium", palette.primaryText)}>No rankings yet</p>
              <p className={cn("text-[13px]", palette.secondaryText)}>Scores for this period appear after the first match.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
