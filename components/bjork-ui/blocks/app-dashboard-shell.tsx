"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SVGProps,
} from "react";
import {
  ArrowDown,
  ArrowDownRight,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  Bell,
  Blocks,
  ChartArea,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Download,
  FileText,
  LayoutDashboard,
  LifeBuoy,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  ShoppingBag,
  Table2,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import {
  BlockButton,
  BlockDrawer,
  IconButton,
  InitialsAvatar,
  Kbd,
  blockRoot,
  focusRing,
  useAnnouncer,
  useAppBlockTheme,
  useBlockReducedMotion,
  useElementWidth,
  type AppBlockTheme,
} from "@/components/bjork-ui/blocks/app-block-kit";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------------------------------------- */

export type DashboardRange = "7d" | "30d" | "90d" | "12m";

export type OrderStatus = "paid" | "pending" | "refunded" | "failed";

export interface DashboardOrder {
  id: string;
  customer: string;
  email: string;
  status: OrderStatus;
  channel: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  /** Minor units (cents). */
  amount: number;
}

export interface DashboardNavItem {
  id: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  badge?: string;
}

export interface DashboardNavGroup {
  label?: string;
  items: DashboardNavItem[];
}

export interface DashboardPoint {
  label: string;
  /** Short axis label. */
  tick: string;
  current: number;
  previous: number;
}

export interface DashboardKpi {
  id: string;
  label: string;
  value: number;
  previous: number;
  format: "currency" | "number" | "percent";
  /** For churn-like metrics a fall is good news. */
  lowerIsBetter?: boolean;
  spark: number[];
}

export interface DashboardSeries {
  points: DashboardPoint[];
  kpis: DashboardKpi[];
  channels: { label: string; value: number }[];
}

export interface AppDashboardShellProps {
  /** Workspace shown in the switcher. */
  workspace?: { name: string; plan: string };
  user?: { name: string; email: string };
  nav?: DashboardNavGroup[];
  /** Id of the active nav item. Uncontrolled if `onNavigate` is not handled. */
  defaultActive?: string;
  onNavigate?: (id: string) => void;
  orders?: DashboardOrder[];
  /** Data per range. Defaults to deterministic sample data. */
  getSeries?: (range: DashboardRange) => DashboardSeries;
  defaultRange?: DashboardRange;
  onRangeChange?: (range: DashboardRange) => void;
  defaultCollapsed?: boolean;
  currency?: string;
  locale?: string;
  theme?: AppBlockTheme;
  /** Skips the chart reveal; for static captures. */
  disableAnimation?: boolean;
  className?: string;
}

/* ----------------------------------------------------------------------------------------------------------
 * Sample data
 * -------------------------------------------------------------------------------------------------------- */

export const DASHBOARD_NAV: DashboardNavGroup[] = [
  {
    items: [
      { id: "overview", label: "Overview", icon: LayoutDashboard },
      { id: "analytics", label: "Analytics", icon: ChartNoAxesCombined },
      { id: "orders", label: "Orders", icon: ShoppingBag, badge: "12" },
      { id: "customers", label: "Customers", icon: Users },
      { id: "products", label: "Products", icon: Package },
      { id: "reports", label: "Reports", icon: FileText },
    ],
  },
  {
    label: "Workspace",
    items: [
      { id: "team", label: "Team", icon: UsersRound },
      { id: "integrations", label: "Integrations", icon: Blocks, badge: "New" },
      { id: "settings", label: "Settings", icon: Settings },
    ],
  },
];

export const DASHBOARD_ORDERS: DashboardOrder[] = [
  { id: "HL-48213", customer: "Maren Okafor", email: "maren@fieldnote.studio", status: "paid", channel: "Direct", date: "2026-10-08", amount: 248_00 },
  { id: "HL-48212", customer: "Tomás Reyes", email: "tomas@kilnworks.co", status: "pending", channel: "Partner", date: "2026-10-08", amount: 1_120_00 },
  { id: "HL-48211", customer: "Ines Halvorsen", email: "ines@northpier.no", status: "paid", channel: "Organic", date: "2026-10-07", amount: 89_00 },
  { id: "HL-48210", customer: "Dev Raman", email: "dev@quietloop.io", status: "refunded", channel: "Paid social", date: "2026-10-07", amount: 312_50 },
  { id: "HL-48209", customer: "Aiko Brandt", email: "aiko@lumenhaus.de", status: "paid", channel: "Direct", date: "2026-10-06", amount: 2_430_00 },
  { id: "HL-48208", customer: "Callum Ferris", email: "callum@saltmarsh.co.uk", status: "failed", channel: "Email", date: "2026-10-06", amount: 64_00 },
  { id: "HL-48207", customer: "Noor Al-Sayed", email: "noor@cedarline.ae", status: "paid", channel: "Organic", date: "2026-10-05", amount: 575_00 },
  { id: "HL-48206", customer: "Pia Lindqvist", email: "pia@arkivet.se", status: "paid", channel: "Partner", date: "2026-10-05", amount: 1_860_00 },
  { id: "HL-48205", customer: "Jonah Whitfield", email: "jonah@brightwater.ca", status: "pending", channel: "Direct", date: "2026-10-04", amount: 420_00 },
  { id: "HL-48204", customer: "Sofia Marchetti", email: "sofia@vetro.it", status: "paid", channel: "Email", date: "2026-10-04", amount: 156_00 },
  { id: "HL-48203", customer: "Kwame Asante", email: "kwame@goldcoast.dev", status: "paid", channel: "Paid social", date: "2026-10-03", amount: 990_00 },
  { id: "HL-48202", customer: "Elodie Garnier", email: "elodie@atelier-gris.fr", status: "refunded", channel: "Direct", date: "2026-10-03", amount: 210_00 },
  { id: "HL-48201", customer: "Hugo Ferreira", email: "hugo@marfim.pt", status: "paid", channel: "Organic", date: "2026-10-02", amount: 3_150_00 },
  { id: "HL-48200", customer: "Yara Lindgren", email: "yara@polarlab.fi", status: "paid", channel: "Partner", date: "2026-10-02", amount: 740_00 },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Seeded so server and client render the same sample.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RANGE_SHAPE: Record<DashboardRange, { count: number; seed: number; base: number; unit: "day" | "week" | "month" }> = {
  "7d": { count: 7, seed: 7, base: 18_400, unit: "day" },
  "30d": { count: 30, seed: 30, base: 17_600, unit: "day" },
  "90d": { count: 13, seed: 90, base: 121_000, unit: "week" },
  "12m": { count: 12, seed: 12, base: 486_000, unit: "month" },
};

const ANCHOR = Date.UTC(2026, 9, 8); // 8 Oct 2026, the sample's "today"
const DAY = 86_400_000;

function utcLabel(ms: number) {
  const d = new Date(ms);
  return { day: d.getUTCDate(), month: MONTHS[d.getUTCMonth()], year: d.getUTCFullYear() };
}

/** Deterministic sample series for a range. */
export function sampleDashboardSeries(range: DashboardRange): DashboardSeries {
  const { count, seed, base, unit } = RANGE_SHAPE[range];
  const rand = mulberry32(seed);
  const points: DashboardPoint[] = [];
  let level = base * 0.86;
  let prevLevel = base * 0.8;
  for (let i = 0; i < count; i += 1) {
    const progress = i / Math.max(1, count - 1);
    const weekly = unit === "day" ? Math.sin(((i + 2) / 7) * Math.PI * 2) * 0.07 : 0;
    level = level * (1 + (rand() - 0.42) * 0.09) + base * 0.012;
    prevLevel = prevLevel * (1 + (rand() - 0.47) * 0.08) + base * 0.006;
    const current = Math.round(level * (1 + weekly) * (0.94 + progress * 0.12));
    const previous = Math.round(prevLevel * (1 + weekly * 0.8));
    let label: string;
    let tick: string;
    if (unit === "month") {
      const m = (9 - (count - 1 - i) + 24) % 12;
      const y = 2026 - (9 - (count - 1 - i) < 0 ? 1 : 0);
      label = `${MONTHS[m]} ${y}`;
      tick = MONTHS[m];
    } else {
      const step = unit === "week" ? 7 : 1;
      const ms = ANCHOR - (count - 1 - i) * step * DAY;
      const d = utcLabel(ms);
      label = unit === "week" ? `Week of ${d.month} ${d.day}` : `${d.month} ${d.day}, ${d.year}`;
      tick = `${d.month} ${d.day}`;
    }
    points.push({ label, tick, current, previous });
  }

  const revenue = points.reduce((s, p) => s + p.current, 0);
  const revenuePrev = points.reduce((s, p) => s + p.previous, 0);
  const scale = revenue / 520_000;
  const spark = (k: number, drift: number) => {
    const r = mulberry32(seed * 31 + k);
    let v = 50;
    return Array.from({ length: 14 }, () => (v = Math.max(8, v + (r() - 0.5 + drift) * 14)));
  };

  return {
    points,
    kpis: [
      { id: "revenue", label: "Net revenue", value: revenue, previous: revenuePrev, format: "currency", spark: points.slice(-14).map((p) => p.current) },
      { id: "customers", label: "Active customers", value: Math.round(2_380 * Math.sqrt(scale)), previous: Math.round(2_210 * Math.sqrt(scale)), format: "number", spark: spark(1, 0.12) },
      { id: "conversion", label: "Conversion", value: 3.84 + (seed % 5) * 0.07, previous: 3.62, format: "percent", spark: spark(2, 0.06) },
      { id: "churn", label: "Churn", value: 1.92 - (seed % 3) * 0.08, previous: 2.31, format: "percent", lowerIsBetter: true, spark: spark(3, -0.1) },
    ],
    channels: [
      { label: "Direct", value: Math.round(revenue * 0.34) },
      { label: "Organic search", value: Math.round(revenue * 0.27) },
      { label: "Partner", value: Math.round(revenue * 0.19) },
      { label: "Email", value: Math.round(revenue * 0.12) },
      { label: "Paid social", value: Math.round(revenue * 0.08) },
    ],
  };
}

/* ----------------------------------------------------------------------------------------------------------
 * Formatting
 * -------------------------------------------------------------------------------------------------------- */

function useFormatters(currency: string, locale: string) {
  return useMemo(() => {
    const money = new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 });
    const moneyCents = new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 });
    const compact = new Intl.NumberFormat(locale, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 });
    const number = new Intl.NumberFormat(locale);
    return {
      kpi(value: number, format: DashboardKpi["format"]) {
        if (format === "currency") return money.format(value);
        if (format === "percent") return `${value.toFixed(2)}%`;
        return number.format(value);
      },
      money: (v: number) => money.format(v),
      cents: (v: number) => moneyCents.format(v / 100),
      compact: (v: number) => compact.format(v),
    };
  }, [currency, locale]);
}

function orderDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/* ----------------------------------------------------------------------------------------------------------
 * Shell
 * -------------------------------------------------------------------------------------------------------- */

const RANGES: { id: DashboardRange; label: string; long: string }[] = [
  { id: "7d", label: "7D", long: "Last 7 days" },
  { id: "30d", label: "30D", long: "Last 30 days" },
  { id: "90d", label: "90D", long: "Last 90 days" },
  { id: "12m", label: "12M", long: "Last 12 months" },
];

const DRAWER_BELOW = 768;

/**
 * An application dashboard: a collapsible sidebar that turns into a drawer on narrow containers, a header with
 * search, a KPI row, a revenue chart with a table view, a channel breakdown and a sortable orders table.
 */
export function AppDashboardShell({
  workspace = { name: "Halcyon", plan: "Scale plan" },
  user = { name: "Rhea Castillo", email: "rhea@halcyon.app" },
  nav = DASHBOARD_NAV,
  defaultActive = "overview",
  onNavigate,
  orders = DASHBOARD_ORDERS,
  getSeries = sampleDashboardSeries,
  defaultRange = "30d",
  onRangeChange,
  defaultCollapsed = false,
  currency = "USD",
  locale = "en-US",
  theme = "auto",
  disableAnimation = false,
  className,
}: AppDashboardShellProps) {
  const { style } = useAppBlockTheme(theme);
  const rootRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(rootRef);
  const narrow = width > 0 && width < DRAWER_BELOW;

  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [active, setActive] = useState(defaultActive);
  const [range, setRange] = useState<DashboardRange>(defaultRange);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const { announce, region } = useAnnouncer();
  const fmt = useFormatters(currency, locale);

  const series = useMemo(() => getSeries(range), [getSeries, range]);
  const rangeLong = RANGES.find((r) => r.id === range)?.long ?? "";
  const activeLabel = nav.flatMap((g) => g.items).find((i) => i.id === active)?.label ?? "Overview";

  const navigate = (id: string) => {
    setActive(id);
    onNavigate?.(id);
    setDrawerOpen(false);
  };

  const changeRange = (next: DashboardRange) => {
    setRange(next);
    onRangeChange?.(next);
    announce(`Showing ${RANGES.find((r) => r.id === next)?.long.toLowerCase()}`);
  };

  // "/" focuses search from anywhere in the block, unless the user is already typing.
  const onRootKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable=true]")) return;
    event.preventDefault();
    searchRef.current?.focus();
  };

  const sidebar = (mode: "rail" | "drawer") => (
    <SidebarContent
      mode={mode}
      collapsed={mode === "rail" && collapsed}
      workspace={workspace}
      user={user}
      nav={nav}
      active={active}
      onNavigate={navigate}
      onToggleCollapsed={() => setCollapsed((v) => !v)}
      onClose={() => setDrawerOpen(false)}
    />
  );

  return (
    <div
      ref={rootRef}
      className={cn(blockRoot, "h-full", className)}
      style={style}
      onKeyDown={onRootKeyDown}
    >
      {!narrow && (
        <aside
          aria-label="Primary"
          className={cn(
            "relative z-20 flex h-full shrink-0 flex-col border-r border-[color:var(--bjork-border)] bg-[var(--bjork-panel)] transition-[width] duration-[260ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
            collapsed ? "w-[64px]" : "w-[244px]",
          )}
        >
          {sidebar("rail")}
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col" inert={narrow && drawerOpen}>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[color:var(--bjork-border)] px-3 @3xl:px-5">
          {narrow && (
            <IconButton label="Open navigation" onClick={() => setDrawerOpen(true)} aria-expanded={drawerOpen}>
              <Menu />
            </IconButton>
          )}
          <nav aria-label="Breadcrumb" className="min-w-0">
            <ol className="flex min-w-0 items-center gap-1.5 text-[13px]">
              <li className="hidden truncate text-[color:var(--bjork-text-muted)] @md:block">{workspace.name}</li>
              <li aria-hidden="true" className="hidden text-[color:var(--bjork-text-faint)] @md:block">
                /
              </li>
              <li aria-current="page" className="truncate font-medium text-[color:var(--bjork-text)]">
                {activeLabel}
              </li>
            </ol>
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <label className="group relative hidden items-center @2xl:flex">
              <span className="sr-only">Search orders</span>
              <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 size-[15px] text-[color:var(--bjork-text-soft)]" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && query) {
                    e.stopPropagation();
                    setQuery("");
                  }
                }}
                placeholder="Search orders"
                className="h-8 w-[220px] rounded-[9px] border border-[color:var(--bjork-border)] bg-[var(--bjork-field)] pl-8 pr-8 text-[13px] text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-soft)] outline-none transition-[border-color,box-shadow,width] duration-200 ease-out placeholder:text-[color:var(--bjork-text-soft)] focus:w-[260px] focus-visible:border-[color:var(--bjork-accent)] focus-visible:ring-[3px] focus-visible:ring-[color:var(--bjork-accent-soft)] motion-reduce:transition-none [&::-webkit-search-cancel-button]:hidden"
              />
              <Kbd className="pointer-events-none absolute right-2 group-focus-within:opacity-0">/</Kbd>
            </label>
            <IconButton
              label="Search orders"
              className="@2xl:hidden"
              onClick={() => {
                const el = rootRef.current?.querySelector<HTMLInputElement>("[data-mobile-search]");
                el?.focus();
              }}
            >
              <Search />
            </IconButton>
            <IconButton label="Notifications, 3 unread" className="relative">
              <Bell />
              <span aria-hidden="true" className="absolute right-2 top-2 size-1.5 rounded-full bg-[var(--bjork-accent)] ring-2 ring-[color:var(--bjork-bg)]" />
            </IconButton>
            <BlockButton variant="secondary" size="sm" className="hidden @md:inline-flex">
              <Download aria-hidden="true" />
              Export
            </BlockButton>
          </div>
        </header>

        <main className="@container/main min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-3 pb-10 pt-5 @3xl:gap-5 @3xl:px-6 @3xl:pt-6">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div className="min-w-0">
                <h1 className="font-bjork-display text-[24px] font-bold italic leading-none tracking-[-0.02em] @3xl:text-[28px]">
                  {activeLabel}
                </h1>
                <p className="mt-2 text-[13px] text-[color:var(--bjork-text-muted)]">
                  {rangeLong} · compared with the previous period
                </p>
              </div>
              <RangeControl value={range} onChange={changeRange} />
            </div>

            <section aria-label="Key metrics" className="grid grid-cols-2 gap-2.5 @3xl/main:gap-3 @5xl/main:grid-cols-4">
              {series.kpis.map((kpi) => (
                <KpiCard key={kpi.id} kpi={kpi} format={fmt.kpi} />
              ))}
            </section>

            <div className="grid grid-cols-1 gap-3 @5xl/main:grid-cols-[minmax(0,1fr)_300px]">
              <RevenueChart
                key={range}
                points={series.points}
                rangeLabel={rangeLong}
                money={fmt.money}
                compact={fmt.compact}
                animate={!disableAnimation}
              />
              <ChannelBreakdown channels={series.channels} money={fmt.compact} />
            </div>

            <OrdersTable
              orders={orders}
              query={query}
              onQueryChange={setQuery}
              cents={fmt.cents}
              announce={announce}
            />
          </div>
        </main>
      </div>

      {narrow && (
        <BlockDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} label="Navigation">
          {sidebar("drawer")}
        </BlockDrawer>
      )}
      {region}
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------------------
 * Sidebar
 * -------------------------------------------------------------------------------------------------------- */

