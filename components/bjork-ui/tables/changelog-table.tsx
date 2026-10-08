"use client";

import {
  Fragment,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTheme } from "next-themes";
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronRight,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useElementSize } from "../_core/canvas";
import {
  type BjorkTableThemeMode,
  getBjorkSignalPalette,
  getBjorkTablePalette,
  useBjorkTableIsDark,
} from "./table-theme";

export type ChangeType = "feature" | "fix" | "improvement" | "breaking" | "security";

export interface ChangelogChange {
  type: ChangeType;
  text: string;
}

export interface ChangelogRelease {
  /** Semver without the leading "v", e.g. "3.2.0". */
  version: string;
  /** ISO date, e.g. "2026-09-30". */
  date: string;
  summary: string;
  changes: ChangelogChange[];
  /** Tags shown in the row. Defaults to the distinct types in `changes`. */
  types?: ChangeType[];
  href?: string;
}

export interface ChangelogTableProps {
  releases?: ChangelogRelease[];
  /** Adds a header row per minor version (3.2, 3.1, ...). */
  groupByMinor?: boolean;
  /** Versions expanded on first render. */
  defaultExpanded?: string[];
  onReleaseToggle?: (version: string, expanded: boolean) => void;
  productName?: string;
  maxHeight?: number;
  loading?: boolean;
  className?: string;
  theme?: BjorkTableThemeMode;
  enableAnimations?: boolean;
}

const TYPE_ORDER: ChangeType[] = ["feature", "improvement", "fix", "breaking", "security"];

const TYPE_META: Record<ChangeType, { label: string; icon: LucideIcon; tone: "green" | "red" | "orange" | "neutral" }> = {
  feature: { label: "Feature", icon: Sparkles, tone: "green" },
  improvement: { label: "Improvement", icon: TrendingUp, tone: "neutral" },
  fix: { label: "Fix", icon: Wrench, tone: "neutral" },
  breaking: { label: "Breaking", icon: AlertTriangle, tone: "red" },
  security: { label: "Security", icon: ShieldCheck, tone: "orange" },
};

export const CHANGELOG_TABLE_SAMPLE: ChangelogRelease[] = [
  {
    version: "3.2.0",
    date: "2026-09-30",
    summary: "Branch previews for sync rules and a faster cold start",
    href: "#v3.2.0",
    changes: [
      { type: "feature", text: "`driftline preview` spins up an isolated replica for any branch of your sync rules." },
      { type: "feature", text: "Rules can reference `auth.claims` directly, no custom resolver needed." },
      { type: "improvement", text: "Cold start on mobile clients is 38% faster thanks to a lazily hydrated index." },
      { type: "improvement", text: "`driftline push --dry-run` now prints the full diff plan as a table." },
    ],
  },
  {
    version: "3.1.2",
    date: "2026-09-18",
    summary: "Patches a token replay window in the websocket handshake",
    href: "#v3.1.2",
    changes: [
      { type: "security", text: "Handshake nonces now expire after 30 seconds, closing a narrow replay window." },
      { type: "fix", text: "Reconnects no longer drop queued mutations when the socket closes mid-flush." },
    ],
  },
  {
    version: "3.1.1",
    date: "2026-09-09",
    summary: "Fixes WAL checkpoint stalls on large batches",
    href: "#v3.1.1",
    changes: [
      { type: "fix", text: "Batches over 10k rows no longer stall the WAL checkpoint on SQLite targets." },
      { type: "fix", text: "`driftline status` reports the correct lag when the replica clock drifts." },
      { type: "fix", text: "Windows paths with spaces are quoted in generated migration scripts." },
    ],
  },
  {
    version: "3.1.0",
    date: "2026-08-27",
    summary: "Conflict inspector and typed client generation",
    href: "#v3.1.0",
    changes: [
      { type: "feature", text: "New conflict inspector shows both sides of a merge with field-level blame." },
      { type: "feature", text: "`driftline codegen --lang ts` emits typed clients from your schema." },
      { type: "improvement", text: "Schema diffs ignore column order, so reordering no longer triggers a migration." },
      { type: "fix", text: "Composite primary keys round-trip correctly through the REST bridge." },
    ],
  },
  {
    version: "3.0.1",
    date: "2026-08-12",
    summary: "Hotfix for the 3.0 config migrator",
    href: "#v3.0.1",
    changes: [
      { type: "fix", text: "The config migrator keeps comments and trailing commas in `driftline.toml`." },
    ],
  },
  {
    version: "3.0.0",
    date: "2026-08-04",
    summary: "New rules engine, Node 18 support dropped",
    href: "#v3.0.0",
    changes: [
      { type: "breaking", text: "Node 18 is no longer supported. The CLI and SDK require Node 20.11 or later." },
      { type: "breaking", text: "`sync.rules.js` is replaced by declarative `rules.toml`. Run `driftline migrate-rules`." },
      { type: "feature", text: "The new rules engine evaluates filters on the server, cutting payloads by up to 70%." },
      { type: "improvement", text: "Error messages link to the exact rule and line that failed." },
    ],
  },
  {
    version: "2.9.4",
    date: "2026-07-21",
    summary: "Updates the crypto binding and tightens CORS defaults",
    href: "#v2.9.4",
    changes: [
      { type: "security", text: "Bumps the bundled crypto binding to patch a timing side channel in key comparison." },
      { type: "security", text: "The dev server no longer allows wildcard CORS origins by default." },
      { type: "fix", text: "Telemetry opt-out is respected when set through an environment variable." },
    ],
  },
  {
    version: "2.9.3",
    date: "2026-07-08",
    summary: "Smaller bundles for browser clients",
    href: "#v2.9.3",
    changes: [
      { type: "improvement", text: "The browser SDK drops its polyfills and is 11 kB smaller gzipped." },
      { type: "improvement", text: "Log lines include the replica id for easier tracing across regions." },
    ],
  },
  {
    version: "2.9.0",
    date: "2026-06-24",
    summary: "Offline queues survive app restarts",
    href: "#v2.9.0",
    changes: [
      { type: "feature", text: "Pending mutations persist to disk and replay in order after a restart." },
      { type: "feature", text: "New `onQueueChange` hook reports queue depth for offline indicators." },
    ],
  },
];

