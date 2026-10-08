"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTheme } from "next-themes";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useElementSize } from "../_core/canvas";
import {
  type BjorkTableThemeMode,
  getBjorkSignalPalette,
  getBjorkTablePalette,
  useBjorkTableIsDark,
} from "./table-theme";

export type SortableColumnFormat = "number" | "currency" | "date" | "text";
export type SortDirection = "asc" | "desc";
export type SortableValue = string | number | Date | boolean | null | undefined;

export interface SortRule {
  key: string;
  direction: SortDirection;
}

export interface SortableCellContext {
  /** Raw value from the accessor. */
  value: SortableValue;
  /** Value run through the column format (what the cell shows by default). */
  formatted: string;
  isDark: boolean;
}

export interface SortableColumn<T> {
  key: string;
  header: string;
  /** Property name or function returning the sortable, searchable value. Defaults to `row[key]`. */
  accessor?: keyof T | ((row: T) => SortableValue);
  /** Custom cell renderer. Sorting and search still use the accessor value. */
  cell?: (row: T, context: SortableCellContext) => ReactNode;
  /** Defaults to true. */
  sortable?: boolean;
  /** Defaults to "right" for number/currency/date, "left" otherwise. */
  align?: "left" | "right" | "center";
  /** Column width in px (or any CSS width). */
  width?: number | string;
  format?: SortableColumnFormat;
  /** ISO 4217 code for `format: "currency"`. Falls back to the table's `currency`. */
  currency?: string;
  /** Can the column be hidden from the Columns menu? Defaults to true. */
  hideable?: boolean;
  defaultHidden?: boolean;
  /** Include the column in the global search. Defaults to true. */
  searchable?: boolean;
}

export interface SortableTableProps<T> {
  columns?: SortableColumn<T>[];
  rows?: T[];
  getRowId?: (row: T, index: number) => string;
  /** Accessible name for a row's checkbox. Defaults to the first column's value plus the row id. */
  getRowLabel?: (row: T) => string;
  /** Screen-reader caption for the table. */
  caption?: string;
  title?: string;
  /** Noun used in the range label, e.g. "1–10 of 48 deployments". */
  itemLabel?: string;
  searchPlaceholder?: string;
  pageSizeOptions?: number[];
  defaultPageSize?: number;
  defaultSort?: SortRule[];
  defaultSelectedIds?: string[];
  /** Hold shift while clicking a header to sort by more than one column. Defaults to true. */
  multiSort?: boolean;
  selectable?: boolean;
  onSelectionChange?: (selectedIds: string[]) => void;
  onSortChange?: (sort: SortRule[]) => void;
  loading?: boolean;
  /** Body scrolls under a sticky header past this height (px). */
  maxBodyHeight?: number;
  locale?: string;
  currency?: string;
  /** Time zone used by `format: "date"` columns. Defaults to UTC so server and client agree. */
  timeZone?: string;
  className?: string;
  theme?: BjorkTableThemeMode;
  enableAnimations?: boolean;
}

/* ------------------------------------------------------------------ */
/* Sample data                                                         */
/* ------------------------------------------------------------------ */

export type DeploymentStatus = "Ready" | "Building" | "Failed" | "Canceled";

export interface Deployment {
  id: string;
  service: string;
  status: DeploymentStatus;
  environment: "Production" | "Preview" | "Staging";
  branch: string;
  author: string;
  durationSec: number;
  cost: number;
  createdAt: string;
}

const SAMPLE_SERVICES = [
  "checkout-api",
  "ledger-sync",
  "search-indexer",
  "auth-gateway",
  "media-resizer",
  "notify-worker",
  "billing-web",
  "atlas-dashboard",
];
const SAMPLE_BRANCHES = [
  "main",
  "feat/pricing-v2",
  "fix/retry-backoff",
  "chore/bump-deps",
  "feat/bulk-export",
  "release/4.12",
  "fix/tz-rollover",
];
const SAMPLE_AUTHORS = ["ana.k", "devraj", "m.oyel", "tsuki", "pbravo", "linnea"];
const SAMPLE_ENVS: Deployment["environment"][] = ["Production", "Preview", "Staging", "Preview"];
const SAMPLE_STATUSES: DeploymentStatus[] = [
  "Ready", "Ready", "Ready", "Building", "Ready", "Failed", "Ready", "Ready", "Canceled", "Ready",
];

