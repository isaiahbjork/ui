"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTheme } from "next-themes";
import { CalendarX2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { useElementSize } from "../_core/canvas";
import {
  type BjorkTableThemeMode,
  getBjorkSignalPalette,
  getBjorkTablePalette,
  useBjorkTableIsDark,
} from "./table-theme";

export type TimetableTone = "orange" | "green" | "red" | "neutral";

export interface TimetableDay {
  /** Matches `TimetableEvent.day`. */
  id: string;
  /** Short label for the column header, e.g. "Wed". */
  label: string;
  /** Long label for screen readers, e.g. "Wednesday". */
  fullLabel?: string;
  /** Secondary line, e.g. "Oct 14". */
  date?: string;
  /** JS weekday (0 = Sunday). Used to place the "now" line. */
  weekday?: number;
}

export interface TimetableEvent {
  id: string;
  title: string;
  /** A `TimetableDay.id`. */
  day: string;
  /** 24h "HH:MM". */
  start: string;
  /** 24h "HH:MM". */
  end: string;
  location?: string;
  track?: string;
  /** Overrides the tone picked for the event's track. */
  tone?: TimetableTone;
}

export interface TimetableProps {
  events?: TimetableEvent[];
  days?: TimetableDay[];
  startHour?: number;
  endHour?: number;
  slotMinutes?: number;
  /** Pixel height of one slot in the week grid. */
  slotHeight?: number;
  /** Fixed clock for the "now" line. Omit to follow the real clock. */
  now?: Date;
  title?: string;
  subtitle?: string;
  /** Short label shown in the time gutter corner, e.g. "CET". */
  timeZoneLabel?: string;
  /** Max height of the scrolling week grid. */
  maxHeight?: number;
  /** Selected track filter on first render (null = all tracks). */
  defaultTrack?: string | null;
  /** Event selected on first render. */
  defaultSelectedId?: string | null;
  loading?: boolean;
  onEventSelect?: (event: TimetableEvent) => void;
  theme?: BjorkTableThemeMode;
  enableAnimations?: boolean;
  className?: string;
}

export const TIMETABLE_SAMPLE_DAYS: TimetableDay[] = [
  { id: "mon", label: "Mon", fullLabel: "Monday", date: "Oct 12", weekday: 1 },
  { id: "tue", label: "Tue", fullLabel: "Tuesday", date: "Oct 13", weekday: 2 },
  { id: "wed", label: "Wed", fullLabel: "Wednesday", date: "Oct 14", weekday: 3 },
  { id: "thu", label: "Thu", fullLabel: "Thursday", date: "Oct 15", weekday: 4 },
  { id: "fri", label: "Fri", fullLabel: "Friday", date: "Oct 16", weekday: 5 },
];

export const TIMETABLE_SAMPLE: TimetableEvent[] = [
  // Monday
  { id: "m1", title: "Doors & coffee", day: "mon", start: "09:00", end: "09:30", location: "Atrium", track: "Plenary" },
  { id: "m2", title: "Opening keynote: Drawing with constraints", day: "mon", start: "09:30", end: "10:30", location: "Hall A", track: "Plenary" },
  { id: "m3", title: "Variable type in product UI", day: "mon", start: "11:00", end: "12:00", location: "Hall A", track: "Craft" },
  { id: "m4", title: "Token pipelines that survive rebrands", day: "mon", start: "11:00", end: "12:30", location: "Studio 3", track: "Systems" },
  { id: "m5", title: "Lunch", day: "mon", start: "12:30", end: "13:30", location: "Garden Room" },
  { id: "m6", title: "Field notes from 40 usability sessions", day: "mon", start: "14:00", end: "15:00", location: "Hall B", track: "Research" },
  { id: "m7", title: "Spring physics, explained by hand", day: "mon", start: "15:30", end: "17:00", location: "Studio 3", track: "Craft" },
  // Tuesday
  { id: "t1", title: "Grids for long documents", day: "tue", start: "09:30", end: "10:30", location: "Hall A", track: "Craft" },
  { id: "t2", title: "Workshop: Interface sound", day: "tue", start: "10:00", end: "12:00", location: "Studio 3", track: "Craft" },
  { id: "t3", title: "Diary studies on a budget", day: "tue", start: "10:30", end: "11:30", location: "Hall B", track: "Research" },
  { id: "t4", title: "Lunch", day: "tue", start: "12:30", end: "13:30", location: "Garden Room" },
  { id: "t5", title: "Naming components with a team of 60", day: "tue", start: "13:30", end: "14:30", location: "Hall A", track: "Systems" },
  { id: "t6", title: "Panel: Who owns the design system?", day: "tue", start: "15:00", end: "16:30", location: "Hall A", track: "Plenary" },
  // Wednesday
  { id: "w1", title: "Kerning at small sizes", day: "wed", start: "09:00", end: "10:00", location: "Hall A", track: "Craft" },
  { id: "w2", title: "Interviewing without leading", day: "wed", start: "10:00", end: "11:00", location: "Hall B", track: "Research" },
  { id: "w3", title: "Workshop: Layout motion", day: "wed", start: "10:30", end: "12:30", location: "Studio 3", track: "Craft" },
  { id: "w4", title: "Dark mode is a palette, not a filter", day: "wed", start: "11:00", end: "12:00", location: "Hall A", track: "Systems" },
  { id: "w5", title: "Lunch", day: "wed", start: "12:30", end: "13:30", location: "Garden Room" },
  { id: "w6", title: "Portfolio reviews", day: "wed", start: "14:00", end: "16:00", location: "Garden Room", track: "Research" },
  { id: "w7", title: "Easing curves for data viz", day: "wed", start: "16:00", end: "17:00", location: "Studio 3", track: "Craft" },
  // Thursday
  { id: "h1", title: "Accessible tables, row by row", day: "thu", start: "09:30", end: "10:30", location: "Hall A", track: "Systems" },
  { id: "h2", title: "Type specimens as research tools", day: "thu", start: "11:00", end: "12:00", location: "Hall B", track: "Craft" },
  { id: "h3", title: "Lunch", day: "thu", start: "12:30", end: "13:30", location: "Garden Room" },
  { id: "h4", title: "Synthesis wall, live", day: "thu", start: "13:30", end: "15:00", location: "Studio 3", track: "Research" },
  { id: "h5", title: "Choreographing page transitions", day: "thu", start: "15:30", end: "16:30", location: "Hall A", track: "Craft" },
  // Friday
  { id: "f1", title: "Hand-lettering for screens", day: "fri", start: "09:30", end: "11:00", location: "Studio 3", track: "Craft" },
  { id: "f2", title: "Versioning a component library", day: "fri", start: "10:00", end: "11:00", location: "Hall A", track: "Systems" },
  { id: "f3", title: "Lightning talks", day: "fri", start: "11:30", end: "12:30", location: "Hall A", track: "Plenary" },
  { id: "f4", title: "Closing keynote: Slow software", day: "fri", start: "14:00", end: "15:00", location: "Hall A", track: "Plenary" },
  { id: "f5", title: "Farewell drinks", day: "fri", start: "16:00", end: "17:30", location: "Atrium" },
];

const TRACK_TONES: TimetableTone[] = ["orange", "green", "neutral", "red"];
const GUTTER = 60;
const MIN_DAY_WIDTH = 168;
const COMPACT_BREAKPOINT = 560;

function toMinutes(value: string) {
  const [h, m] = value.split(":").map((part) => Number(part));
  return (h || 0) * 60 + (m || 0);
}

function formatMinutes(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

interface PlacedEvent {
  event: TimetableEvent;
  startMin: number;
  endMin: number;
  col: number;
  cols: number;
}

/** Groups transitively overlapping events and gives each its own lane. */
function layoutDay(events: TimetableEvent[]): PlacedEvent[] {
  const sorted = events
    .map((event) => ({ event, startMin: toMinutes(event.start), endMin: toMinutes(event.end), col: 0, cols: 1 }))
    .filter((item) => item.endMin > item.startMin)
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  const placed: PlacedEvent[] = [];
  let cluster: PlacedEvent[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    for (const item of cluster) item.cols = laneEnds.length;
    placed.push(...cluster);
    cluster = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    if (item.startMin >= clusterEnd && cluster.length) flush();
    let lane = laneEnds.findIndex((end) => end <= item.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.endMin);
    } else {
      laneEnds[lane] = item.endMin;
    }
    item.col = lane;
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  if (cluster.length) flush();
  return placed;
}

const noopSubscribe = () => () => {};

function useMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

function useClock(fixed: Date | undefined) {
  const [live, setLive] = useState<Date | null>(null);
  useEffect(() => {
    if (fixed) return;
    const tick = () => setLive(new Date());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [fixed]);
  return fixed ?? live;
}

export function Timetable({
  events = TIMETABLE_SAMPLE,
  days = TIMETABLE_SAMPLE_DAYS,
  startHour = 9,
  endHour = 18,
  slotMinutes = 30,
  slotHeight = 30,
  now: nowProp,
  title = "Fieldwork 26",
  subtitle = "Design conference · Oct 12–16 · Five rooms",
  timeZoneLabel = "CET",
  maxHeight = 430,
  defaultTrack = null,
  defaultSelectedId = null,
  loading = false,
  onEventSelect,
  theme = "auto",
  enableAnimations = true,
  className,
}: TimetableProps) {
  const mounted = useMounted();
  const { resolvedTheme } = useTheme();
  const forcedTheme = theme === "auto" ? undefined : theme;
  const detectedIsDark = useBjorkTableIsDark(resolvedTheme, forcedTheme);
  const isDark = !mounted && theme === "auto" ? true : detectedIsDark;
  const palette = getBjorkTablePalette(isDark);
  const shouldReduceMotion = useReducedMotion();
  const shouldAnimate = enableAnimations && !shouldReduceMotion;

  const rootRef = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(rootRef);
  const compact = width > 0 && width < COMPACT_BREAKPOINT;

  const now = useClock(nowProp);
  const nowMinutes = now ? now.getHours() * 60 + now.getMinutes() : null;
  const todayId = now ? days.find((day) => day.weekday === now.getDay())?.id ?? null : null;

  const [track, setTrack] = useState<string | null>(defaultTrack);
  const [selectedId, setSelectedId] = useState<string | null>(defaultSelectedId);
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const activeDay = pickedDay ?? todayId ?? days[0]?.id ?? null;

  const tracks = useMemo(() => {
    const seen: string[] = [];
    for (const event of events) if (event.track && !seen.includes(event.track)) seen.push(event.track);
    return seen;
  }, [events]);

  const toneFor = useCallback(
    (event: TimetableEvent): TimetableTone => {
      if (event.tone) return event.tone;
      if (!event.track) return "neutral";
      const index = tracks.indexOf(event.track);
      return TRACK_TONES[index % TRACK_TONES.length] ?? "neutral";
    },
    [tracks]
  );

  const visible = useMemo(
    () => (track ? events.filter((event) => event.track === track) : events),
    [events, track]
  );

  const byDay = useMemo(() => {
    const map = new Map<string, PlacedEvent[]>();
    for (const day of days) {
      map.set(
        day.id,
        layoutDay(visible.filter((event) => event.day === day.id))
      );
    }
    return map;
  }, [days, visible]);

  const rangeStart = startHour * 60;
  const rangeEnd = endHour * 60;
  const slotCount = Math.max(1, Math.ceil((rangeEnd - rangeStart) / slotMinutes));
  const bodyHeight = slotCount * slotHeight;
  const pxPerMinute = slotHeight / slotMinutes;
  const nowInRange = nowMinutes !== null && nowMinutes >= rangeStart && nowMinutes <= rangeEnd;
  const nowTop = nowMinutes !== null ? (nowMinutes - rangeStart) * pxPerMinute : 0;

  const selected = useMemo(
    () => events.find((event) => event.id === selectedId) ?? null,
    [events, selectedId]
  );

  const handleSelect = (event: TimetableEvent) => {
    setSelectedId(event.id);
    onEventSelect?.(event);
  };

  const focusEvent = (from: HTMLElement, id: string | undefined) => {
    if (!id) return;
    from
      .closest("[data-tt-root]")
      ?.querySelector<HTMLButtonElement>(`[data-event-id="${CSS.escape(id)}"]`)
      ?.focus();
  };

  const handleGridKey = (e: ReactKeyboardEvent<HTMLButtonElement>, placed: PlacedEvent) => {
    const dayIndex = days.findIndex((day) => day.id === placed.event.day);
    const list = byDay.get(placed.event.day) ?? [];
    const order = [...list].sort((a, b) => a.startMin - b.startMin || a.col - b.col);
    const index = order.findIndex((item) => item.event.id === placed.event.id);

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      focusEvent(e.currentTarget, order[index + (e.key === "ArrowDown" ? 1 : -1)]?.event.id);
      return;
    }
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const step = e.key === "ArrowRight" ? 1 : -1;
      for (let d = dayIndex + step; d >= 0 && d < days.length; d += step) {
        const candidates = byDay.get(days[d].id) ?? [];
        if (!candidates.length) continue;
        const nearest = candidates.reduce((best, item) =>
          Math.abs(item.startMin - placed.startMin) < Math.abs(best.startMin - placed.startMin) ? item : best
        );
        focusEvent(e.currentTarget, nearest.event.id);
        return;
      }
    }
  };

  const describe = (event: TimetableEvent, dayLabel?: string) => {
    const live =
      event.day === todayId &&
      nowMinutes !== null &&
      nowMinutes >= toMinutes(event.start) &&
      nowMinutes < toMinutes(event.end);
    return [
      event.title,
      `${dayLabel ? `${dayLabel} ` : ""}${event.start} to ${event.end}`,
      event.location,
      event.track ? `${event.track} track` : undefined,
      live ? "happening now" : undefined,
    ]
      .filter(Boolean)
      .join(", ");
  };

  const isBreak = (event: TimetableEvent) => !event.track && !event.tone;

  const isLive = (event: TimetableEvent) =>
    event.day === todayId &&
    nowMinutes !== null &&
    nowMinutes >= toMinutes(event.start) &&
    nowMinutes < toMinutes(event.end);

  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    for (let m = Math.ceil(rangeStart / 60) * 60; m <= rangeEnd; m += 60) marks.push(m);
    return marks;
  }, [rangeStart, rangeEnd]);

  const lineColor = isDark ? "rgba(237,237,237,0.06)" : "rgba(23,23,23,0.06)";
  const hourLineColor = isDark ? "rgba(237,237,237,0.1)" : "rgba(23,23,23,0.1)";
  const accent = isDark ? "#ec5c13" : "#bd4514";
  const totalEvents = visible.length;
  const roomCount = new Set(visible.map((event) => event.location).filter(Boolean)).size;

  const focusRing =
    "outline-none focus-visible:ring-2 focus-visible:ring-[#ec5c13]/70 focus-visible:ring-offset-0";

  // ---------- header + chips ----------
  const chips = tracks.length > 0 && (
    <div role="group" aria-label="Filter by track" className="flex flex-wrap items-center gap-1.5">
      {[null, ...tracks].map((value) => {
        const active = track === value;
        const tone = value ? TRACK_TONES[tracks.indexOf(value) % TRACK_TONES.length] : null;
        const signal = tone ? getBjorkSignalPalette(tone, isDark) : null;
        return (
          <button
            key={value ?? "all"}
            type="button"
            aria-pressed={active}
            onClick={() => setTrack(value)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors",
              focusRing,
              active
                ? cn(palette.accentBg, palette.accentBorder, palette.accent)
                : palette.control
            )}
          >
            {signal ? <span aria-hidden className={cn("size-1.5 rounded-full", signal.dotColor)} /> : null}
            {value ?? "All tracks"}
          </button>
        );
      })}
    </div>
  );

  const header = (
    <div
      className={cn(
        "flex gap-3 border-b px-4 py-3.5",
        width >= 860 ? "flex-row items-center justify-between" : "flex-col",
        palette.divider
      )}
    >
      <div className="min-w-0">
        <div className={cn("text-[15px] font-semibold tracking-[-0.01em]", palette.primaryText)}>{title}</div>
        {subtitle ? <div className={cn("mt-0.5 text-[12px]", palette.secondaryText)}>{subtitle}</div> : null}
      </div>
      {chips}
    </div>
  );

  // ---------- footer ----------
  const selectedDay = selected ? days.find((day) => day.id === selected.day) : null;
  const footer = (
    <div
      className={cn(
        "flex min-h-[46px] flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t px-4 py-2.5 text-[12px]",
        palette.divider
      )}
      aria-live="polite"
    >
      {selected ? (
        <>
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden className={cn("size-2 shrink-0 rounded-full", getBjorkSignalPalette(toneFor(selected), isDark).dotColor)} />
            <span className={cn("truncate text-[13px] font-medium", palette.primaryText)}>{selected.title}</span>
          </div>
          <div className={cn("flex items-center gap-3 tabular-nums", palette.secondaryText)}>
            <span>
              {selectedDay?.label} {selected.start}–{selected.end}
            </span>
            {selected.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden className="size-3" />
                {selected.location}
              </span>
            ) : null}
            {selected.track ? <span>{selected.track}</span> : null}
          </div>
        </>
      ) : (
        <>
          <span className={cn("tabular-nums", palette.secondaryText)}>
            {totalEvents} sessions · {roomCount} rooms
          </span>
          <span className={palette.secondaryText}>Select a session for details</span>
        </>
      )}
    </div>
  );

  const emptyState = (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-10 text-center", palette.secondaryText)}>
      <CalendarX2 aria-hidden className="size-5 opacity-70" />
      <div className={cn("text-[13px] font-medium", palette.primaryText)}>No sessions scheduled</div>
      <div className="text-[12px]">
        {track ? "Nothing in this track yet. Try another filter." : "Add events to fill the week."}
      </div>
    </div>
  );

  // ---------- compact (agenda) ----------
  const renderCompact = () => {
    const dayEvents = (byDay.get(activeDay ?? "") ?? []).slice().sort((a, b) => a.startMin - b.startMin);
    const showNow = activeDay === todayId && nowMinutes !== null;
    const nowIndex = showNow ? dayEvents.findIndex((item) => item.startMin > (nowMinutes ?? 0)) : -1;
    const activeDayInfo = days.find((day) => day.id === activeDay);

    const onTabKey = (e: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
      let next = -1;
      if (e.key === "ArrowRight") next = (index + 1) % days.length;
      if (e.key === "ArrowLeft") next = (index - 1 + days.length) % days.length;
      if (e.key === "Home") next = 0;
      if (e.key === "End") next = days.length - 1;
      if (next < 0) return;
      e.preventDefault();
      setPickedDay(days[next].id);
      e.currentTarget.parentElement
        ?.querySelector<HTMLButtonElement>(`[data-day-tab="${CSS.escape(days[next].id)}"]`)
        ?.focus();
    };

    const nowRow = (
      <li key="now" className="relative flex items-center gap-3 py-1" aria-label={`Now, ${formatMinutes(nowMinutes ?? 0)}`}>
        <span className="w-[52px] text-right text-[11px] font-semibold tabular-nums" style={{ color: accent }}>
          {formatMinutes(nowMinutes ?? 0)}
        </span>
        <span aria-hidden className="relative h-px flex-1" style={{ background: accent }}>
          <span className="absolute -left-1 -top-[3px] size-[7px] rounded-full" style={{ background: accent }} />
        </span>
      </li>
    );

    return (
      <>
        <div
          role="tablist"
          aria-label="Day"
          className={cn("grid gap-1 border-b p-2", palette.divider)}
          style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
        >
          {days.map((day, index) => {
            const active = day.id === activeDay;
            const count = (byDay.get(day.id) ?? []).length;
            return (
              <button
                key={day.id}
                type="button"
                role="tab"
                data-day-tab={day.id}
                id={`tt-tab-${day.id}`}
                aria-selected={active}
                aria-controls="tt-agenda"
                tabIndex={active ? 0 : -1}
                onClick={() => setPickedDay(day.id)}
                onKeyDown={(e) => onTabKey(e, index)}
                className={cn(
                  "flex flex-col items-center rounded-[10px] py-1.5 transition-colors",
                  focusRing,
                  active ? cn(palette.accentBg, palette.accent) : cn(palette.secondaryText, palette.menuItem)
                )}
              >
                <span className="text-[11px] font-medium uppercase tracking-[0.08em]">{day.label}</span>
                <span className={cn("text-[13px] font-semibold tabular-nums", active ? palette.accent : palette.primaryText)}>
                  {day.date?.split(" ").pop() ?? count}
                </span>
                <span
                  aria-hidden
                  className={cn("mt-0.5 size-1 rounded-full", day.id === todayId ? "" : "opacity-0")}
                  style={{ background: accent }}
                />
              </button>
            );
          })}
        </div>
        <div
          role="tabpanel"
          id="tt-agenda"
          aria-labelledby={activeDay ? `tt-tab-${activeDay}` : undefined}
          className="overflow-y-auto px-3 py-3"
          style={{ maxHeight }}
        >
          {loading ? (
            <ul aria-busy="true" aria-label="Loading sessions" className="flex flex-col gap-2">
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="flex gap-3">
                  <span className={cn("h-4 w-[52px] rounded", palette.mutedSurface, !shouldReduceMotion && "animate-pulse")} />
                  <span className={cn("h-14 flex-1 rounded-[10px]", palette.mutedSurface, !shouldReduceMotion && "animate-pulse")} />
                </li>
              ))}
            </ul>
          ) : dayEvents.length === 0 ? (
            emptyState
          ) : (
            <ol aria-label={`${activeDayInfo?.fullLabel ?? activeDayInfo?.label ?? ""} sessions`} className="flex flex-col gap-1.5">
              {dayEvents.map((item, index) => {
                const signal = getBjorkSignalPalette(toneFor(item.event), isDark);
                const live = isLive(item.event);
                const isSelected = item.event.id === selectedId;
                return [
                  showNow && index === nowIndex && !live ? nowRow : null,
                  <li key={item.event.id} className="flex items-stretch gap-3">
                    <div className="flex w-[52px] shrink-0 flex-col items-end pt-2 tabular-nums">
                      <span className={cn("text-[13px] font-medium", palette.primaryText)}>{item.event.start}</span>
                      <span className={cn("text-[11px]", palette.secondaryText)}>{item.event.end}</span>
                    </div>
                    <button
                      type="button"
                      aria-label={describe(item.event)}
                      aria-pressed={isSelected}
                      onClick={() => handleSelect(item.event)}
                      className={cn(
                        "relative flex min-w-0 flex-1 flex-col items-start gap-0.5 overflow-hidden rounded-[10px] border py-2 pl-3.5 pr-3 text-left transition-colors",
                        isBreak(item.event)
                          ? cn("border-dashed", isDark ? "border-[#ededed]/14 bg-[#ededed]/[0.03]" : "border-[#171717]/16 bg-[#171717]/[0.025]")
                          : cn(signal.bgColor, signal.borderColor),
                        focusRing,
                        isSelected && "ring-2 ring-[#ec5c13]/60"
                      )}
                    >
                      {isBreak(item.event) ? null : (
                        <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px]", signal.dotColor)} />
                      )}
                      <span className={cn("w-full truncate text-[13px] font-medium", palette.primaryText)}>
                        {item.event.title}
                      </span>
                      <span className={cn("flex w-full items-center gap-1.5 truncate text-[12px]", palette.secondaryText)}>
                        {item.event.location ? <span>{item.event.location}</span> : null}
                        {item.event.location && item.event.track ? <span aria-hidden>·</span> : null}
                        {item.event.track ? <span>{item.event.track}</span> : null}
                        {live ? (
                          <span
                            className="ml-auto rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
                            style={{ color: accent, background: isDark ? "rgba(236,92,19,0.14)" : "rgba(236,92,19,0.12)" }}
                          >
                            Live
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>,
                ];
              })}
              {showNow && nowIndex === -1 && !dayEvents.some((item) => isLive(item.event)) ? nowRow : null}
            </ol>
          )}
        </div>
      </>
    );
  };

  // ---------- wide (week grid) ----------
  const gridColumns = `${GUTTER}px repeat(${days.length}, minmax(${MIN_DAY_WIDTH}px, 1fr))`;
  const slotBackground = `repeating-linear-gradient(to bottom, transparent 0, transparent ${slotHeight - 1}px, ${lineColor} ${slotHeight - 1}px, ${lineColor} ${slotHeight}px)`;

  const renderWide = () => (
    <div
      role="region"
      aria-label={`${title} weekly schedule`}
      tabIndex={0}
      className={cn("relative overflow-auto", focusRing)}
      style={{ maxHeight }}
    >
      <div
        className="grid"
        style={{ gridTemplateColumns: gridColumns, minWidth: GUTTER + days.length * MIN_DAY_WIDTH }}
      >
        {/* corner */}
        <div
          aria-hidden
          className={cn(
            "sticky left-0 top-0 z-30 flex items-end justify-end border-b border-r px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.08em]",
            palette.header
          )}
        >
          {timeZoneLabel}
        </div>
        {/* day headers */}
        {days.map((day, index) => {
          const isToday = day.id === todayId;
          return (
            <div
              key={day.id}
              id={`tt-day-${day.id}`}
              className={cn(
                "sticky top-0 z-20 flex items-baseline gap-2 border-b px-3 py-2.5",
                index < days.length - 1 && "border-r",
                palette.header
              )}
            >
              <span className="sr-only">
                {day.fullLabel ?? day.label}
                {day.date ? `, ${day.date}` : ""}
                {isToday ? ", today" : ""}
              </span>
              <span
                aria-hidden
                className={cn("text-[11px] font-medium uppercase tracking-[0.08em]", isToday && palette.accent)}
              >
                {day.label}
              </span>
              {day.date ? (
                <span
                  aria-hidden
                  className={cn("text-[13px] font-semibold tabular-nums", isToday ? palette.accent : palette.primaryText)}
                >
                  {day.date}
                </span>
              ) : null}
              {isToday ? (
                <span aria-hidden className="ml-auto size-1.5 self-center rounded-full" style={{ background: accent }} />
              ) : null}
            </div>
          );
        })}

        {/* time gutter */}
        <div
          aria-hidden
          className={cn("sticky left-0 z-10 border-r", palette.divider, isDark ? "bg-[#111]" : "bg-[#fffcf6]")}
          style={{ height: bodyHeight }}
        >
          {hourMarks.map((mark) => (
            <span
              key={mark}
              className={cn("absolute right-2 -translate-y-1/2 text-[11px] tabular-nums", palette.secondaryText)}
              style={{ top: Math.max(7, Math.min(bodyHeight - 7, (mark - rangeStart) * pxPerMinute)) }}
            >
              {formatMinutes(mark)}
            </span>
          ))}
          {nowInRange && todayId ? (
            <span
              className="absolute right-1 z-10 -translate-y-1/2 rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums text-white"
              style={{ top: nowTop, background: accent }}
            >
              {formatMinutes(nowMinutes ?? 0)}
            </span>
          ) : null}
        </div>

        {/* day columns */}
        {days.map((day, dayIndex) => {
          const placed = byDay.get(day.id) ?? [];
          const isToday = day.id === todayId;
          return (
            <section
              key={day.id}
              aria-labelledby={`tt-day-${day.id}`}
              className={cn("relative", dayIndex < days.length - 1 && "border-r", palette.divider)}
              style={{
                height: bodyHeight,
                backgroundImage: slotBackground,
                backgroundColor: isToday ? (isDark ? "rgba(236,92,19,0.025)" : "rgba(236,92,19,0.03)") : undefined,
              }}
            >
              {hourMarks.map((mark) => (
                <span
                  key={mark}
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 h-px"
                  style={{ top: (mark - rangeStart) * pxPerMinute - 1, background: hourLineColor }}
                />
              ))}

              {loading ? (
                <div aria-hidden className="absolute inset-0">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className={cn(
                        "absolute inset-x-1.5 rounded-[8px]",
                        palette.mutedSurface,
                        !shouldReduceMotion && "animate-pulse"
                      )}
                      style={{
                        top: ((dayIndex * 2 + i * 5) % 12) * slotHeight + 4,
                        height: slotHeight * (2 + ((dayIndex + i) % 2)) - 4,
                      }}
                    />
                  ))}
                </div>
              ) : (
                <ol className="absolute inset-0 m-0 list-none p-0">
                  {placed.map((item, index) => {
                    const startMin = Math.max(item.startMin, rangeStart);
                    const endMin = Math.min(item.endMin, rangeEnd);
                    if (endMin <= startMin) return null;
                    const top = (startMin - rangeStart) * pxPerMinute;
                    const height = (endMin - startMin) * pxPerMinute;
                    const signal = getBjorkSignalPalette(toneFor(item.event), isDark);
                    const isSelected = item.event.id === selectedId;
                    const live = isLive(item.event);
                    const short = height < 44;
                    const narrowLane = item.cols > 1;
                    const roomy = height >= 92 && !narrowLane;
                    // Gap (2) + borders (2) + padding (8) + time line (14) + optional room line (15), 15px per title line.
                    const titleLines = Math.max(1, Math.min(5, Math.floor((height - 2 - 2 - 8 - 14 - (roomy ? 15 : 0)) / 15)));
                    return (
                      <motion.li
                        key={item.event.id}
                        className={cn("absolute rounded-[8px]", isDark ? "bg-[#111]" : "bg-[#fffcf6]")}
                        style={{
                          top: top + 1,
                          height: height - 2,
                          left: `calc(${(item.col / item.cols) * 100}% + 3px)`,
                          width: `calc(${100 / item.cols}% - 5px)`,
                        }}
                        initial={shouldAnimate ? { opacity: 0, y: 6 } : false}
                        animate={{ opacity: 1, y: 0 }}
                        transition={
                          shouldAnimate
                            ? { delay: 0.04 * dayIndex + 0.025 * index, type: "spring", stiffness: 420, damping: 34 }
                            : { duration: 0 }
                        }
                      >
                        <motion.button
                          data-event-id={item.event.id}
                          type="button"
                          aria-label={describe(item.event)}
                          aria-pressed={isSelected}
                          onClick={() => handleSelect(item.event)}
                          onKeyDown={(e) => handleGridKey(e, item)}
                          whileHover={shouldAnimate ? { y: -1 } : undefined}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          className={cn(
                            "relative flex h-full w-full flex-col items-start overflow-hidden rounded-[8px] border pl-2.5 pr-1.5 text-left",
                            short ? "justify-center py-0" : "py-1",
                            isBreak(item.event)
                              ? cn("border-dashed", isDark ? "border-[#ededed]/14 bg-[#ededed]/[0.03]" : "border-[#171717]/16 bg-[#171717]/[0.025]")
                              : cn(signal.bgColor, signal.borderColor),
                            focusRing,
                            isSelected && (isDark ? "ring-2 ring-[#ec5c13]/70" : "ring-2 ring-[#bd4514]/60"),
                            live && !isSelected && (isDark ? "ring-1 ring-[#ec5c13]/45" : "ring-1 ring-[#bd4514]/40")
                          )}
                        >
                          {isBreak(item.event) ? null : (
                            <span aria-hidden className={cn("absolute inset-y-1 left-1 w-[2px] rounded-full", signal.dotColor)} />
                          )}
                          {live ? (
                            <span
                              aria-hidden
                              className="absolute right-1.5 top-1.5 size-1.5 rounded-full"
                              style={{ background: accent }}
                            />
                          ) : null}
                          {short ? (
                            <span className="flex w-full min-w-0 items-baseline gap-1.5">
                              <span className={cn("shrink-0 text-[11px] tabular-nums", signal.textColor)}>{item.event.start}</span>
                              <span className={cn("truncate text-[12px] font-medium leading-tight", palette.primaryText)}>
                                {item.event.title}
                              </span>
                            </span>
                          ) : (
                            <>
                              <span
                                className={cn(
                                  "w-full truncate whitespace-nowrap text-[11px] tabular-nums leading-[13px]",
                                  signal.textColor
                                )}
                              >
                                {narrowLane ? item.event.start : `${item.event.start}–${item.event.end}`}
                              </span>
                              <span
                                className={cn(
                                  "mt-px w-full text-[12px] font-medium leading-[15px]",
                                  narrowLane && "hyphens-auto",
                                  titleLines > 1 ? "overflow-hidden" : "truncate",
                                  palette.primaryText
                                )}
                                style={
                                  titleLines > 1
                                    ? { display: "-webkit-box", WebkitLineClamp: titleLines, WebkitBoxOrient: "vertical" }
                                    : undefined
                                }
                              >
                                {item.event.title}
                              </span>
                              {item.event.location && roomy ? (
                                <span className={cn("mt-auto w-full truncate text-[11px]", palette.secondaryText)}>
                                  {item.event.location}
                                </span>
                              ) : null}
                            </>
                          )}
                        </motion.button>
                      </motion.li>
                    );
                  })}
                </ol>
              )}

              {isToday && nowInRange ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 z-10 h-[2px]"
                  style={{ top: nowTop - 1, background: accent }}
                >
                  <span className="absolute -left-[4px] -top-[3px] size-2 rounded-full" style={{ background: accent }} />
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
      {!loading && visible.length === 0 ? (
        <div className={cn("absolute inset-x-0 top-[44px] z-20 flex justify-center")}>
          <div className={cn("mt-10 rounded-[14px] border", palette.menu)}>{emptyState}</div>
        </div>
      ) : null}
    </div>
  );

  return (
    <div
      ref={rootRef}
      data-tt-root=""
      className={cn("mx-auto w-full max-w-[1120px] overflow-hidden rounded-[18px] border", palette.container, className)}
    >
      {header}
      {compact ? renderCompact() : renderWide()}
      {footer}
    </div>
  );
}