function SidebarContent({
  mode,
  collapsed,
  workspace,
  user,
  nav,
  active,
  onNavigate,
  onToggleCollapsed,
  onClose,
}: {
  mode: "rail" | "drawer";
  collapsed: boolean;
  workspace: { name: string; plan: string };
  user: { name: string; email: string };
  nav: DashboardNavGroup[];
  active: string;
  onNavigate: (id: string) => void;
  onToggleCollapsed: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className={cn("flex h-14 shrink-0 items-center gap-2 border-b border-[color:var(--bjork-border)]", collapsed ? "justify-center px-2" : "px-3")}>
        <button
          type="button"
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] p-1.5 text-left transition-colors duration-150 hover:bg-[var(--bjork-surface-hover)]",
            collapsed && "flex-none",
            focusRing,
          )}
          aria-label={collapsed ? `Switch workspace, current ${workspace.name}` : undefined}
          title={collapsed ? workspace.name : undefined}
        >
          <WorkspaceMark />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold leading-tight">{workspace.name}</span>
                <span className="block truncate text-[11.5px] leading-tight text-[color:var(--bjork-text-muted)]">{workspace.plan}</span>
              </span>
              <ChevronsUpDown aria-hidden="true" className="size-3.5 shrink-0 text-[color:var(--bjork-text-soft)]" />
            </>
          )}
        </button>
        {mode === "drawer" && (
          <IconButton label="Close navigation" size="sm" onClick={onClose}>
            <X />
          </IconButton>
        )}
      </div>

      <nav aria-label="Main" className={cn("hide-scrollbar flex-1 overflow-y-auto py-3", collapsed ? "px-2" : "px-2.5")}>
        {nav.map((group, gi) => (
          <div key={group.label ?? gi} className={cn(gi > 0 && "mt-5")}>
            {group.label &&
              (collapsed ? (
                <div aria-hidden="true" className="mx-auto mb-2 h-px w-6 bg-[var(--bjork-border)]" />
              ) : (
                <h2 className="mb-1.5 px-2.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-[color:var(--bjork-text-soft)]">
                  {group.label}
                </h2>
              ))}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const isActive = item.id === active;
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        onNavigate(item.id);
                      }}
                      aria-current={isActive ? "page" : undefined}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "group relative flex h-9 items-center gap-2.5 rounded-[9px] text-[13.5px] transition-colors duration-150",
                        collapsed ? "justify-center px-0" : "px-2.5",
                        isActive
                          ? "bg-[var(--bjork-surface)] font-medium text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-soft),0_0_0_1px_var(--bjork-border)]"
                          : "text-[color:var(--bjork-text-medium)] hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)]",
                        focusRing,
                      )}
                    >
                      {isActive && (
                        <span aria-hidden="true" className="absolute -left-2.5 top-2 h-5 w-[3px] rounded-r-full bg-[var(--bjork-accent)]" />
                      )}
                      <Icon
                        aria-hidden="true"
                        className={cn(
                          "size-[17px] shrink-0",
                          isActive ? "text-[color:var(--blk-accent-ink)]" : "text-[color:var(--bjork-text-muted)] group-hover:text-[color:var(--bjork-text-medium)]",
                        )}
                      />
                      {collapsed ? (
                        <span className="sr-only">{item.label}</span>
                      ) : (
                        <>
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {item.badge && (
                            <span
                              className={cn(
                                "rounded-[6px] px-1.5 py-px font-mono text-[10.5px] tabular-nums",
                                item.badge === "New"
                                  ? "bg-[var(--bjork-accent-soft)] text-[color:var(--blk-accent-ink)]"
                                  : "bg-[var(--bjork-surface-active)] text-[color:var(--bjork-text-muted)]",
                              )}
                            >
                              {item.badge}
                            </span>
                          )}
                        </>
                      )}
                      {collapsed && item.badge && item.badge !== "New" && (
                        <span aria-hidden="true" className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[var(--bjork-accent)]" />
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn("shrink-0 border-t border-[color:var(--bjork-border)] p-2.5", collapsed && "px-2")}>
        {!collapsed && (
          <div className="mb-2.5 rounded-[12px] border border-[color:var(--bjork-border)] bg-[var(--bjork-surface)] p-3 shadow-[var(--bjork-shadow-soft)]">
            <div className="flex items-baseline justify-between text-[12px]">
              <span className="font-medium">Event quota</span>
              <span className="font-mono tabular-nums text-[color:var(--bjork-text-muted)]">8.2M / 10M</span>
            </div>
            <div
              role="meter"
              aria-label="Event quota used"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={82}
              aria-valuetext="82 percent used"
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--bjork-surface-active)]"
            >
              <div className="h-full w-[82%] rounded-full bg-[var(--bjork-accent)]" />
            </div>
            <p className="mt-2 text-[11.5px] leading-snug text-[color:var(--bjork-text-muted)]">Resets in 23 days.</p>
          </div>
        )}
        <div className={cn("flex items-center gap-1", collapsed ? "flex-col" : "")}>
          <button
            type="button"
            className={cn(
              "flex min-w-0 items-center gap-2.5 rounded-[10px] p-1.5 text-left transition-colors duration-150 hover:bg-[var(--bjork-surface-hover)]",
              collapsed ? "flex-none" : "flex-1",
              focusRing,
            )}
            aria-label={`Account: ${user.name}`}
          >
            <InitialsAvatar name={user.name} size={28} />
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium leading-tight">{user.name}</span>
                <span className="block truncate text-[11.5px] leading-tight text-[color:var(--bjork-text-muted)]">{user.email}</span>
              </span>
            )}
          </button>
          {!collapsed && (
            <IconButton label="Help and support" size="sm">
              <LifeBuoy />
            </IconButton>
          )}
          {mode === "rail" && (
            <IconButton label={collapsed ? "Expand sidebar" : "Collapse sidebar"} size="sm" onClick={onToggleCollapsed} aria-expanded={!collapsed}>
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </IconButton>
          )}
        </div>
      </div>
    </>
  );
}