const SAMPLE_STATUS_OVERRIDES: Partial<Record<number, DeploymentStatus>> = {
  0: "Building",
  1: "Ready",
  2: "Failed",
  3: "Ready",
  4: "Ready",
  5: "Ready",
  6: "Canceled",
  7: "Ready",
};

function buildSampleDeployments(count: number): Deployment[] {
  // Deterministic LCG so server and client render the same rows.
  let seed = 20261008;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const base = Date.UTC(2026, 9, 8, 17, 42);
  let offset = 0;
  return Array.from({ length: count }, (_, index) => {
    offset += Math.round(18 + next() * 70);
    const hex = Math.floor(next() * 0xffffff).toString(16).padStart(6, "0");
    const picked = SAMPLE_STATUSES[Math.floor(next() * SAMPLE_STATUSES.length)];
    const status = SAMPLE_STATUS_OVERRIDES[index] ?? picked;
    return {
      id: `dpl_${hex}`,
      service: SAMPLE_SERVICES[Math.floor(next() * SAMPLE_SERVICES.length)],
      status,
      environment: SAMPLE_ENVS[Math.floor(next() * SAMPLE_ENVS.length)],
      branch: SAMPLE_BRANCHES[Math.floor(next() * SAMPLE_BRANCHES.length)],
      author: SAMPLE_AUTHORS[Math.floor(next() * SAMPLE_AUTHORS.length)],
      durationSec: Math.round(36 + next() * 380),
      cost: Math.round(6 + next() * 340) / 100,
      createdAt: new Date(base - offset * 60_000).toISOString(),
    };
  });
}

export const SORTABLE_TABLE_SAMPLE_ROWS: Deployment[] = buildSampleDeployments(48);

const deploymentTone: Record<DeploymentStatus, "green" | "orange" | "red" | "neutral"> = {
  Ready: "green",
  Building: "orange",
  Failed: "red",
  Canceled: "neutral",
};

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

export const SORTABLE_TABLE_SAMPLE_COLUMNS: SortableColumn<Deployment>[] = [
  {
    key: "service",
    header: "Deployment",
    width: 230,
    hideable: false,
    cell: (row, { isDark }) => (
      <span className="flex min-w-0 flex-col">
        <span className={cn("truncate font-medium", isDark ? "text-[#ededed]/90" : "text-[#171717]/86")}>
          {row.service}
        </span>
        <span className={cn("truncate font-mono text-[11px]", isDark ? "text-[#ededed]/38" : "text-[#171717]/50")}>
          {row.id} · {row.author}
        </span>
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    width: 122,
    cell: (row, { isDark }) => {
      const tone = getBjorkSignalPalette(deploymentTone[row.status], isDark);
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12px] font-medium",
            tone.bgColor,
            tone.borderColor,
            tone.textColor
          )}
        >
          <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", tone.dotColor)} />
          {row.status}
        </span>
      );
    },
  },
  { key: "environment", header: "Environment", width: 144 },
  {
    key: "branch",
    header: "Branch",
    width: 156,
    cell: (row) => <span className="block truncate font-mono text-[12px]">{row.branch}</span>,
  },
  {
    key: "durationSec",
    header: "Duration",
    width: 120,
    format: "number",
    cell: (row) => formatDuration(row.durationSec),
  },
  { key: "cost", header: "Cost", width: 112, format: "currency" },
  { key: "createdAt", header: "Created", width: 150, format: "date", accessor: (row) => new Date(row.createdAt) },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function readValue<T>(row: T, column: SortableColumn<T>): SortableValue {
  if (typeof column.accessor === "function") return column.accessor(row);
  const key = (column.accessor ?? column.key) as keyof T;
  return (row as Record<keyof T, unknown>)[key] as SortableValue;
}

