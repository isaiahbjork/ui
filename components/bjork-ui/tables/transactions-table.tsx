"use client";

import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTheme } from "next-themes";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Clock3,
  CreditCard,
  Landmark,
  Receipt,
  Undo2,
  Wallet,
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

export type TransactionStatus = "paid" | "pending" | "refunded" | "failed" | "disputed";
export type TransactionFilter = TransactionStatus | "all";

export interface TransactionLineItem {
  name: string;
  quantity: number;
  /** Price of one unit in minor units (cents). */
  unitAmount: number;
}

export interface TransactionPaymentMethod {
  kind: "credit" | "debit" | "bank" | "wallet";
  last4: string;
  /** Overrides the generated label, e.g. "Corporate card". */
  label?: string;
}

export interface Transaction {
  id: string;
  orderId: string;
  /** ISO timestamp. */
  createdAt: string;
  customer: { name: string; email: string };
  /** Amount in minor units (cents). Negative for refunds. */
  amount: number;
  /** ISO 4217 code. */
  currency: string;
  status: TransactionStatus;
  method: TransactionPaymentMethod;
  items: TransactionLineItem[];
  /** Shipping in minor units, shown in the detail row. */
  shipping?: number;
  /** Context line in the detail row, e.g. a decline reason or dispute deadline. */
  note?: string;
}

export interface TransactionsTableProps {
  transactions?: Transaction[];
  title?: string;
  caption?: string;
  loading?: boolean;
  /** Reference time for Today / Yesterday grouping. Defaults to the current time. */
  now?: Date | string;
  /** Time zone used for day grouping and times. Defaults to UTC so server and client agree. */
  timeZone?: string;
  locale?: string;
  defaultFilter?: TransactionFilter;
  defaultExpandedIds?: string[];
  selectedId?: string | null;
  onTransactionSelect?: (transaction: Transaction) => void;
  onFilterChange?: (filter: TransactionFilter) => void;
  /** Body scrolls under a sticky header past this height (px). */
  maxBodyHeight?: number;
  className?: string;
  theme?: BjorkTableThemeMode;
  enableAnimations?: boolean;
}

/* ------------------------------------------------------------------ */
/* Sample data                                                         */
/* ------------------------------------------------------------------ */

export const TRANSACTIONS_SAMPLE_NOW = "2026-10-08T18:30:00Z";

const item = (name: string, quantity: number, unitAmount: number): TransactionLineItem => ({
  name,
  quantity,
  unitAmount,
});