const subscribeNoop = () => () => {};

// False during SSR and hydration, true afterwards.
function useMounted() {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

function parseSemver(version: string) {
  const [major = 0, minor = 0, patch = 0] = version
    .replace(/^v/, "")
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10) || 0);
  return { major, minor, patch };
}

function compareSemverDesc(a: string, b: string) {
  const x = parseSemver(a);
  const y = parseSemver(b);
  return y.major - x.major || y.minor - x.minor || y.patch - x.patch;
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? iso : dateFormat.format(date);
}

function releaseTypes(release: ChangelogRelease) {
  const set = new Set<ChangeType>(release.types ?? release.changes.map((change) => change.type));
  return TYPE_ORDER.filter((type) => set.has(type));
}

export function ChangelogTable({
  releases = CHANGELOG_TABLE_SAMPLE,
  groupByMinor = false,
  defaultExpanded = [],
  onReleaseToggle,
  productName = "Driftline",
  maxHeight = 560,
  loading = false,
  className,
  theme = "auto",
  enableAnimations = true,
}: ChangelogTableProps) {
  const mounted = useMounted();
  const { resolvedTheme } = useTheme();
  const forcedTheme = theme === "auto" ? undefined : theme;
  const detectedIsDark = useBjorkTableIsDark(resolvedTheme, forcedTheme);
  const isDark = !mounted && theme === "auto" ? true : detectedIsDark;
  const palette = getBjorkTablePalette(isDark);
  const shouldReduceMotion = useReducedMotion();
  const shouldAnimate = enableAnimations && !shouldReduceMotion;

  const [query, setQuery] = useState("");
  const [activeTypes, setActiveTypes] = useState<Set<ChangeType>>(() => new Set());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(defaultExpanded));
  const [instant, setInstant] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { width: rootWidth } = useElementSize(rootRef);
  const wide = !(rootWidth > 0 && rootWidth < 600);
  // Below ~840px the type tags move under the summary so it stays readable.
  const showTypeCol = wide && !(rootWidth > 0 && rootWidth < 840);
  const uid = useId();

  const sorted = useMemo(
    () => [...releases].sort((a, b) => compareSemverDesc(a.version, b.version)),
    [releases]
  );
  const latestVersion = sorted[0]?.version;

  const typeCounts = useMemo(() => {
    const counts = new Map<ChangeType, number>();
    for (const release of sorted) {
      for (const type of releaseTypes(release)) counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    return counts;
  }, [sorted]);

  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      sorted.filter((release) => {
        if (activeTypes.size > 0 && !releaseTypes(release).some((type) => activeTypes.has(type))) {
          return false;
        }
        if (!needle) return true;
        return (
          release.version.toLowerCase().includes(needle.replace(/^v/, "")) ||
          release.summary.toLowerCase().includes(needle) ||
          release.changes.some((change) => change.text.toLowerCase().includes(needle))
        );
      }),
    [sorted, activeTypes, needle]
  );

  const groups = useMemo(() => {
    if (!groupByMinor) return [{ key: "all", label: "", releases: visible }];
    const map = new Map<string, ChangelogRelease[]>();
    for (const release of visible) {
      const { major, minor } = parseSemver(release.version);
      const key = `${major}.${minor}`;
      map.set(key, [...(map.get(key) ?? []), release]);
    }
    return [...map.entries()].map(([key, list]) => ({ key, label: `v${key}`, releases: list }));
  }, [visible, groupByMinor]);

  const toggle = (version: string, fromKeyboard: boolean) => {
    setInstant(fromKeyboard);
    setExpanded((prev) => {
      const next = new Set(prev);
      const open = !next.has(version);
      if (open) next.add(version);
      else next.delete(version);
      onReleaseToggle?.(version, open);
      return next;
    });
  };

  const toggleType = (type: ChangeType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const clearFilters = () => {
    setQuery("");
    setActiveTypes(new Set());
  };

  const onToggleKey = (event: KeyboardEvent<HTMLButtonElement>, version: string) => {
    const order = visible.map((release) => release.version);
    const index = order.indexOf(version);
    let next = -1;
    if (event.key === "ArrowDown") next = Math.min(order.length - 1, index + 1);
    if (event.key === "ArrowUp") next = Math.max(0, index - 1);
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = order.length - 1;
    if (event.key === "ArrowRight" && !expanded.has(version)) {
      event.preventDefault();
      toggle(version, true);
      return;
    }
    if (event.key === "ArrowLeft" && expanded.has(version)) {
      event.preventDefault();
      toggle(version, true);
      return;
    }
    if (next < 0) return;
    event.preventDefault();
    event.currentTarget
      .closest("table")
      ?.querySelector<HTMLButtonElement>(`[data-release-toggle="${order[next]}"]`)
      ?.focus();
  };

  const highlight = (text: string): ReactNode => {
    if (!needle) return text;
    const lower = text.toLowerCase();
    const parts: ReactNode[] = [];
    let cursor = 0;
    let hit = lower.indexOf(needle);
    while (hit !== -1) {
      if (hit > cursor) parts.push(text.slice(cursor, hit));
      parts.push(
        <mark
          key={hit}
          className={cn("rounded-[3px] px-[1px]", isDark ? "bg-[#ec5c13]/24 text-[#ededed]" : "bg-[#ec5c13]/18 text-[#171717]")}
        >
          {text.slice(hit, hit + needle.length)}
        </mark>
      );
      cursor = hit + needle.length;
      hit = lower.indexOf(needle, cursor);
    }
    if (cursor < text.length) parts.push(text.slice(cursor));
    return parts;
  };

  // Renders `code` spans inside change notes.
  const renderChangeText = (text: string) =>
    text.split(/(`[^`]+`)/g).map((part, index) =>
      part.startsWith("`") && part.endsWith("`") ? (
        <code
          key={index}
          className={cn(
            "rounded-[5px] border px-1 py-[1px] font-mono text-[11.5px]",
            isDark ? "border-[#2a2a2a] bg-[#1a1a1a] text-[#ededed]/82" : "border-[#eadfce] bg-[#f8f2e7] text-[#171717]/80"
          )}
        >
          {highlight(part.slice(1, -1))}
        </code>
      ) : (
        <Fragment key={index}>{highlight(part)}</Fragment>
      )
    );

  const strongText = isDark ? "text-[#ededed]" : "text-[#171717]";
  const headerSurface = isDark ? "bg-[#181818]" : "bg-[#fbf7ef]";
  const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[#ec5c13]/50";
  const headerLabel = "text-[11px] font-medium uppercase tracking-[0.08em]";
  const columnCount = wide ? (showTypeCol ? 5 : 4) : 3;
  const animateRows = shouldAnimate && !instant;

  const renderTag = (type: ChangeType) => {
    const meta = TYPE_META[type];
    const tone = getBjorkSignalPalette(meta.tone, isDark);
    const Icon = meta.icon;
    return (
      <span
        key={type}
        className={cn(
          "inline-flex items-center gap-1 rounded-[6px] border px-1.5 py-[2px] text-[11px] font-medium leading-[14px]",
          tone.bgColor,
          tone.borderColor,
          tone.textColor
        )}
      >
        <Icon className="size-3" aria-hidden="true" strokeWidth={2.2} />
        {meta.label}
      </span>
    );
  };

  const filtersActive = needle.length > 0 || activeTypes.size > 0;

  return (
    <div ref={rootRef} className={cn("mx-auto w-full max-w-[1040px]", className)}>
      <div className={cn("relative overflow-hidden rounded-[18px] border", palette.container)}>
        {/* Toolbar */}
        <div className={cn("flex flex-col gap-3 border-b px-4 py-3", palette.divider)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className={cn("text-[13px] font-medium", palette.primaryText)}>{productName} releases</p>
              <p className={cn("text-[12px] tabular-nums", palette.secondaryText)}>
                {filtersActive ? `${visible.length} of ${sorted.length} releases` : `${sorted.length} releases`}
              </p>
            </div>
            <label
              className={cn(
                "relative flex h-8 min-w-0 items-center rounded-[9px] border transition-shadow focus-within:ring-2 focus-within:ring-[#ec5c13]/40",
                wide ? "w-[240px]" : "w-full",
                palette.control
              )}
            >
              <span className="sr-only">Search releases</span>
              <Search className="pointer-events-none ml-2.5 size-3.5 shrink-0 opacity-60" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && query) {
                    event.preventDefault();
                    setQuery("");
                  }
                }}
                placeholder="Search versions or notes"
                className={cn(
                  "h-full min-w-0 flex-1 bg-transparent px-2 text-[12.5px] outline-none [&::-webkit-search-cancel-button]:hidden",
                  isDark ? "placeholder:text-[#ededed]/30" : "placeholder:text-[#171717]/36",
                  strongText
                )}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className={cn("mr-1 inline-flex size-6 items-center justify-center rounded-[7px]", focusRing, palette.menuItem)}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              )}
            </label>
          </div>
          <div role="group" aria-label="Filter by change type" className="-mx-1 flex flex-wrap gap-1.5 px-1">
            {TYPE_ORDER.filter((type) => typeCounts.has(type)).map((type) => {
              const pressed = activeTypes.has(type);
              const meta = TYPE_META[type];
              const tone = getBjorkSignalPalette(meta.tone, isDark);
              const Icon = meta.icon;
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => toggleType(type)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors",
                    focusRing,
                    pressed
                      ? cn(tone.bgColor, tone.borderColor, tone.textColor)
                      : cn(palette.control)
                  )}
                >
                  <Icon className={cn("size-3", pressed ? "" : "opacity-60")} aria-hidden="true" />
                  {meta.label}
                  <span className={cn("tabular-nums", pressed ? "opacity-80" : "opacity-50")}>{typeCounts.get(type)}</span>
                </button>
              );
            })}
            {activeTypes.size > 0 && (
              <button
                type="button"
                onClick={() => setActiveTypes(new Set())}
                className={cn("inline-flex h-7 items-center rounded-full px-2 text-[12px] underline-offset-2 hover:underline", focusRing, palette.secondaryText)}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div
          role="region"
          aria-label={`${productName} release history, scrollable`}
          tabIndex={0}
          className={cn("relative overflow-auto overscroll-contain", focusRing, "focus-visible:ring-inset")}
          style={{ maxHeight }}
        >
          <table className="w-full table-fixed border-separate border-spacing-0">
            <caption className="sr-only">
              {productName} release history. Expand a release to read every change.
            </caption>
            <colgroup>
              <col style={{ width: wide ? 140 : 124 }} />
              {wide && <col style={{ width: 118 }} />}
              {showTypeCol && <col style={{ width: 230 }} />}
              <col />
              <col style={{ width: 48 }} />
            </colgroup>
            <thead>
              <tr>
                {[
                  { label: "Version", show: true },
                  { label: "Date", show: wide },
                  { label: "Type", show: showTypeCol },
                  { label: "Summary", show: true },
                  { label: "Link", show: true, sr: true },
                ]
                  .filter((column) => column.show)
                  .map((column) => (
                    <th
                      key={column.label}
                      scope="col"
                      className={cn(
                        "sticky top-0 z-20 border-b px-3 py-2.5 text-left",
                        headerSurface,
                        palette.divider,
                        palette.header.split(" ").filter((c) => c.startsWith("text-")),
                        headerLabel,
                        column.label === "Version" && "pl-4"
                      )}
                    >
                      {column.sr ? <span className="sr-only">{column.label}</span> : column.label}
                    </th>
                  ))}
              </tr>
            </thead>
            {loading ? (
              <tbody aria-busy="true">
                {Array.from({ length: 6 }, (_, row) => (
                  <tr key={row}>
                    {Array.from({ length: columnCount }, (_, cell) => (
                      <td key={cell} className={cn("border-b px-3 py-3.5", palette.divider, cell === 0 && "pl-4")}>
                        <span
                          className={cn("block h-2.5 animate-pulse rounded-full motion-reduce:animate-none", palette.mutedSurface)}
                          style={{ width: cell === columnCount - 1 ? 16 : `${44 + ((row * 13 + cell * 29) % 46)}%` }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ) : (
              groups.map((group, groupIndex) => (
                <tbody key={group.key}>
                  {groupByMinor && (
                    <tr>
                      <th
                        scope="colgroup"
                        colSpan={columnCount}
                        className={cn("border-b px-4 py-1.5 text-left", palette.divider, palette.mutedSurface)}
                      >
                        <span className={cn("font-mono text-[11.5px] font-medium", palette.primaryText)}>{group.label}</span>
                        <span className={cn("ml-2 text-[11px] tabular-nums", palette.secondaryText)}>
                          {group.releases.length} {group.releases.length === 1 ? "release" : "releases"}
                        </span>
                      </th>
                    </tr>
                  )}
                  {group.releases.map((release, index) => {
                    const open = expanded.has(release.version);
                    const types = releaseTypes(release);
                    const isLatest = release.version === latestVersion;
                    const detailsId = `${uid}-details-${release.version}`;
                    const order = groupIndex * 100 + index;
                    return (
                      <Fragment key={release.version}>
                        <motion.tr
                          initial={shouldAnimate ? { opacity: 0, y: 6 } : false}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1], delay: Math.min(order, 10) * 0.035 }}
                          onClick={(event) => {
                            if ((event.target as HTMLElement).closest("a,button")) return;
                            toggle(release.version, false);
                          }}
                          className={cn(
                            "group/row cursor-pointer transition-colors",
                            open
                              ? isDark
                                ? "bg-[#161616]"
                                : "bg-[#faf5ec]"
                              : isDark
                                ? "hover:bg-[#181818]/70"
                                : "hover:bg-[#f8f2e7]/72"
                          )}
                        >
                          <th scope="row" className={cn("border-b py-0 pl-2 pr-3 text-left font-normal", open ? "border-transparent" : palette.divider)}>
                            <button
                              data-release-toggle={release.version}
                              type="button"
                              aria-expanded={open}
                              aria-controls={detailsId}
                              onClick={(event) => toggle(release.version, event.detail === 0)}
                              onKeyDown={(event) => onToggleKey(event, release.version)}
                              className={cn("flex w-full min-w-0 items-center gap-1.5 rounded-[8px] px-1.5 py-3 text-left", focusRing)}
                            >
                              <ChevronRight
                                aria-hidden="true"
                                className={cn(
                                  "size-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
                                  palette.secondaryText,
                                  open && "rotate-90"
                                )}
                              />
                              <span className="min-w-0">
                                <span className={cn("block font-mono text-[12.5px] font-medium tabular-nums", strongText)}>
                                  {highlight(`v${release.version}`)}
                                </span>
                                {!wide && (
                                  <time dateTime={release.date} className={cn("block whitespace-nowrap text-[11px] tabular-nums", palette.secondaryText)}>
                                    {formatDate(release.date)}
                                  </time>
                                )}
                              </span>
                              <span className="sr-only">, {open ? "hide" : "show"} {release.changes.length} changes</span>
                            </button>
                          </th>
                          {wide && (
                            <td className={cn("border-b px-3 py-3", open ? "border-transparent" : palette.divider)}>
                              <time dateTime={release.date} className={cn("text-[12.5px] tabular-nums", palette.secondaryText)}>
                                {formatDate(release.date)}
                              </time>
                            </td>
                          )}
                          {showTypeCol && (
                            <td className={cn("border-b px-3 py-2.5", open ? "border-transparent" : palette.divider)}>
                              <span className="flex flex-wrap gap-1">
                                {types.slice(0, 2).map((type) => (
                                  renderTag(type)
                                ))}
                                {types.length > 2 && (
                                  <span
                                    className={cn("inline-flex items-center rounded-[6px] px-1 text-[11px] tabular-nums", palette.secondaryText)}
                                    title={types.slice(2).map((type) => TYPE_META[type].label).join(", ")}
                                  >
                                    +{types.length - 2}
                                    <span className="sr-only"> more: {types.slice(2).map((type) => TYPE_META[type].label).join(", ")}</span>
                                  </span>
                                )}
                              </span>
                            </td>
                          )}
                          <td className={cn("border-b px-3 py-3", open ? "border-transparent" : palette.divider)}>
                            <span className="flex min-w-0 items-center gap-2">
                              <span className={cn("min-w-0 text-[13px] leading-[1.4]", showTypeCol && "truncate", palette.primaryText)}>
                                {highlight(release.summary)}
                              </span>
                              {isLatest && (
                                <span className={cn("shrink-0 rounded-[6px] border px-1.5 py-[1px] text-[10.5px] font-medium", palette.accentBg, palette.accentBorder, palette.accent)}>
                                  Latest
                                </span>
                              )}
                            </span>
                            {!showTypeCol && (
                              <span className="mt-1.5 flex flex-wrap gap-1">
                                {types.map((type) => (
                                  renderTag(type)
                                ))}
                              </span>
                            )}
                          </td>
                          <td className={cn("border-b px-2 py-3 text-right", open ? "border-transparent" : palette.divider)}>
                            {release.href && (
                              <a
                                href={release.href}
                                aria-label={`Release notes for v${release.version}`}
                                className={cn(
                                  "inline-flex size-7 items-center justify-center rounded-[8px] transition-colors",
                                  focusRing,
                                  palette.secondaryText,
                                  isDark ? "hover:bg-[#232323] hover:text-[#ededed]" : "hover:bg-[#f1e8dc] hover:text-[#171717]"
                                )}
                              >
                                <ArrowUpRight className="size-3.5" aria-hidden="true" />
                              </a>
                            )}
                          </td>
                        </motion.tr>
                        <tr className={open ? (isDark ? "bg-[#161616]" : "bg-[#faf5ec]") : undefined}>
                          <td
                            id={detailsId}
                            colSpan={columnCount}
                            className={cn("p-0", open && cn("border-b", palette.divider))}
                          >
                            <AnimatePresence initial={false}>
                              {open && (
                                <motion.div
                                  key="details"
                                  initial={animateRows ? { height: 0, opacity: 0 } : false}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={animateRows ? { height: 0, opacity: 0 } : { height: 0, opacity: 0, transition: { duration: 0 } }}
                                  transition={{ height: { type: "spring", stiffness: 420, damping: 40 }, opacity: { duration: 0.18 } }}
                                  className="overflow-hidden"
                                >
                                  <ul
                                    aria-label={`Changes in v${release.version}`}
                                    className={cn("flex flex-col gap-2 pb-4 pr-4 pt-0.5", wide ? "pl-[44px]" : "pl-[30px]")}
                                  >
                                    {release.changes.map((change, changeIndex) => {
                                      const meta = TYPE_META[change.type];
                                      const tone = getBjorkSignalPalette(meta.tone, isDark);
                                      return (
                                        <li key={changeIndex} className="flex items-start gap-2.5 text-[13px] leading-[1.5]">
                                          <span aria-hidden="true" className={cn("mt-[8px] size-1.5 shrink-0 rounded-full", tone.dotColor)} />
                                          <span className={cn("w-[84px] shrink-0 text-[11.5px] font-medium leading-[19.5px]", tone.textColor, !wide && "hidden")}>
                                            {meta.label}
                                          </span>
                                          <span className={palette.primaryText}>
                                            {!wide && <span className="sr-only">{meta.label}: </span>}
                                            {renderChangeText(change.text)}
                                          </span>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              ))
            )}
          </table>
          {!loading && visible.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <p className={cn("text-[14px] font-medium", palette.primaryText)}>
                {sorted.length === 0 ? "No releases yet" : "No releases match"}
              </p>
              <p className={cn("max-w-[320px] text-[13px]", palette.secondaryText)}>
                {sorted.length === 0
                  ? "Published releases will show up here."
                  : needle
                    ? `Nothing mentions “${query.trim()}” with the current filters.`
                    : "No release has changes of the selected types."}
              </p>
              {sorted.length > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className={cn("mt-1 rounded-[8px] border px-3 py-1.5 text-[12.5px] font-medium", focusRing, palette.control)}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