function WorkspaceMark() {
  return (
    <span
      aria-hidden="true"
      className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-[9px] bg-[var(--blk-accent-fill)] shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_1px_2px_rgba(0,0,0,0.2)]"
    >
      <svg viewBox="0 0 20 20" className="size-[18px]" fill="none">
        <path d="M4 15.5V4.5M16 15.5V4.5M4 10h12" stroke="var(--blk-accent-fill-ink)" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="10" cy="10" r="2.1" fill="var(--blk-accent-fill-ink)" />
      </svg>
    </span>
  );
}

/* ----------------------------------------------------------------------------------------------------------
 * Range control: a radio group with roving focus.
 * -------------------------------------------------------------------------------------------------------- */

function RangeControl({ value, onChange }: { value: DashboardRange; onChange: (range: DashboardRange) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = RANGES.findIndex((r) => r.id === value);
  const onKeyDown = (event: ReactKeyboardEvent) => {
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % RANGES.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + RANGES.length) % RANGES.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = RANGES.length - 1;
    else return;
    event.preventDefault();
    onChange(RANGES[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label="Date range"
      onKeyDown={onKeyDown}
      className="relative inline-grid grid-cols-4 rounded-[11px] border border-[color:var(--bjork-border)] bg-[var(--bjork-field-inset)] p-[3px] shadow-[var(--bjork-shadow-inset)]"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-[3px] left-[3px] w-[calc((100%-6px)/4)] rounded-[8px] bg-[var(--bjork-surface)] shadow-[var(--bjork-shadow-surface),0_0_0_1px_var(--bjork-border)] transition-transform duration-[220ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {RANGES.map((r, i) => (
        <button
          key={r.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={r.id === value}
          aria-label={r.long}
          tabIndex={r.id === value ? 0 : -1}
          onClick={() => onChange(r.id)}
          className={cn(
            "relative z-10 h-7 min-w-[46px] cursor-pointer rounded-[8px] px-2.5 font-mono text-[11.5px] font-medium tabular-nums transition-colors duration-150",
            r.id === value ? "text-[color:var(--bjork-text)]" : "text-[color:var(--bjork-text-muted)] hover:text-[color:var(--bjork-text)]",
            focusRing,
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------------------
 * KPI card
 * -------------------------------------------------------------------------------------------------------- */

function KpiCard({ kpi, format }: { kpi: DashboardKpi; format: (v: number, f: DashboardKpi["format"]) => string }) {
  const change = kpi.previous === 0 ? 0 : ((kpi.value - kpi.previous) / kpi.previous) * 100;
  const up = change >= 0;
  const good = kpi.lowerIsBetter ? !up : up;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  const changeText = `${up ? "+" : "−"}${Math.abs(change).toFixed(1)}%`;
  return (
    <article className="@container/kpi relative flex min-w-0 flex-col overflow-hidden rounded-[16px] border border-[color:var(--bjork-border)] bg-[var(--bjork-surface)] p-3.5 shadow-[var(--bjork-shadow-surface)] @3xl/main:p-4">
      <h3 className="text-[12.5px] font-medium text-[color:var(--bjork-text-muted)]">{kpi.label}</h3>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[21px] font-semibold leading-none tracking-[-0.03em] tabular-nums @[220px]/kpi:text-[26px]">{format(kpi.value, kpi.format)}</p>
          <p className="mt-2.5 flex items-center gap-1.5 text-[12px]">
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-[6px] px-1.5 py-[2px] font-mono text-[11px] font-medium tabular-nums",
                good
                  ? "bg-[var(--blk-success-soft)] text-[color:var(--blk-success)]"
                  : "bg-[var(--blk-error-soft)] text-[color:var(--blk-error)]",
              )}
            >
              <Arrow aria-hidden="true" className="size-3" strokeWidth={2.25} />
              {changeText}
            </span>
            <span className="hidden text-[color:var(--bjork-text-soft)] @[200px]/kpi:inline">vs prior</span>
            <span className="sr-only">{good ? "(improving)" : "(worsening)"}</span>
          </p>
        </div>
        <Sparkline values={kpi.spark} good={good} />
      </div>
    </article>
  );
}

function Sparkline({ values, good }: { values: number[]; good: boolean }) {
  const w = 76;
  const h = 30;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * (w - 4) + 2,
    h - 3 - ((v - min) / (max - min || 1)) * (h - 6),
  ]);
  const d = smoothPath(pts);
  const last = pts[pts.length - 1];
  const gid = useId();
  return (
    <svg aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="hidden shrink-0 overflow-visible @[230px]/kpi:block">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--bjork-text)" stopOpacity="0.1" />
          <stop offset="1" stopColor="var(--bjork-text)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L ${last[0]} ${h} L ${pts[0][0]} ${h} Z`} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke="var(--bjork-text-soft)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.75" fill={good ? "var(--blk-success)" : "var(--blk-error)"} stroke="var(--bjork-surface)" strokeWidth="1.5" />
    </svg>
  );
}

// Monotone cubic interpolation, so the curve never overshoots the data.
function smoothPath(pts: number[][]) {
  if (pts.length < 2) return "";
  const n = pts.length;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    slope.push((pts[i + 1][1] - pts[i][1]) / (dx[i] || 1));
  }
  const m: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i += 1) {
    m.push(slope[i - 1] * slope[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / slope[i - 1] + (dx[i] + 2 * dx[i - 1]) / slope[i]));
  }
  m.push(slope[n - 2]);
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = dx[i] / 3;
    d += ` C ${(x0 + h).toFixed(2)} ${(y0 + m[i] * h).toFixed(2)}, ${(x1 - h).toFixed(2)} ${(y1 - m[i + 1] * h).toFixed(2)}, ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  return d;
}

/* ----------------------------------------------------------------------------------------------------------
 * Revenue chart: current period area, previous period dashed, crosshair tooltip, keyboard stepping and a
 * table view.
 * -------------------------------------------------------------------------------------------------------- */

const CHART_H = 236;
const PAD = { top: 16, right: 12, bottom: 28, left: 52 };

function niceMax(value: number) {
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  const f = value / exp;
  const nice = f <= 1 ? 1 : f <= 1.5 ? 1.5 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 3 ? 3 : f <= 4 ? 4 : f <= 5 ? 5 : f <= 6 ? 6 : f <= 8 ? 8 : 10;
  return nice * exp;
}

function RevenueChart({
  points,
  rangeLabel,
  money,
  compact,
  animate,
}: {
  points: DashboardPoint[];
  rangeLabel: string;
  money: (v: number) => string;
  compact: (v: number) => string;
  animate: boolean;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const [hover, setHover] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(plotRef);
  const reduce = useBlockReducedMotion();
  const [revealed, setRevealed] = useState(!animate);
  const titleId = useId();
  const descId = useId();
  const gradId = useId();
  const clipId = useId();

  useEffect(() => {
    if (!animate || reduce) return;
    const id = window.requestAnimationFrame(() => setRevealed(true));
    return () => window.cancelAnimationFrame(id);
  }, [animate, reduce]);
  const shown = revealed || reduce;

  const total = points.reduce((s, p) => s + p.current, 0);
  const totalPrev = points.reduce((s, p) => s + p.previous, 0);
  const max = niceMax(Math.max(...points.map((p) => Math.max(p.current, p.previous))) * 1.08);
  const w = Math.max(width, 240);
  const innerW = w - PAD.left - PAD.right;
  const innerH = CHART_H - PAD.top - PAD.bottom;
  const x = useCallback((i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW), [innerW, points.length]);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  const cur = points.map((p, i) => [x(i), y(p.current)]);
  const prev = points.map((p, i) => [x(i), y(p.previous)]);
  const curD = smoothPath(cur);
  const prevD = smoothPath(prev);
  const areaD = `${curD} L ${x(points.length - 1)} ${PAD.top + innerH} L ${x(0)} ${PAD.top + innerH} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const labelEvery = Math.ceil(points.length / Math.max(2, Math.floor(innerW / 64)));

  const pickIndex = (clientX: number) => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const px = clientX - rect.left - PAD.left;
    return Math.max(0, Math.min(points.length - 1, Math.round((px / innerW) * (points.length - 1))));
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    const last = points.length - 1;
    const at = hover ?? last;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = Math.min(last, hover === null ? last : at + 1);
    else if (event.key === "ArrowLeft") next = Math.max(0, hover === null ? last : at - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else if (event.key === "Escape") {
      setHover(null);
      return;
    } else return;
    event.preventDefault();
    setHover(next);
  };

  const active = hover !== null ? points[hover] : null;
  const delta = active ? ((active.current - active.previous) / active.previous) * 100 : 0;
  const tipLeft = hover !== null ? x(hover) : 0;
  const tipFlip = tipLeft > w - 190;
  const change = ((total - totalPrev) / totalPrev) * 100;

  return (
    <section
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col rounded-[16px] border border-[color:var(--bjork-border)] bg-[var(--bjork-surface)] shadow-[var(--bjork-shadow-surface)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <h2 id={titleId} className="text-[13.5px] font-semibold">
            Revenue
          </h2>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[12.5px] text-[color:var(--bjork-text-muted)]">
            <span className="text-[19px] font-semibold tracking-[-0.025em] tabular-nums text-[color:var(--bjork-text)]">{money(total)}</span>
            <span className="tabular-nums">
              {change >= 0 ? "+" : "−"}
              {Math.abs(change).toFixed(1)}% vs prior period
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ul className="hidden items-center gap-3 text-[11.5px] text-[color:var(--bjork-text-muted)] @md/main:flex" aria-label="Legend">
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-[2px] w-3.5 rounded-full bg-[var(--bjork-accent)]" />
              This period
            </li>
            <li className="flex items-center gap-1.5">
              <svg aria-hidden="true" width="14" height="2" className="overflow-visible">
                <line x1="0" x2="14" y1="1" y2="1" stroke="var(--blk-chart-ghost)" strokeWidth="1.5" strokeDasharray="3 3" />
              </svg>
              Prior period
            </li>
          </ul>
          <div className="flex rounded-[9px] border border-[color:var(--bjork-border)] p-[2px]" role="group" aria-label="View">
            <IconButton label="Chart view" size="sm" pressed={view === "chart"} onClick={() => setView("chart")} className="size-6 rounded-[7px] aria-pressed:bg-[var(--bjork-surface-active)]">
              <ChartArea />
            </IconButton>
            <IconButton label="Table view" size="sm" pressed={view === "table"} onClick={() => setView("table")} className="size-6 rounded-[7px] aria-pressed:bg-[var(--bjork-surface-active)]">
              <Table2 />
            </IconButton>
          </div>
        </div>
      </div>

      {view === "chart" ? (
        <div
          ref={plotRef}
          role="img"
          tabIndex={0}
          aria-labelledby={titleId}
          aria-describedby={descId}
          onKeyDown={onKeyDown}
          onPointerMove={(e) => setHover(pickIndex(e.clientX))}
          onPointerLeave={() => setHover(null)}
          onBlur={() => setHover(null)}
          className={cn("relative mx-1 mb-1 mt-2 cursor-crosshair rounded-[12px] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)]")}
          style={{ height: CHART_H }}
        >
          <p id={descId} className="sr-only">
            {rangeLabel}: {money(total)} in revenue against {money(totalPrev)} in the prior period. Use the left and right
            arrow keys to read each point.
          </p>
          {width > 0 && (
            <svg width={w} height={CHART_H} className="block overflow-visible" aria-hidden="true">
              <defs>
                <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="var(--bjork-accent)" stopOpacity="0.22" />
                  <stop offset="1" stopColor="var(--bjork-accent)" stopOpacity="0" />
                </linearGradient>
                <clipPath id={clipId}>
                  <rect
                    x={0}
                    y={0}
                    width={w}
                    height={CHART_H}
                    style={{
                      transformOrigin: `${PAD.left}px 0`,
                      transform: shown ? "scaleX(1)" : "scaleX(0)",
                      transition: animate && !reduce ? "transform 700ms cubic-bezier(0.23,1,0.32,1)" : "none",
                    }}
                  />
                </clipPath>
              </defs>
              {ticks.map((t) => (
                <g key={t}>
                  <line
                    x1={PAD.left}
                    x2={w - PAD.right}
                    y1={y(t)}
                    y2={y(t)}
                    stroke="var(--bjork-border)"
                    strokeDasharray={t === 0 ? undefined : "2 4"}
                  />
                  <text x={PAD.left - 10} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[color:var(--bjork-text-soft)] font-mono text-[10.5px] tabular-nums">
                    {compact(t)}
                  </text>
                </g>
              ))}
              {points.map((p, i) => {
                const last = points.length - 1;
                // Every nth tick, plus the last point; drop the nth tick that would crowd it.
                const show = i === last || (i % labelEvery === 0 && last - i >= labelEvery * 0.7);
                if (!show) return null;
                return (
                  <text
                    key={p.label}
                    x={x(i)}
                    y={CHART_H - 8}
                    textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"}
                    className="fill-[color:var(--bjork-text-soft)] font-mono text-[10.5px]"
                  >
                    {p.tick}
                  </text>
                );
              })}
              <g clipPath={`url(#${clipId})`}>
                <path d={prevD} fill="none" stroke="var(--blk-chart-ghost)" strokeWidth="1.5" strokeDasharray="4 4" strokeLinecap="round" />
                <path d={areaD} fill={`url(#${gradId})`} />
                <path d={curD} fill="none" stroke="var(--bjork-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </g>
              {hover !== null && (
                <g>
                  <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--bjork-border-strong)" />
                  <circle cx={x(hover)} cy={y(points[hover].previous)} r="3.5" fill="var(--bjork-surface)" stroke="var(--blk-chart-ghost)" strokeWidth="1.5" />
                  <circle cx={x(hover)} cy={y(points[hover].current)} r="4.5" fill="var(--bjork-accent)" stroke="var(--bjork-surface)" strokeWidth="2" />
                </g>
              )}
            </svg>
          )}
          {active && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-2 z-10 w-[176px] rounded-[12px] border border-[color:var(--bjork-border)] bg-[var(--bjork-menu)] p-2.5 shadow-[var(--bjork-shadow-menu)] backdrop-blur-xl"
              style={{ left: tipFlip ? tipLeft - 176 - 12 : tipLeft + 12 }}
            >
              <p className="text-[11.5px] font-medium text-[color:var(--bjork-text-muted)]">{active.label}</p>
              <dl className="mt-1.5 space-y-1 text-[12px]">
                <div className="flex items-center justify-between gap-2">
                  <dt className="flex items-center gap-1.5 text-[color:var(--bjork-text-medium)]">
                    <span className="h-[2px] w-2.5 rounded-full bg-[var(--bjork-accent)]" />
                    This period
                  </dt>
                  <dd className="font-mono tabular-nums">{money(active.current)}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="flex items-center gap-1.5 text-[color:var(--bjork-text-medium)]">
                    <span className="h-[2px] w-2.5 rounded-full bg-[var(--blk-chart-ghost)]" />
                    Prior
                  </dt>
                  <dd className="font-mono tabular-nums text-[color:var(--bjork-text-muted)]">{money(active.previous)}</dd>
                </div>
              </dl>
              <p className={cn("mt-1.5 border-t border-[color:var(--bjork-border)] pt-1.5 font-mono text-[11px] tabular-nums", delta >= 0 ? "text-[color:var(--blk-success)]" : "text-[color:var(--blk-error)]")}>
                {delta >= 0 ? "+" : "−"}
                {Math.abs(delta).toFixed(1)}%
              </p>
            </div>
          )}
          <span className="sr-only" aria-live="polite">
            {active ? `${active.label}: ${money(active.current)}, prior ${money(active.previous)}` : ""}
          </span>
        </div>
      ) : (
        <div className="mx-1 mb-1 mt-2 max-h-[236px] overflow-auto rounded-[12px]">
          <table className="w-full text-[12.5px]">
            <caption className="sr-only">Revenue, {rangeLabel.toLowerCase()}</caption>
            <thead className="sticky top-0 bg-[var(--bjork-surface)]">
              <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-[color:var(--bjork-text-soft)]">
                <th scope="col" className="px-3 py-2 font-medium">Period</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">This period</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Prior</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.label} className="border-t border-[color:var(--bjork-border)]">
                  <th scope="row" className="px-3 py-1.5 text-left font-normal text-[color:var(--bjork-text-medium)]">{p.label}</th>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{money(p.current)}</td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[color:var(--bjork-text-muted)]">{money(p.previous)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ----------------------------------------------------------------------------------------------------------
 * Channel breakdown
 * -------------------------------------------------------------------------------------------------------- */

function ChannelBreakdown({ channels, money }: { channels: { label: string; value: number }[]; money: (v: number) => string }) {
  const total = channels.reduce((s, c) => s + c.value, 0);
  const max = Math.max(...channels.map((c) => c.value));
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col rounded-[16px] border border-[color:var(--bjork-border)] bg-[var(--bjork-surface)] p-4 shadow-[var(--bjork-shadow-surface)]"
    >
      <div className="flex items-baseline justify-between">
        <h2 id={titleId} className="text-[13.5px] font-semibold">
          Revenue by channel
        </h2>
        <span className="font-mono text-[11.5px] tabular-nums text-[color:var(--bjork-text-muted)]">{money(total)}</span>
      </div>
      <ul className="mt-4 flex flex-1 flex-col justify-between gap-3.5">
        {channels.map((c, i) => {
          const share = (c.value / total) * 100;
          return (
            <li key={c.label}>
              <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                <span className="truncate text-[color:var(--bjork-text-medium)]">{c.label}</span>
                <span className="shrink-0 font-mono text-[11.5px] tabular-nums">
                  {money(c.value)}
                  <span className="ml-1.5 inline-block w-[3.2ch] text-right text-[color:var(--bjork-text-soft)]">{Math.round(share)}%</span>
                </span>
              </div>
              <div aria-hidden="true" className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--bjork-surface-active)]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(c.value / max) * 100}%`,
                    background: "var(--bjork-accent)",
                    opacity: 1 - i * 0.14,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ----------------------------------------------------------------------------------------------------------
 * Orders table
 * -------------------------------------------------------------------------------------------------------- */

const STATUS: Record<OrderStatus, { label: string; ink: string; soft: string }> = {
  paid: { label: "Paid", ink: "var(--blk-success)", soft: "var(--blk-success-soft)" },
  pending: { label: "Pending", ink: "var(--blk-warning)", soft: "var(--blk-warning-soft)" },
  refunded: { label: "Refunded", ink: "var(--bjork-text-muted)", soft: "var(--bjork-surface-active)" },
  failed: { label: "Failed", ink: "var(--blk-error)", soft: "var(--blk-error-soft)" },
};

type SortKey = "id" | "customer" | "date" | "amount";
const PAGE_SIZE = 6;

function OrdersTable({
  orders,
  query,
  onQueryChange,
  cents,
  announce,
}: {
  orders: DashboardOrder[];
  query: string;
  onQueryChange: (q: string) => void;
  cents: (v: number) => string;
  announce: (message: string) => void;
}) {
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const [page, setPage] = useState(0);
  const titleId = useId();

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = orders.filter(
      (o) =>
        (filter === "all" || o.status === filter) &&
        (!q || o.customer.toLowerCase().includes(q) || o.id.toLowerCase().includes(q) || o.email.toLowerCase().includes(q)),
    );
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir || a.id.localeCompare(b.id) * -1;
    });
  }, [orders, filter, query, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  // Back to the first page whenever the result set changes shape.
  const shapeKey = `${filter}|${query}|${sort.key}|${sort.dir}`;
  const [lastShape, setLastShape] = useState(shapeKey);
  if (lastShape !== shapeKey) {
    setLastShape(shapeKey);
    setPage(0);
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    for (const o of orders) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [orders]);

  const toggleSort = (key: SortKey) => {
    const next = { key, dir: sort.key === key && sort.dir === "desc" ? ("asc" as const) : ("desc" as const) };
    setSort(next);
    announce(`Sorted by ${key}, ${next.dir === "asc" ? "ascending" : "descending"}`);
  };

  const header = (key: SortKey, label: string, className?: string) => {
    const isSorted = sort.key === key;
    const Icon = !isSorted ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th scope="col" aria-sort={isSorted ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("px-3 py-0 font-medium", className)}>
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className={cn(
            "inline-flex h-9 cursor-pointer items-center gap-1 rounded-[6px] uppercase tracking-[0.06em] transition-colors hover:text-[color:var(--bjork-text)]",
            isSorted && "text-[color:var(--bjork-text-medium)]",
            focusRing,
          )}
        >
          {label}
          <Icon aria-hidden="true" className={cn("size-3", !isSorted && "opacity-50")} />
        </button>
      </th>
    );
  };

  return (
    <section
      aria-labelledby={titleId}
      className="min-w-0 rounded-[16px] border border-[color:var(--bjork-border)] bg-[var(--bjork-surface)] shadow-[var(--bjork-shadow-surface)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-4">
        <div className="flex items-baseline gap-2">
          <h2 id={titleId} className="text-[13.5px] font-semibold">
            Recent orders
          </h2>
          <span className="font-mono text-[11.5px] tabular-nums text-[color:var(--bjork-text-soft)]">{rows.length}</span>
        </div>
        <div className="hide-scrollbar -mx-1 flex max-w-full items-center gap-1 overflow-x-auto px-1" role="group" aria-label="Filter by status">
          {(["all", "paid", "pending", "refunded", "failed"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={filter === s}
              onClick={() => setFilter(s)}
              className={cn(
                "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition-colors duration-150",
                filter === s
                  ? "border-[color:var(--bjork-border-strong)] bg-[var(--bjork-surface-active)] text-[color:var(--bjork-text)]"
                  : "border-transparent text-[color:var(--bjork-text-muted)] hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)]",
                focusRing,
              )}
            >
              {s !== "all" && <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: STATUS[s].ink }} />}
              {s === "all" ? "All" : STATUS[s].label}
              <span className="font-mono text-[10.5px] tabular-nums text-[color:var(--bjork-text-soft)]">{counts[s] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pb-3 @2xl/main:hidden">
        <label className="relative flex items-center">
          <span className="sr-only">Search orders</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 size-[15px] text-[color:var(--bjork-text-soft)]" />
          <input
            data-mobile-search
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search by name or order"
            className="h-9 w-full rounded-[9px] border border-[color:var(--bjork-border)] bg-[var(--bjork-field)] pl-8 pr-3 text-[13px] outline-none placeholder:text-[color:var(--bjork-text-soft)] focus-visible:border-[color:var(--bjork-accent)] focus-visible:ring-[3px] focus-visible:ring-[color:var(--bjork-accent-soft)]"
          />
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-0 border-collapse text-[13px]">
          <caption className="sr-only">Recent orders, sortable by column</caption>
          <thead>
            <tr className="border-y border-[color:var(--bjork-border)] bg-[var(--bjork-panel)] text-left text-[11px] text-[color:var(--bjork-text-soft)]">
              {header("id", "Order", "hidden @2xl/main:table-cell")}
              {header("customer", "Customer")}
              <th scope="col" className="px-3 font-medium uppercase tracking-[0.06em]">Status</th>
              <th scope="col" className="hidden px-3 font-medium uppercase tracking-[0.06em] @4xl/main:table-cell">Channel</th>
              {header("date", "Date", "hidden @3xl/main:table-cell")}
              {header("amount", "Amount", "text-right [&>button]:flex-row-reverse")}
            </tr>
          </thead>
          <tbody>
            {visible.map((o) => (
              <tr key={o.id} className="group border-b border-[color:var(--bjork-border)] transition-colors duration-100 last:border-b-0 hover:bg-[var(--bjork-surface-hover)]">
                <td className="hidden px-3 py-2.5 font-mono text-[12px] tabular-nums text-[color:var(--bjork-text-muted)] @2xl/main:table-cell">{o.id}</td>
                <td className="max-w-0 px-3 py-2.5 @2xl/main:max-w-none">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <InitialsAvatar name={o.customer} size={26} />
                    <div className="min-w-0">
                      <p className="truncate font-medium leading-tight">{o.customer}</p>
                      <p className="truncate text-[11.5px] leading-tight text-[color:var(--bjork-text-muted)]">
                        <span className="@2xl/main:hidden">{o.id} · </span>
                        {o.email}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11.5px] font-medium" style={{ background: STATUS[o.status].soft, color: STATUS[o.status].ink }}>
                    <StatusGlyph status={o.status} />
                    {STATUS[o.status].label}
                  </span>
                </td>
                <td className="hidden px-3 py-2.5 text-[color:var(--bjork-text-medium)] @4xl/main:table-cell">{o.channel}</td>
                <td className="hidden whitespace-nowrap px-3 py-2.5 tabular-nums text-[color:var(--bjork-text-medium)] @3xl/main:table-cell">{orderDate(o.date)}</td>
                <td className={cn("whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums", o.status === "refunded" && "text-[color:var(--bjork-text-muted)] line-through decoration-[color:var(--bjork-text-faint)]")}>
                  {cents(o.amount)}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center">
                  <p className="text-[13px] font-medium">No orders match</p>
                  <p className="mt-1 text-[12.5px] text-[color:var(--bjork-text-muted)]">
                    Try another name or clear the filters.
                  </p>
                  <BlockButton
                    size="sm"
                    variant="secondary"
                    className="mt-3"
                    onClick={() => {
                      setFilter("all");
                      onQueryChange("");
                    }}
                  >
                    Clear filters
                  </BlockButton>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[color:var(--bjork-border)] px-4 py-2.5 text-[12px] text-[color:var(--bjork-text-muted)]">
        <span className="tabular-nums">
          {rows.length === 0 ? "0 results" : `${current * PAGE_SIZE + 1}–${Math.min(rows.length, (current + 1) * PAGE_SIZE)} of ${rows.length}`}
        </span>
        <div className="flex items-center gap-1">
          <IconButton label="Previous page" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
            <ChevronLeft />
          </IconButton>
          <span className="min-w-[4.5ch] text-center font-mono tabular-nums" aria-live="polite">
            <span className="sr-only">Page </span>
            {current + 1}/{pages}
          </span>
          <IconButton label="Next page" size="sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            <ChevronRight />
          </IconButton>
        </div>
      </div>
    </section>
  );
}

function StatusGlyph({ status }: { status: OrderStatus }): ReactNode {
  const common = { width: 10, height: 10, viewBox: "0 0 10 10", "aria-hidden": true, fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const };
  if (status === "paid") return <svg {...common}><path d="M2 5.2 4.1 7.2 8 2.8" strokeLinejoin="round" /></svg>;
  if (status === "pending") return <svg {...common}><circle cx="5" cy="5" r="3.6" /><path d="M5 3.2V5l1.2.8" /></svg>;
  if (status === "failed") return <svg {...common}><path d="M2.8 2.8l4.4 4.4M7.2 2.8 2.8 7.2" /></svg>;
  return <svg {...common}><path d="M7.8 4.2A3 3 0 1 0 7.4 7M7.8 1.8v2.4H5.4" strokeLinejoin="round" /></svg>;
}