export const TRANSACTIONS_SAMPLE: Transaction[] = [
  {
    id: "txn_9f2c41",
    orderId: "#KS-2418",
    createdAt: "2026-10-08T17:52:00Z",
    customer: { name: "Mara Lindqvist", email: "mara.l@fernpost.io" },
    amount: 12_850,
    currency: "USD",
    status: "paid",
    method: { kind: "credit", last4: "4419" },
    items: [item("Ash glaze mug, 12 oz", 2, 3_400), item("Pour-over kettle, matte", 1, 5_200)],
    shipping: 850,
  },
  {
    id: "txn_9f2b77",
    orderId: "#KS-2417",
    createdAt: "2026-10-08T16:31:00Z",
    customer: { name: "Tobi Achterberg", email: "tobi@orchardline.co" },
    amount: 6_400,
    currency: "USD",
    status: "pending",
    method: { kind: "bank", last4: "0917" },
    items: [item("Linen apron, rust", 1, 5_600)],
    shipping: 800,
    note: "Bank transfer clears in 1–2 business days.",
  },
  {
    id: "txn_9f2a03",
    orderId: "#KS-2416",
    createdAt: "2026-10-08T14:08:00Z",
    customer: { name: "Priya Ramaswell", email: "priya.r@kelpmail.com" },
    amount: 24_200,
    currency: "USD",
    status: "paid",
    method: { kind: "debit", last4: "2087" },
    items: [
      item("Stoneware dinner set, 4 pc", 1, 18_800),
      item("Walnut serving board", 1, 4_600),
    ],
    shipping: 800,
  },
  {
    id: "txn_9f1e58",
    orderId: "#KS-2409",
    createdAt: "2026-10-08T11:46:00Z",
    customer: { name: "Jonah Feldmore", email: "jonah@quietfield.studio" },
    amount: -4_800,
    currency: "USD",
    status: "refunded",
    method: { kind: "credit", last4: "7731" },
    items: [item("Speckled bowl, large", 2, 2_400)],
    note: "Refunded to Credit •• 7731. Arrived chipped, customer kept the set.",
  },
  {
    id: "txn_9f1c22",
    orderId: "#KS-2415",
    createdAt: "2026-10-08T09:15:00Z",
    customer: { name: "Elise Okonkwo-Hart", email: "elise@bramblemade.com" },
    amount: 3_900,
    currency: "USD",
    status: "failed",
    method: { kind: "credit", last4: "0042" },
    items: [item("Beeswax candle, tall", 3, 1_300)],
    note: "Declined by issuer: insufficient funds. Customer was emailed a retry link.",
  },
  {
    id: "txn_9e8d90",
    orderId: "#KS-2414",
    createdAt: "2026-10-07T21:03:00Z",
    customer: { name: "Wren Castellano", email: "wren.c@tidewater.app" },
    amount: 15_600,
    currency: "USD",
    status: "disputed",
    method: { kind: "credit", last4: "5508" },
    items: [item("Hand-thrown vase, celadon", 1, 14_800)],
    shipping: 800,
    note: "Reason: item not received. Evidence due Oct 15.",
  },
  {
    id: "txn_9e8a41",
    orderId: "#KS-2413",
    createdAt: "2026-10-07T18:27:00Z",
    customer: { name: "Dario Mbeki-Lund", email: "dario@northloam.net" },
    amount: 8_850,
    currency: "USD",
    status: "paid",
    method: { kind: "wallet", last4: "6612" },
    items: [item("Ash glaze mug, 12 oz", 1, 3_400), item("Linen tea towel set", 1, 4_650)],
    shipping: 800,
  },
  {
    id: "txn_9e7f12",
    orderId: "#KS-2412",
    createdAt: "2026-10-07T13:40:00Z",
    customer: { name: "Hana Sorvari", email: "hana@pinecone.works" },
    amount: 4_200,
    currency: "USD",
    status: "paid",
    method: { kind: "debit", last4: "3390" },
    items: [item("Ceramic pour-over cone", 1, 3_400)],
    shipping: 800,
  },
  {
    id: "txn_9d3301",
    orderId: "#KS-2405",
    createdAt: "2026-10-05T16:12:00Z",
    customer: { name: "Mara Lindqvist", email: "mara.l@fernpost.io" },
    amount: 31_500,
    currency: "USD",
    status: "paid",
    method: { kind: "credit", last4: "4419" },
    items: [item("Stoneware dinner set, 4 pc", 1, 18_800), item("Speckled bowl, large", 5, 2_400), item("Walnut serving board", 1, 0)],
    shipping: 700,
    note: "Walnut board added as a free gift.",
  },
  {
    id: "txn_9d2e76",
    orderId: "#KS-2403",
    createdAt: "2026-10-05T10:58:00Z",
    customer: { name: "Teo Valdivia", email: "teo@saltbox.supply" },
    amount: -2_600,
    currency: "USD",
    status: "refunded",
    method: { kind: "wallet", last4: "1874" },
    items: [item("Beeswax candle, tall", 2, 1_300)],
    note: "Partial refund: wrong scent shipped.",
  },
  {
    id: "txn_9c1a09",
    orderId: "#KS-2398",
    createdAt: "2026-10-03T19:44:00Z",
    customer: { name: "Ines Halloran", email: "ines@copperleaf.org" },
    amount: 9_300,
    currency: "USD",
    status: "paid",
    method: { kind: "credit", last4: "9925" },
    items: [item("Linen apron, rust", 1, 5_600), item("Ash glaze mug, 12 oz", 1, 3_400)],
    shipping: 300,
  },
  {
    id: "txn_9c0f44",
    orderId: "#KS-2396",
    createdAt: "2026-10-03T08:20:00Z",
    customer: { name: "Rafe Oyelaran", email: "rafe@gristmill.dev" },
    amount: 5_600,
    currency: "USD",
    status: "pending",
    method: { kind: "bank", last4: "4410" },
    items: [item("Linen apron, rust", 1, 5_600)],
    note: "Awaiting bank confirmation.",
  },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const STATUS_META: Record<
  TransactionStatus,
  { label: string; tone: "green" | "orange" | "red" | "neutral"; icon: LucideIcon }
> = {
  paid: { label: "Paid", tone: "green", icon: Check },
  pending: { label: "Pending", tone: "neutral", icon: Clock3 },
  refunded: { label: "Refunded", tone: "neutral", icon: Undo2 },
  failed: { label: "Failed", tone: "red", icon: X },
  disputed: { label: "Disputed", tone: "orange", icon: AlertTriangle },
};

const FILTERS: TransactionFilter[] = ["all", "paid", "pending", "refunded", "failed", "disputed"];

const EMPTY_COPY: Record<TransactionFilter, [string, string]> = {
  all: ["No transactions yet", "Orders show up here as soon as they come in."],
  paid: ["No paid transactions", "Completed charges will land here."],
  pending: ["Nothing pending", "Every payment in this period has settled."],
  refunded: ["No refunds", "Nothing has been returned in this period."],
  failed: ["No failed payments", "Every charge in this period went through."],
  disputed: ["No open disputes", "Nothing needs a response right now."],
};

const METHOD_META: Record<TransactionPaymentMethod["kind"], { label: string; icon: LucideIcon }> = {
  credit: { label: "Credit", icon: CreditCard },
  debit: { label: "Debit", icon: CreditCard },
  bank: { label: "Bank", icon: Landmark },
  wallet: { label: "Wallet", icon: Wallet },
};

const moneyCache = new Map<string, Intl.NumberFormat>();
function formatMoney(minor: number, currency: string, locale: string) {
  const key = `${locale}|${currency}`;
  let formatter = moneyCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { style: "currency", currency });
    moneyCache.set(key, formatter);
  }
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(minor / 10 ** digits);
}