function compareValues(a: SortableValue, b: SortableValue) {
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function pageList(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((page, i) => {
    if (i > 0 && page - sorted[i - 1] > 1) out.push("gap");
    out.push(page);
  });
  return out;
}

const noopSubscribe = () => () => {};

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-[#ec5c13]/45 focus-visible:ring-offset-0";

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function SortableTable<T = Deployment>({
  columns: columnsProp,
  rows: rowsProp,
  getRowId,
  getRowLabel,
  caption = "Deployments",
  title = "Deployments",
  itemLabel = "deployments",
  searchPlaceholder = "Search deployments",
  pageSizeOptions = [5, 10, 20, 50],
  defaultPageSize = 10,
  defaultSort = [],
  defaultSelectedIds,
  multiSort = true,
  selectable = true,
  onSelectionChange,
  onSortChange,
  loading = false,
  maxBodyHeight = 520,
  locale = "en-US",
  currency = "USD",
  timeZone = "UTC",
  className,
  theme = "auto",
  enableAnimations = true,
}: SortableTableProps<T>) {
  const columns = useMemo(
    () => columnsProp ?? (SORTABLE_TABLE_SAMPLE_COLUMNS as unknown as SortableColumn<T>[]),
    [columnsProp]
  );
  const rows = useMemo(() => rowsProp ?? (SORTABLE_TABLE_SAMPLE_ROWS as unknown as T[]), [rowsProp]);

  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const { resolvedTheme } = useTheme();
  const forcedTheme = theme === "auto" ? undefined : theme;
  const detectedIsDark = useBjorkTableIsDark(resolvedTheme, forcedTheme);
  const isDark = !mounted && theme === "auto" ? true : detectedIsDark;
  const palette = getBjorkTablePalette(isDark);
  const reduceMotion = useReducedMotion();
  const shouldAnimate = enableAnimations && !reduceMotion;

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortRule[]>(defaultSort);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(defaultSelectedIds));
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key))
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [entered, setEntered] = useState(false);

  const uid = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const { width: regionWidth } = useElementSize(regionRef);

  useEffect(() => {
    // Rows mounted after the first commit (paging, sorting) appear instantly.
    const id = window.setTimeout(() => setEntered(true), 50);
    return () => window.clearTimeout(id);
  }, []);

  const pageSizes = useMemo(
    () => [...new Set([...pageSizeOptions, pageSize])].sort((a, b) => a - b),
    [pageSizeOptions, pageSize]
  );

  const visibleColumns = useMemo(() => columns.filter((c) => !hidden.has(c.key)), [columns, hidden]);

  const formatters = useMemo(() => {
    const number = new Intl.NumberFormat(locale);
    const date = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    });
    const currencies = new Map<string, Intl.NumberFormat>();
    const money = (code: string) => {
      let f = currencies.get(code);
      if (!f) {
        f = new Intl.NumberFormat(locale, { style: "currency", currency: code });
        currencies.set(code, f);
      }
      return f;
    };
    return { number, date, money };
  }, [locale, timeZone]);

  const formatValue = useCallback(
    (value: SortableValue, column: SortableColumn<T>) => {
      if (value === null || value === undefined || value === "") return "—";
      switch (column.format) {
        case "number":
          return typeof value === "number" ? formatters.number.format(value) : String(value);
        case "currency":
          return typeof value === "number"
            ? formatters.money(column.currency ?? currency).format(value)
            : String(value);
        case "date": {
          const d = value instanceof Date ? value : new Date(String(value));
          return Number.isNaN(d.getTime()) ? String(value) : formatters.date.format(d);
        }
        default:
          return value instanceof Date ? formatters.date.format(value) : String(value);
      }
    },
    [currency, formatters]
  );

  const rowId = useCallback(
    (row: T, index: number) =>
      getRowId ? getRowId(row, index) : String((row as { id?: unknown }).id ?? index),
    [getRowId]
  );

  const trimmedQuery = query.trim();
  const filtered = useMemo(() => {
    const indexed = rows.map((row, index) => ({ row, id: rowId(row, index) }));
    if (!trimmedQuery) return indexed;
    const needle = trimmedQuery.toLowerCase();
    const searchable = visibleColumns.filter((c) => c.searchable !== false);
    return indexed.filter(({ row }) =>
      searchable.some((column) => {
        const value = readValue(row, column);
        if (value === null || value === undefined) return false;
        const raw = value instanceof Date ? "" : String(value).toLowerCase();
        return raw.includes(needle) || formatValue(value, column).toLowerCase().includes(needle);
      })
    );
  }, [rows, rowId, trimmedQuery, visibleColumns, formatValue]);

  const sorted = useMemo(() => {
    const rules = sort
      .map((rule) => ({ rule, column: columns.find((c) => c.key === rule.key) }))
      .filter((r): r is { rule: SortRule; column: SortableColumn<T> } => Boolean(r.column));
    if (!rules.length) return filtered;
    return [...filtered].sort((a, b) => {
      for (const { rule, column } of rules) {
        const diff = compareValues(readValue(a.row, column), readValue(b.row, column));
        if (diff !== 0) return rule.direction === "asc" ? diff : -diff;
      }
      return 0;
    });
  }, [filtered, sort, columns]);

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);
  const rangeLabel =
    total === 0
      ? `0 of 0`
      : `${formatters.number.format(start + 1)}–${formatters.number.format(start + pageRows.length)} of ${formatters.number.format(total)}`;

  const pageIds = pageRows.map((r) => r.id);
  const selectedOnPage = pageIds.filter((id) => selected.has(id)).length;
  const allOnPage = pageIds.length > 0 && selectedOnPage === pageIds.length;
  const someOnPage = selectedOnPage > 0 && !allOnPage;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someOnPage;
  }, [someOnPage]);

  const updateSelection = (next: Set<string>) => {
    setSelected(next);
    onSelectionChange?.([...next]);
  };

  const toggleRow = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    updateSelection(next);
  };

  const toggleAllOnPage = () => {
    const next = new Set(selected);
    if (allOnPage) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    updateSelection(next);
  };

  const cycleSort = (key: string, additive: boolean) => {
    const existing = sort.find((r) => r.key === key);
    const nextDirection: SortDirection | null = !existing
      ? "asc"
      : existing.direction === "asc"
        ? "desc"
        : null;
    let next: SortRule[];
    if (additive && multiSort) {
      next = nextDirection
        ? existing
          ? sort.map((r) => (r.key === key ? { key, direction: nextDirection } : r))
          : [...sort, { key, direction: nextDirection }]
        : sort.filter((r) => r.key !== key);
    } else {
      next = nextDirection ? [{ key, direction: nextDirection }] : [];
    }
    setSort(next);
    setPage(1);
    onSortChange?.(next);
  };

  const toggleColumn = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (columns.length - next.size > 1) next.add(key);
      return next;
    });
  };

  const clearSearch = () => {
    setQuery("");
    setPage(1);
    searchRef.current?.focus();
  };

  // Columns menu: close on outside pointer and Escape, focus the first option on open.
  useEffect(() => {
    if (!menuOpen) return;
    const first = menuRef.current?.querySelector<HTMLInputElement>("input:not(:disabled)");
    first?.focus();
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || menuButtonRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const columnWidth = (column: SortableColumn<T>) =>
    column.width === undefined ? 140 : typeof column.width === "number" ? column.width : column.width;
  const minTableWidth =
    (selectable ? 44 : 0) +
    visibleColumns.reduce((sum, c) => sum + (typeof c.width === "number" ? c.width : 140), 0);

  const alignOf = (column: SortableColumn<T>) =>
    column.align ??
    (column.format === "number" || column.format === "currency" || column.format === "date" ? "right" : "left");

  const inputTone = isDark
    ? "border-[#232323] bg-[#181818] text-[#ededed]/90 placeholder:text-[#ededed]/30"
    : "border-[#eadfce] bg-[#fffcf6] text-[#171717]/86 placeholder:text-[#171717]/40 shadow-[var(--bjork-shadow-soft)]";
  const skeletonTone = isDark ? "bg-[#ededed]/[0.06]" : "bg-[#171717]/[0.06]";
  const colSpan = visibleColumns.length + (selectable ? 1 : 0);
  const selectedCount = selected.size;

  return (
    <div className={cn("mx-auto w-full max-w-[1100px] text-[13px]", className)}>
      <div className={cn("relative overflow-hidden rounded-[18px] border", palette.container)}>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 px-4 pb-3 pt-3.5">
          <div className="flex min-w-0 flex-1 basis-[180px] items-baseline gap-2">
            {selectedCount > 0 ? (
              <>
                <span className={cn("font-medium tabular-nums", palette.accent)}>
                  {formatters.number.format(selectedCount)} selected
                </span>
                <button
                  type="button"
                  onClick={() => updateSelection(new Set())}
                  className={cn("rounded text-[12px] underline-offset-2 hover:underline", palette.secondaryText, focusRing)}
                >
                  Clear
                </button>
              </>
            ) : (
              <>
                <span className={cn("truncate text-[14px] font-medium", palette.primaryText)}>{title}</span>
                <span className={cn("tabular-nums", palette.secondaryText)}>
                  {loading ? "—" : formatters.number.format(rows.length)}
                </span>
              </>
            )}
          </div>

          <div className="flex w-full items-center gap-2 sm:w-auto">
            <label className="relative min-w-0 flex-1 sm:w-[240px] sm:flex-none">
              <span className="sr-only">{searchPlaceholder}</span>
              <Search
                aria-hidden
                className={cn("pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2", palette.secondaryText)}
              />
              <input
                ref={searchRef}
                type="search"
                value={query}
                placeholder={searchPlaceholder}
                aria-controls={`${uid}-table`}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && query) {
                    event.preventDefault();
                    setQuery("");
                    setPage(1);
                  }
                }}
                className={cn(
                  "h-8 w-full rounded-[9px] border pl-8 pr-8 text-[13px] [&::-webkit-search-cancel-button]:appearance-none",
                  inputTone,
                  focusRing
                )}
              />
              {query ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={clearSearch}
                  className={cn(
                    "absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md",
                    palette.secondaryText,
                    palette.menuItem,
                    focusRing
                  )}
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </label>

            <div className="relative">
              <button
                ref={menuButtonRef}
                type="button"
                aria-haspopup="true"
                aria-expanded={menuOpen}
                aria-controls={`${uid}-columns`}
                onClick={() => setMenuOpen((open) => !open)}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-[9px] border px-2.5 text-[13px] transition-colors",
                  palette.control,
                  focusRing
                )}
              >
                <Columns3 aria-hidden className="h-3.5 w-3.5" />
                <span>Columns</span>
                {hidden.size > 0 ? (
                  <span className={cn("rounded px-1 text-[11px] tabular-nums", palette.accentBg, palette.accent)}>
                    {columns.length - hidden.size}/{columns.length}
                  </span>
                ) : null}
              </button>
              <AnimatePresence>
                {menuOpen ? (
                  <motion.div
                    ref={menuRef}
                    id={`${uid}-columns`}
                    role="group"
                    aria-label="Visible columns"
                    initial={shouldAnimate ? { opacity: 0, y: -4 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    exit={shouldAnimate ? { opacity: 0, y: -4, transition: { duration: 0.12 } } : { opacity: 0, transition: { duration: 0 } }}
                    transition={{ type: "spring", stiffness: 520, damping: 34 }}
                    className={cn("absolute right-0 z-30 mt-1.5 w-52 rounded-[12px] border p-1", palette.menu)}
                  >
                    <div className={cn("px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-[0.08em]", palette.secondaryText)}>
                      Show columns
                    </div>
                    {columns.map((column) => {
                      const isVisible = !hidden.has(column.key);
                      const locked =
                        column.hideable === false || (isVisible && columns.length - hidden.size <= 1);
                      return (
                        <label
                          key={column.key}
                          className={cn(
                            "flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 text-[13px]",
                            palette.menuItem,
                            locked && "cursor-not-allowed opacity-50"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isVisible}
                            disabled={locked}
                            onChange={() => toggleColumn(column.key)}
                            className={cn("h-3.5 w-3.5 rounded", focusRing)}
                            style={{ accentColor: palette.checkboxAccent }}
                          />
                          {column.header}
                        </label>
                      );
                    })}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Table */}
        <div
          ref={regionRef}
          role="region"
          aria-label={`${caption} table`}
          tabIndex={0}
          className={cn("overflow-auto border-t", palette.divider, focusRing, "focus-visible:ring-inset")}
          style={{ maxHeight: maxBodyHeight }}
        >
          <table
            id={`${uid}-table`}
            aria-busy={loading || undefined}
            aria-rowcount={loading ? undefined : total + 1}
            className="w-full table-fixed border-separate border-spacing-0"
            style={{ minWidth: minTableWidth }}
          >
            <caption className="sr-only">
              {caption}
              {sort.length
                ? `, sorted by ${sort
                    .map((r) => `${columns.find((c) => c.key === r.key)?.header ?? r.key} ${r.direction === "asc" ? "ascending" : "descending"}`)
                    .join(", then ")}`
                : ""}
              {multiSort ? ". Shift-click a column header to add it to the sort." : ""}
            </caption>
            <colgroup>
              {selectable ? <col style={{ width: 44 }} /> : null}
              {visibleColumns.map((column) => (
                <col key={column.key} style={{ width: columnWidth(column) }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {selectable ? (
                  <th
                    scope="col"
                    className={cn("sticky top-0 z-[2] border-b px-0 py-0 text-center", palette.header)}
                  >
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      aria-label="Select all rows on this page"
                      checked={allOnPage}
                      disabled={loading || pageIds.length === 0}
                      onChange={toggleAllOnPage}
                      className={cn("relative top-[1px] h-3.5 w-3.5 cursor-pointer rounded", focusRing)}
                      style={{ accentColor: palette.checkboxAccent }}
                    />
                  </th>
                ) : null}
                {visibleColumns.map((column) => {
                  const align = alignOf(column);
                  const ruleIndex = sort.findIndex((r) => r.key === column.key);
                  const rule = ruleIndex >= 0 ? sort[ruleIndex] : undefined;
                  const canSort = column.sortable !== false;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={rule ? (rule.direction === "asc" ? "ascending" : "descending") : canSort ? "none" : undefined}
                      className={cn(
                        "sticky top-0 z-[1] h-10 border-b px-3 text-[11px] font-medium uppercase tracking-[0.08em]",
                        palette.header,
                        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
                      )}
                    >
                      {canSort ? (
                        <button
                          type="button"
                          onClick={(event: ReactMouseEvent) => cycleSort(column.key, event.shiftKey)}
                          className={cn(
                            "group/sort -mx-1.5 inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-1 uppercase tracking-[0.08em] transition-colors",
                            align === "right" && "flex-row-reverse",
                            rule ? palette.primaryText : isDark ? "hover:text-[#ededed]/80" : "hover:text-[#171717]/86",
                            focusRing
                          )}
                        >
                          <span className="truncate">{column.header}</span>
                          <SortGlyph
                            direction={rule?.direction}
                            order={sort.length > 1 && rule ? ruleIndex + 1 : undefined}
                            animate={shouldAnimate}
                            accent={palette.accent}
                          />
                        </button>
                      ) : (
                        <span className="truncate">{column.header}</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: Math.min(pageSize, 10) }, (_, i) => (
                    <tr key={`skeleton-${i}`} aria-hidden>
                      {selectable ? (
                        <td className={cn("h-12 border-b", palette.divider)}>
                          <span className={cn("mx-auto block h-3.5 w-3.5 rounded", skeletonTone)} />
                        </td>
                      ) : null}
                      {visibleColumns.map((column, c) => (
                        <td key={column.key} className={cn("h-12 border-b px-3", palette.divider)}>
                          <span
                            className={cn(
                              "block h-2.5 rounded-full",
                              skeletonTone,
                              shouldAnimate && "animate-pulse",
                              alignOf(column) === "right" && "ml-auto"
                            )}
                            style={{ width: `${38 + ((i * 7 + c * 13) % 45)}%`, animationDelay: `${(i + c) * 60}ms` }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))
                : pageRows.map(({ row, id }, i) => {
                    const isSelected = selected.has(id);
                    return (
                      <motion.tr
                        key={id}
                        initial={shouldAnimate && !entered ? { opacity: 0, y: 6 } : false}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: "spring", stiffness: 420, damping: 34, delay: shouldAnimate && !entered ? i * 0.03 : 0 }}
                        aria-selected={selectable ? isSelected : undefined}
                        className={cn(
                          "transition-colors duration-150",
                          isSelected ? palette.selectedRow : palette.row
                        )}
                      >
                        {selectable ? (
                          <td className={cn("relative h-12 border-b text-center", palette.divider)}>
                            {isSelected ? (
                              <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-[#ec5c13]" />
                            ) : null}
                            <input
                              type="checkbox"
                              aria-label={`Select ${
                                getRowLabel
                                  ? getRowLabel(row)
                                  : columns[0]
                                    ? `${formatValue(readValue(row, columns[0]), columns[0])} ${id}`
                                    : `row ${start + i + 1}`
                              }`}
                              checked={isSelected}
                              onChange={() => toggleRow(id)}
                              className={cn("relative top-[1px] h-3.5 w-3.5 cursor-pointer rounded", focusRing)}
                              style={{ accentColor: palette.checkboxAccent }}
                            />
                          </td>
                        ) : null}
                        {visibleColumns.map((column) => {
                          const value = readValue(row, column);
                          const formatted = formatValue(value, column);
                          const align = alignOf(column);
                          const numeric = column.format && column.format !== "text";
                          return (
                            <td
                              key={column.key}
                              className={cn(
                                "h-12 border-b px-3 align-middle",
                                palette.divider,
                                palette.primaryText,
                                align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
                                numeric && "tabular-nums"
                              )}
                            >
                              {column.cell ? (
                                column.cell(row, { value, formatted, isDark })
                              ) : (
                                <span className="block truncate">{formatted}</span>
                              )}
                            </td>
                          );
                        })}
                      </motion.tr>
                    );
                  })}
              {!loading && total === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="p-0">
                    {/* Pinned to the visible scroll viewport so it stays centered on wide tables. */}
                    <div className="sticky left-0 px-6 py-14 text-center" style={{ width: regionWidth || "100%" }}>
                    <div className="mx-auto flex max-w-[320px] flex-col items-center gap-3">
                      <span
                        aria-hidden
                        className={cn("flex h-10 w-10 items-center justify-center rounded-full border", palette.divider, palette.mutedSurface)}
                      >
                        <Search className={cn("h-4 w-4", palette.secondaryText)} />
                      </span>
                      <p className={cn("text-[14px] font-medium", palette.primaryText)}>
                        {trimmedQuery ? (
                          <>
                            No results for <span className={palette.accent}>&lsquo;{trimmedQuery}&rsquo;</span>
                          </>
                        ) : (
                          `No ${itemLabel} yet`
                        )}
                      </p>
                      <p className={cn("text-[12px]", palette.secondaryText)}>
                        {trimmedQuery
                          ? "Try a shorter term, or search a column that is currently visible."
                          : `New ${itemLabel} will show up here.`}
                      </p>
                      {trimmedQuery ? (
                        <button
                          type="button"
                          onClick={clearSearch}
                          className={cn("mt-1 h-8 rounded-[9px] border px-3 text-[13px] transition-colors", palette.control, focusRing)}
                        >
                          Clear search
                        </button>
                      ) : null}
                    </div>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <nav
          aria-label="Pagination"
          className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 border-t px-4 py-3", palette.divider)}
        >
          <div className="flex items-center gap-3">
            <p aria-live="polite" className={cn("min-w-[9ch] tabular-nums", palette.secondaryText)}>
              {loading ? "Loading…" : rangeLabel}
              <span className="sr-only"> {itemLabel}</span>
            </p>
            <label className={cn("flex items-center gap-2", palette.secondaryText)}>
              <span className="hidden sm:inline">Rows</span>
              <span className="sr-only sm:hidden">Rows per page</span>
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
                className={cn("h-7 cursor-pointer rounded-[8px] border px-1.5 text-[12px] tabular-nums", palette.control, focusRing)}
              >
                {pageSizes.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-1">
            <PagerButton
              label="Previous page"
              disabled={loading || currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
              className={palette.control}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </PagerButton>
            {pageList(currentPage, pageCount).map((item, i) =>
              item === "gap" ? (
                <span key={`gap-${i}`} aria-hidden className={cn("w-5 text-center", palette.secondaryText)}>
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  aria-label={`Page ${item}`}
                  aria-current={item === currentPage ? "page" : undefined}
                  disabled={loading}
                  onClick={() => setPage(item)}
                  className={cn(
                    "h-7 min-w-7 rounded-[8px] border px-1.5 text-[12px] tabular-nums transition-colors disabled:opacity-40",
                    item === currentPage
                      ? cn(palette.accentBg, palette.accentBorder, palette.accent, "font-medium")
                      : cn("border-transparent", palette.secondaryText, palette.menuItem),
                    focusRing
                  )}
                >
                  {item}
                </button>
              )
            )}
            <PagerButton
              label="Next page"
              disabled={loading || currentPage >= pageCount}
              onClick={() => setPage(currentPage + 1)}
              className={palette.control}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </PagerButton>
          </div>
        </nav>
      </div>
    </div>
  );
}

function PagerButton({
  label,
  disabled,
  onClick,
  className,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  className: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-[8px] border transition-colors disabled:cursor-not-allowed disabled:opacity-35",
        className,
        focusRing
      )}
    >
      {children}
    </button>
  );
}

function SortGlyph({
  direction,
  order,
  animate,
  accent,
}: {
  direction?: SortDirection;
  order?: number;
  animate: boolean;
  accent: string;
}) {
  const style: CSSProperties = { width: 12, height: 12 };
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center gap-0.5">
      {direction ? (
        <motion.span
          key={direction}
          initial={animate ? { opacity: 0, y: direction === "asc" ? 3 : -3 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 600, damping: 30 }}
          className={cn("inline-flex", accent)}
        >
          {direction === "asc" ? <ArrowUp style={style} /> : <ArrowDown style={style} />}
        </motion.span>
      ) : (
        <span className="inline-flex flex-col opacity-0 transition-opacity group-hover/sort:opacity-50 group-focus-visible/sort:opacity-50">
          <ArrowUp style={style} />
        </span>
      )}
      {order ? <span className={cn("text-[10px] tabular-nums", accent)}>{order}</span> : null}
    </span>
  );
}