const noopSubscribe = () => () => {};
const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[#ec5c13]/45";

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function TransactionsTable({
  transactions = TRANSACTIONS_SAMPLE,
  title = "Transactions",
  caption = "Transaction history",
  loading = false,
  now,
  timeZone = "UTC",
  locale = "en-US",
  defaultFilter = "all",
  defaultExpandedIds = [],
  selectedId: selectedIdProp,
  onTransactionSelect,
  onFilterChange,
  maxBodyHeight = 560,
  className,
  theme = "auto",
  enableAnimations = true,
}: TransactionsTableProps) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const { resolvedTheme } = useTheme();
  const forcedTheme = theme === "auto" ? undefined : theme;
  const detectedIsDark = useBjorkTableIsDark(resolvedTheme, forcedTheme);
  const isDark = !mounted && theme === "auto" ? true : detectedIsDark;
  const palette = getBjorkTablePalette(isDark);
  const reduceMotion = useReducedMotion();
  const shouldAnimate = enableAnimations && !reduceMotion;

  const [filter, setFilter] = useState<TransactionFilter>(defaultFilter);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(defaultExpandedIds));
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const selectedId = selectedIdProp !== undefined ? selectedIdProp : internalSelected;
  const [entered, setEntered] = useState(false);
  const [instantExpand, setInstantExpand] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(rootRef);
  const compact = width > 0 && width < 760;

  const uid = useId();
  const tabRefs = useRef(new Map<TransactionFilter, HTMLButtonElement>());

  // Without an explicit `now`, the sample data stays anchored to its own day so the demo reads Today / Yesterday.
  const [clientNow] = useState(() => new Date());
  const reference = useMemo(
    () =>
      now !== undefined
        ? new Date(now)
        : transactions === TRANSACTIONS_SAMPLE
          ? new Date(TRANSACTIONS_SAMPLE_NOW)
          : clientNow,
    [now, transactions, clientNow]
  );

  useEffect(() => {
    const id = window.setTimeout(() => setEntered(true), 50);
    return () => window.clearTimeout(id);
  }, []);

  const counts = useMemo(() => {
    const result: Record<TransactionFilter, number> = {
      all: transactions.length,
      paid: 0,
      pending: 0,
      refunded: 0,
      failed: 0,
      disputed: 0,
    };
    transactions.forEach((t) => {
      result[t.status] += 1;
    });
    return result;
  }, [transactions]);

  const groups = useMemo(() => {
    const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    const dayLabel = new Intl.DateTimeFormat(locale, { timeZone, month: "short", day: "numeric" });
    const weekday = new Intl.DateTimeFormat(locale, { timeZone, weekday: "long" });
    const todayKey = dayKey.format(reference);
    const yesterdayKey = dayKey.format(new Date(reference.getTime() - 86_400_000));
    const visible = transactions
      .filter((t) => filter === "all" || t.status === filter)
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const map = new Map<string, { key: string; label: string; sub: string; rows: Transaction[] }>();
    visible.forEach((t) => {
      const date = new Date(t.createdAt);
      const key = dayKey.format(date);
      let group = map.get(key);
      if (!group) {
        const label = key === todayKey ? "Today" : key === yesterdayKey ? "Yesterday" : dayLabel.format(date);
        const sub = key === todayKey || key === yesterdayKey ? dayLabel.format(date) : weekday.format(date);
        group = { key, label, sub, rows: [] };
        map.set(key, group);
      }
      group.rows.push(t);
    });
    return [...map.values()];
  }, [transactions, filter, reference, timeZone, locale]);

  const timeFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { timeZone, hour: "numeric", minute: "2-digit" }),
    [locale, timeZone]
  );

  const chooseFilter = (next: TransactionFilter) => {
    setFilter(next);
    onFilterChange?.(next);
  };

  const onTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const index = FILTERS.indexOf(filter);
    let nextIndex = -1;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % FILTERS.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + FILTERS.length) % FILTERS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = FILTERS.length - 1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const next = FILTERS[nextIndex];
    chooseFilter(next);
    tabRefs.current.get(next)?.focus();
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const select = (transaction: Transaction) => {
    if (selectedIdProp === undefined) setInternalSelected(transaction.id);
    onTransactionSelect?.(transaction);
  };

  const columnCount = compact ? 3 : 7;
  const skeletonTone = isDark ? "bg-[#ededed]/[0.06]" : "bg-[#171717]/[0.06]";
  const animateIn = shouldAnimate && !entered;
  const tabId = (f: TransactionFilter) => `${uid}-tab-${f}`;
  const panelId = `${uid}-panel`;
  let rowIndex = 0;

  return (
    <div ref={rootRef} className={cn("mx-auto w-full max-w-[980px] text-[13px]", className)}>
      <div className={cn("overflow-hidden rounded-[18px] border", palette.container)}>
        {/* Header + filter tabs */}
        <div className="px-4 pt-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className={cn("text-[14px] font-medium", palette.primaryText)}>{title}</h3>
            <span className={cn("text-[12px] tabular-nums", palette.secondaryText)}>
              {loading ? "Loading…" : `${counts.all} ${counts.all === 1 ? "transaction" : "transactions"}`}
            </span>
          </div>
          <div
            role="tablist"
            aria-label="Filter by status"
            className="-mx-4 mt-3 flex gap-1 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {FILTERS.map((f) => {
              const active = f === filter;
              const label = f === "all" ? "All" : STATUS_META[f].label;
              return (
                <button
                  key={f}
                  ref={(node) => {
                    if (node) tabRefs.current.set(f, node);
                    else tabRefs.current.delete(f);
                  }}
                  id={tabId(f)}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={panelId}
                  tabIndex={active ? 0 : -1}
                  onClick={() => chooseFilter(f)}
                  onKeyDown={onTabKeyDown}
                  className={cn(
                    "relative flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] px-2.5 text-[13px] transition-colors",
                    active ? palette.primaryText : cn(palette.secondaryText, palette.menuItem),
                    focusRing
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId={shouldAnimate ? `${uid}-tab-pill` : undefined}
                      aria-hidden
                      transition={{ type: "spring", stiffness: 520, damping: 38 }}
                      className={cn("absolute inset-0 rounded-[9px] border", palette.mutedSurface, palette.divider)}
                    />
                  ) : null}
                  <span className="relative">{label}</span>
                  <span
                    className={cn(
                      "relative min-w-[18px] rounded-[6px] px-1 text-center text-[11px] tabular-nums",
                      active ? cn(palette.accentBg, palette.accent) : isDark ? "bg-[#ededed]/[0.05]" : "bg-[#171717]/[0.05]"
                    )}
                  >
                    {counts[f]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Table */}
        <div
          id={panelId}
          role="tabpanel"
          aria-labelledby={tabId(filter)}
          tabIndex={0}
          className={cn("overflow-auto border-t", palette.divider, focusRing, "focus-visible:ring-inset")}
          style={{ maxHeight: maxBodyHeight }}
        >
          <table
            className="w-full table-fixed border-separate border-spacing-0"
            style={{ minWidth: compact ? undefined : 740 }}
            aria-busy={loading || undefined}
          >
            <caption className="sr-only">
              {caption}, {filter === "all" ? "all statuses" : STATUS_META[filter].label}, grouped by day
            </caption>
            <colgroup>
              <col style={{ width: compact ? 36 : 44 }} />
              {compact ? (
                <>
                  <col />
                  <col style={{ width: 128 }} />
                </>
              ) : (
                <>
                  <col style={{ width: 112 }} />
                  <col />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 124 }} />
                  <col style={{ width: 92 }} />
                  <col style={{ width: 124 }} />
                </>
              )}
            </colgroup>
            <thead>
              <tr className="text-[11px] font-medium uppercase tracking-[0.08em]">
                <th scope="col" className={cn("sticky top-0 z-[1] h-9 border-b", palette.header)}>
                  <span className="sr-only">Details</span>
                </th>
                {compact ? (
                  <>
                    <th scope="col" className={cn("sticky top-0 z-[1] border-b px-2 text-left font-medium", palette.header)}>
                      Order
                    </th>
                    <th scope="col" className={cn("sticky top-0 z-[1] border-b px-4 text-right font-medium", palette.header)}>
                      Amount
                    </th>
                  </>
                ) : (
                  <>
                    {["Order", "Customer", "Method", "Status"].map((label) => (
                      <th
                        key={label}
                        scope="col"
                        className={cn("sticky top-0 z-[1] border-b px-3 text-left font-medium", palette.header)}
                      >
                        {label}
                      </th>
                    ))}
                    <th scope="col" className={cn("sticky top-0 z-[1] border-b px-3 text-right font-medium", palette.header)}>
                      Time
                    </th>
                    <th scope="col" className={cn("sticky top-0 z-[1] border-b px-4 text-right font-medium", palette.header)}>
                      Amount
                    </th>
                  </>
                )}
              </tr>
            </thead>

            {loading ? (
              <tbody aria-hidden>
                {Array.from({ length: 6 }, (_, i) => (
                  <tr key={i}>
                    {Array.from({ length: columnCount }, (_, c) => (
                      <td key={c} className={cn("h-[52px] border-b px-3", palette.divider)}>
                        {c === 0 ? null : (
                          <span
                            className={cn(
                              "block h-2.5 rounded-full",
                              skeletonTone,
                              shouldAnimate && "animate-pulse",
                              c === columnCount - 1 && "ml-auto"
                            )}
                            style={{ width: `${40 + ((i * 11 + c * 17) % 45)}%` }}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ) : groups.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={columnCount} className="px-6 py-14 text-center">
                    <div className="mx-auto flex max-w-[300px] flex-col items-center gap-2.5">
                      <span
                        aria-hidden
                        className={cn("flex h-10 w-10 items-center justify-center rounded-full border", palette.divider, palette.mutedSurface)}
                      >
                        <Receipt className={cn("h-4 w-4", palette.secondaryText)} />
                      </span>
                      <p className={cn("text-[14px] font-medium", palette.primaryText)}>{EMPTY_COPY[filter][0]}</p>
                      <p className={cn("text-[12px]", palette.secondaryText)}>{EMPTY_COPY[filter][1]}</p>
                      {filter !== "all" ? (
                        <button
                          type="button"
                          onClick={() => {
                            chooseFilter("all");
                            tabRefs.current.get("all")?.focus();
                          }}
                          className={cn("mt-1 h-8 rounded-[9px] border px-3 text-[13px] transition-colors", palette.control, focusRing)}
                        >
                          Show all transactions
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              </tbody>
            ) : (
              groups.map((group) => {
                const currency = group.rows[0]?.currency ?? "USD";
                const net = group.rows
                  .filter((t) => t.status !== "failed" && t.currency === currency)
                  .reduce((sum, t) => sum + t.amount, 0);
                return (
                  <tbody key={group.key}>
                    <tr>
                      <th
                        scope="rowgroup"
                        colSpan={columnCount - 1}
                        className={cn(
                          "h-9 border-b px-4 text-left text-[12px] font-medium",
                          palette.divider,
                          isDark ? "bg-[#141414]" : "bg-[#fdf9f2]"
                        )}
                      >
                        <span className={palette.primaryText}>{group.label}</span>
                        <span className={cn("ml-2 font-normal", palette.secondaryText)}>{group.sub}</span>
                      </th>
                      <td
                        className={cn(
                          "border-b px-4 text-right text-[12px] tabular-nums",
                          palette.divider,
                          palette.secondaryText,
                          isDark ? "bg-[#141414]" : "bg-[#fdf9f2]"
                        )}
                      >
                        <span className="sr-only">Net for {group.label}: </span>
                        <span aria-hidden className="mr-1.5 opacity-70">Net</span>
                        {formatMoney(net, currency, locale)}
                      </td>
                    </tr>
                    {group.rows.map((t) => {
                      const isOpen = expanded.has(t.id);
                      const isSelected = selectedId === t.id;
                      const status = STATUS_META[t.status];
                      const tone = getBjorkSignalPalette(status.tone, isDark);
                      const StatusIcon = status.icon;
                      const method = METHOD_META[t.method.kind];
                      const MethodIcon = method.icon;
                      const methodLabel = `${t.method.label ?? method.label} •• ${t.method.last4}`;
                      const detailId = `${uid}-detail-${t.id}`;
                      const delay = animateIn ? Math.min(rowIndex++, 12) * 0.035 : 0;
                      const amountText = formatMoney(t.amount, t.currency, locale);
                      const amountClass = cn(
                        "tabular-nums",
                        t.status === "failed"
                          ? cn("line-through decoration-1", palette.secondaryText)
                          : t.amount < 0
                            ? palette.secondaryText
                            : cn("font-medium", palette.primaryText)
                      );
                      const pill = (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[12px] font-medium",
                            tone.bgColor,
                            tone.borderColor,
                            tone.textColor
                          )}
                        >
                          <StatusIcon aria-hidden className="h-3 w-3" strokeWidth={2.25} />
                          {status.label}
                        </span>
                      );
                      const expandButton = (
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-controls={detailId}
                          aria-label={`${isOpen ? "Hide" : "Show"} details for order ${t.orderId}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setInstantExpand(event.detail === 0);
                            toggleExpanded(t.id);
                          }}
                          className={cn(
                            "mx-auto flex h-6 w-6 items-center justify-center rounded-md transition-colors",
                            palette.secondaryText,
                            palette.menuItem,
                            focusRing
                          )}
                        >
                          <ChevronRight
                            aria-hidden
                            className={cn(
                              "h-3.5 w-3.5",
                              shouldAnimate && "transition-transform duration-200",
                              isOpen && "rotate-90"
                            )}
                          />
                        </button>
                      );
                      const orderButton = (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            select(t);
                          }}
                          aria-label={`Open order ${t.orderId}, ${t.customer.name}, ${amountText}, ${status.label}`}
                          className={cn(
                            "rounded font-mono text-[12px] tracking-tight transition-colors",
                            isSelected ? palette.accent : palette.primaryText,
                            focusRing
                          )}
                        >
                          {t.orderId}
                        </button>
                      );
                      return (
                        <Fragment key={t.id}>
                          <motion.tr
                            initial={animateIn ? { opacity: 0, y: 6 } : false}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ type: "spring", stiffness: 420, damping: 34, delay }}
                            onClick={() => select(t)}
                            aria-selected={isSelected}
                            className={cn(
                              "cursor-pointer transition-colors duration-150",
                              isSelected ? palette.selectedRow : palette.row
                            )}
                          >
                            <td className={cn("relative h-[52px] border-b", palette.divider, isOpen && "border-b-transparent")}>
                              {isSelected ? (
                                <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-[#ec5c13]" />
                              ) : null}
                              {expandButton}
                            </td>
                            {compact ? (
                              <>
                                <td className={cn("border-b px-2 py-2.5", palette.divider, isOpen && "border-b-transparent")}>
                                  <div className="flex min-w-0 flex-col items-start gap-0.5">
                                    {orderButton}
                                    <span className={cn("max-w-full truncate text-[12px]", palette.secondaryText)}>
                                      {t.customer.name} · {timeFormat.format(new Date(t.createdAt))}
                                    </span>
                                  </div>
                                </td>
                                <td className={cn("border-b px-4 py-2.5 text-right", palette.divider, isOpen && "border-b-transparent")}>
                                  <div className="flex flex-col items-end gap-1">
                                    <span className={amountClass}>{amountText}</span>
                                    {pill}
                                  </div>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className={cn("border-b px-3", palette.divider, isOpen && "border-b-transparent")}>
                                  {orderButton}
                                </td>
                                <td className={cn("border-b px-3", palette.divider, isOpen && "border-b-transparent")}>
                                  <div className="flex min-w-0 flex-col">
                                    <span className={cn("truncate", palette.primaryText)}>{t.customer.name}</span>
                                    <span className={cn("truncate text-[12px]", palette.secondaryText)}>{t.customer.email}</span>
                                  </div>
                                </td>
                                <td className={cn("border-b px-3", palette.divider, palette.secondaryText, isOpen && "border-b-transparent")}>
                                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                    <MethodIcon aria-hidden className="h-3.5 w-3.5 opacity-70" />
                                    <span className="tabular-nums">{methodLabel}</span>
                                  </span>
                                </td>
                                <td className={cn("border-b px-3", palette.divider, isOpen && "border-b-transparent")}>{pill}</td>
                                <td
                                  className={cn(
                                    "border-b px-3 text-right tabular-nums",
                                    palette.divider,
                                    palette.secondaryText,
                                    isOpen && "border-b-transparent"
                                  )}
                                >
                                  <time dateTime={t.createdAt}>{timeFormat.format(new Date(t.createdAt))}</time>
                                </td>
                                <td className={cn("border-b px-4 text-right", palette.divider, isOpen && "border-b-transparent")}>
                                  <span className={amountClass}>{amountText}</span>
                                </td>
                              </>
                            )}
                          </motion.tr>
                          {isOpen ? (
                            <tr id={detailId} className={isSelected ? palette.selectedRow : undefined}>
                              <td className={cn("border-b", palette.divider)} />
                              <td colSpan={columnCount - 1} className={cn("border-b px-3 pb-4 pt-0", palette.divider, compact && "px-2 pr-4")}>
                                <TransactionDetail
                                  transaction={t}
                                  methodLabel={methodLabel}
                                  locale={locale}
                                  palette={palette}
                                  isDark={isDark}
                                  animate={shouldAnimate && !instantExpand}
                                />
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                );
              })
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

function TransactionDetail({
  transaction: t,
  methodLabel,
  locale,
  palette,
  isDark,
  animate,
}: {
  transaction: Transaction;
  methodLabel: string;
  locale: string;
  palette: ReturnType<typeof getBjorkTablePalette>;
  isDark: boolean;
  animate: boolean;
}) {
  const subtotal = t.items.reduce((sum, line) => sum + line.quantity * line.unitAmount, 0);
  const shipping = t.shipping ?? 0;
  const surface = isDark ? "bg-[#151515] border-[#232323]" : "bg-[#fbf6ec] border-[#efe4d3]";
  return (
    <motion.div
      initial={animate ? { opacity: 0, y: -4 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 480, damping: 36 }}
      className={cn("grid gap-4 rounded-[12px] border p-3.5 sm:grid-cols-[minmax(0,1fr)_200px]", surface)}
    >
      <div className="min-w-0">
        <p className={cn("mb-2 text-[11px] font-medium uppercase tracking-[0.08em]", palette.secondaryText)}>
          {t.items.length} {t.items.length === 1 ? "item" : "items"}
        </p>
        <ul className="space-y-1.5">
          {t.items.map((line, i) => (
            <li key={i} className="flex items-baseline gap-2">
              <span className={cn("w-6 shrink-0 tabular-nums", palette.secondaryText)}>{line.quantity}×</span>
              <span className={cn("min-w-0 flex-1 truncate", palette.primaryText)}>{line.name}</span>
              <span className={cn("shrink-0 tabular-nums", palette.primaryText)}>
                {line.unitAmount === 0 ? "Free" : formatMoney(line.quantity * line.unitAmount, t.currency, locale)}
              </span>
            </li>
          ))}
        </ul>
        {t.note ? <p className={cn("mt-3 text-[12px] leading-relaxed", palette.secondaryText)}>{t.note}</p> : null}
      </div>
      <dl className={cn("space-y-1.5 border-t pt-3 text-[12px] sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0", palette.divider)}>
        <div className="flex justify-between gap-3">
          <dt className={palette.secondaryText}>Subtotal</dt>
          <dd className={cn("tabular-nums", palette.primaryText)}>{formatMoney(subtotal, t.currency, locale)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className={palette.secondaryText}>Shipping</dt>
          <dd className={cn("tabular-nums", palette.primaryText)}>
            {shipping ? formatMoney(shipping, t.currency, locale) : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className={palette.secondaryText}>{t.amount < 0 ? "Refunded" : "Charged"}</dt>
          <dd className={cn("font-medium tabular-nums", palette.primaryText)}>{formatMoney(t.amount, t.currency, locale)}</dd>
        </div>
        <div className={cn("flex justify-between gap-3 border-t pt-1.5", palette.divider)}>
          <dt className={palette.secondaryText}>Method</dt>
          <dd className={cn("tabular-nums", palette.primaryText)}>{methodLabel}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className={palette.secondaryText}>Ref</dt>
          <dd className={cn("font-mono text-[11px]", palette.secondaryText)}>{t.id}</dd>
        </div>
      </dl>
    </motion.div>
  );
}
