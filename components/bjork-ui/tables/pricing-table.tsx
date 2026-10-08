"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTheme } from "next-themes";
import { Check, ChevronDown, Info, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useElementSize } from "../_core/canvas";
import {
  type BjorkTableThemeMode,
  getBjorkSignalPalette,
  getBjorkTablePalette,
  useBjorkTableIsDark,
} from "./table-theme";

export type PricingBilling = "monthly" | "annual";

export interface PricingPlan {
  id: string;
  name: string;
  blurb: string;
  /** Price per unit per month when billed monthly. `null` renders `customPriceLabel`. */
  monthlyPrice: number | null;
  /** Effective price per unit per month when billed annually. */
  annualPrice: number | null;
  /** Shown after the price, e.g. "per seat / mo". */
  priceSuffix?: string;
  /** Shown instead of a number when the price is `null`, e.g. "Custom". */
  customPriceLabel?: string;
  ctaLabel: string;
  highlighted?: boolean;
  /** Badge on the highlighted column. Defaults to "Recommended". */
  badge?: string;
}

export type PricingFeatureValue = boolean | string | number;

export interface PricingFeature {
  label: string;
  hint?: string;
  values: Record<string, PricingFeatureValue>;
}

export interface PricingFeatureGroup {
  title: string;
  features: PricingFeature[];
}

export interface PricingTableProps {
  plans?: PricingPlan[];
  featureGroups?: PricingFeatureGroup[];
  /** Uncontrolled initial billing period. */
  defaultBilling?: PricingBilling;
  /** Controlled billing period. */
  billing?: PricingBilling;
  onBillingChange?: (billing: PricingBilling) => void;
  onPlanSelect?: (planId: string, billing: PricingBilling) => void;
  /** Titles of groups that start collapsed. */
  defaultCollapsedGroups?: string[];
  /** Plan shown first in the narrow, one-plan-at-a-time layout. Defaults to the highlighted plan. */
  defaultMobilePlanId?: string;
  currency?: string;
  caption?: string;
  /** Height of the scrolling feature list. The plan header stays pinned inside it. */
  maxHeight?: number;
  loading?: boolean;
  className?: string;
  theme?: BjorkTableThemeMode;
  enableAnimations?: boolean;
}

export const PRICING_TABLE_SAMPLE_PLANS: PricingPlan[] = [
  {
    id: "hobby",
    name: "Hobby",
    blurb: "For side projects and prototypes.",
    monthlyPrice: 0,
    annualPrice: 0,
    priceSuffix: "free forever",
    ctaLabel: "Start free",
  },
  {
    id: "team",
    name: "Team",
    blurb: "Targeting and rollouts for teams.",
    monthlyPrice: 24,
    annualPrice: 19,
    priceSuffix: "per seat / month",
    ctaLabel: "Start trial",
    highlighted: true,
  },
  {
    id: "scale",
    name: "Scale",
    blurb: "Experiments, audit trails and SSO.",
    monthlyPrice: 64,
    annualPrice: 51,
    priceSuffix: "per seat / month",
    ctaLabel: "Choose Scale",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    blurb: "Dedicated regions, custom terms.",
    monthlyPrice: null,
    annualPrice: null,
    customPriceLabel: "Custom",
    ctaLabel: "Talk to sales",
  },
];

export const PRICING_TABLE_SAMPLE_GROUPS: PricingFeatureGroup[] = [
  {
    title: "Flags & targeting",
    features: [
      {
        label: "Feature flags",
        values: { hobby: 25, team: "Unlimited", scale: "Unlimited", enterprise: "Unlimited" },
      },
      {
        label: "Monthly evaluations",
        hint: "Every time an SDK resolves a flag for a user. Cached client evaluations are free.",
        values: { hobby: "1M", team: "50M", scale: "500M", enterprise: "Custom" },
      },
      {
        label: "Percentage rollouts",
        values: { hobby: true, team: true, scale: true, enterprise: true },
      },
      {
        label: "Segment targeting",
        hint: "Target by plan, region, device or any attribute you send with the context.",
        values: { hobby: false, team: true, scale: true, enterprise: true },
      },
      {
        label: "Scheduled releases",
        values: { hobby: false, team: true, scale: true, enterprise: true },
      },
      {
        label: "Environments",
        values: { hobby: 2, team: 5, scale: 20, enterprise: "Unlimited" },
      },
    ],
  },
  {
    title: "Experimentation",
    features: [
      {
        label: "A/B experiments",
        values: { hobby: false, team: 3, scale: "Unlimited", enterprise: "Unlimited" },
      },
      {
        label: "Sequential testing",
        hint: "Peek at results any time without inflating false positives.",
        values: { hobby: false, team: false, scale: true, enterprise: true },
      },
      {
        label: "Warehouse metrics",
        values: { hobby: false, team: false, scale: true, enterprise: true },
      },
    ],
  },
  {
    title: "Governance",
    features: [
      {
        label: "Audit log retention",
        values: { hobby: "7 days", team: "90 days", scale: "1 year", enterprise: "7 years" },
      },
      {
        label: "Change approvals",
        hint: "Require a second reviewer before a flag changes in protected environments.",
        values: { hobby: false, team: false, scale: true, enterprise: true },
      },
      {
        label: "SAML SSO & SCIM",
        values: { hobby: false, team: false, scale: true, enterprise: true },
      },
      {
        label: "Data residency",
        values: { hobby: false, team: false, scale: false, enterprise: "EU, US, APAC" },
      },
    ],
  },
  {
    title: "Support",
    features: [
      {
        label: "Community forum",
        values: { hobby: true, team: true, scale: true, enterprise: true },
      },
      {
        label: "Response time",
        values: { hobby: false, team: "1 business day", scale: "4 hours", enterprise: "1 hour" },
      },
      {
        label: "Uptime SLA",
        values: { hobby: false, team: false, scale: "99.95%", enterprise: "99.99%" },
      },
    ],
  },
];

const subscribeNoop = () => () => {};

// False during SSR and hydration, true afterwards.
function useMounted() {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

function formatPrice(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function PricingTable({
  plans = PRICING_TABLE_SAMPLE_PLANS,
  featureGroups = PRICING_TABLE_SAMPLE_GROUPS,
  defaultBilling = "annual",
  billing: controlledBilling,
  onBillingChange,
  onPlanSelect,
  defaultCollapsedGroups = [],
  defaultMobilePlanId,
  currency = "USD",
  caption = "Plan comparison",
  maxHeight = 560,
  loading = false,
  className,
  theme = "auto",
  enableAnimations = true,
}: PricingTableProps) {
  const mounted = useMounted();
  const { resolvedTheme } = useTheme();
  const forcedTheme = theme === "auto" ? undefined : theme;
  const detectedIsDark = useBjorkTableIsDark(resolvedTheme, forcedTheme);
  const isDark = !mounted && theme === "auto" ? true : detectedIsDark;
  const palette = getBjorkTablePalette(isDark);
  const green = getBjorkSignalPalette("green", isDark);
  const shouldReduceMotion = useReducedMotion();
  const shouldAnimate = enableAnimations && !shouldReduceMotion;

  const [uncontrolledBilling, setUncontrolledBilling] = useState<PricingBilling>(defaultBilling);
  const billing = controlledBilling ?? uncontrolledBilling;
  // Keyboard changes swap prices instantly; pointer changes get the slide.
  const [instant, setInstant] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(defaultCollapsedGroups));
  const highlightedPlan = plans.find((plan) => plan.highlighted) ?? plans[0];
  const [mobilePlanId, setMobilePlanId] = useState<string | undefined>(
    defaultMobilePlanId ?? highlightedPlan?.id
  );
  const activeMobilePlanId = plans.some((plan) => plan.id === mobilePlanId)
    ? mobilePlanId
    : highlightedPlan?.id;
  const [compact, setCompact] = useState(false);
  const [openHint, setOpenHint] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const { width: rootWidth } = useElementSize(rootRef);
  const layout = rootWidth > 0 && rootWidth < 480 ? "narrow" : "wide";
  const uid = useId();

  const savings = useMemo(() => {
    let best = 0;
    for (const plan of plans) {
      if (plan.monthlyPrice && plan.annualPrice !== null && plan.monthlyPrice > 0) {
        best = Math.max(best, 1 - plan.annualPrice / plan.monthlyPrice);
      }
    }
    return Math.round(best * 100);
  }, [plans]);

  const setBilling = useCallback(
    (next: PricingBilling, fromKeyboard: boolean) => {
      setInstant(fromKeyboard);
      if (controlledBilling === undefined) setUncontrolledBilling(next);
      onBillingChange?.(next);
    },
    [controlledBilling, onBillingChange]
  );

  const toggleGroup = (title: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  const onScroll = () => {
    const top = scrollRef.current?.scrollTop ?? 0;
    setCompact((prev) => (prev ? top > 4 : top > 24));
  };

  useEffect(() => {
    if (!openHint) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpenHint(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openHint]);

  const billingOptions: { value: PricingBilling; label: string }[] = [
    { value: "monthly", label: "Monthly" },
    { value: "annual", label: "Annual" },
  ];

  const onRadioKey = <T extends string>(
    event: KeyboardEvent<HTMLButtonElement>,
    values: T[],
    current: T,
    select: (value: T) => void
  ) => {
    const index = values.indexOf(current);
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % values.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + values.length) % values.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = values.length - 1;
    if (next < 0) return;
    event.preventDefault();
    select(values[next]);
    const group = event.currentTarget.parentElement;
    const target = group?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next];
    target?.focus();
  };

  const surface = isDark ? "bg-[#111]" : "bg-[#fffcf6]";
  const strongText = isDark ? "text-[#ededed]" : "text-[#171717]";
  const accentEdge = isDark ? "border-[#ec5c13]/55" : "border-[#bd4514]/45";
  const accentWash = isDark ? "bg-[#ec5c13]/[0.045]" : "bg-[#ec5c13]/[0.04]";
  const focusRing =
    "outline-none focus-visible:ring-2 focus-visible:ring-[#ec5c13]/50 focus-visible:ring-offset-0";

  // Last visible row closes the highlighted column's border.
  const visibleGroups = featureGroups.map((group) => ({
    group,
    open: !collapsed.has(group.title),
  }));
  const lastOpenGroupIndex = visibleGroups.reduce(
    (last, entry, index) => (entry.open && entry.group.features.length > 0 ? index : last),
    -1
  );

  const planColClass = (plan: PricingPlan) =>
    cn(plan.id !== activeMobilePlanId && "group-data-[layout=narrow]/pt:hidden");

  const highlightCellClass = (plan: PricingPlan) =>
    plan.highlighted ? cn("relative border-x", accentEdge) : "";

  const renderValue = (value: PricingFeatureValue | undefined) => {
    if (value === true) {
      return (
        <span className="inline-flex items-center justify-center">
          <span
            className={cn(
              "inline-flex size-[18px] items-center justify-center rounded-full",
              isDark ? "bg-[#ec5c13]/14 text-[#d86a2c]" : "bg-[#ec5c13]/12 text-[#bd4514]"
            )}
          >
            <Check className="size-3" strokeWidth={2.6} aria-hidden="true" />
          </span>
          <span className="sr-only">Included</span>
        </span>
      );
    }
    if (value === false || value === undefined || value === "") {
      return (
        <span className="inline-flex items-center justify-center">
          <Minus className={cn("size-3.5", isDark ? "text-[#ededed]/22" : "text-[#171717]/24")} aria-hidden="true" />
          <span className="sr-only">Not included</span>
        </span>
      );
    }
    return (
      <span className={cn("text-[13px] tabular-nums", palette.primaryText)}>
        {typeof value === "number" ? value.toLocaleString("en-US") : value}
      </span>
    );
  };

  if (!loading && plans.length === 0) {
    return (
      <div
        ref={rootRef}
        className={cn(
          "mx-auto flex w-full max-w-[1040px] flex-col items-center justify-center gap-1 rounded-[18px] border px-6 py-14 text-center",
          palette.container,
          className
        )}
      >
        <p className={cn("text-[14px] font-medium", palette.primaryText)}>No plans to compare</p>
        <p className={cn("text-[13px]", palette.secondaryText)}>Add at least one plan to render the comparison.</p>
      </div>
    );
  }

  return (
    <div ref={rootRef} data-layout={layout} className={cn("group/pt mx-auto w-full max-w-[1040px]", className)}>
      <div className={cn("relative overflow-hidden rounded-[18px] border", palette.container)}>
        {/* Toolbar */}
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 group-data-[layout=wide]/pt:px-5",
            palette.divider
          )}
        >
          <div className="min-w-0">
            <p className={cn("text-[13px] font-medium", palette.primaryText)}>{caption}</p>
            <p className={cn("text-[12px]", palette.secondaryText)}>
              Prices in {currency}. Cancel any time.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div
              role="radiogroup"
              aria-label="Billing period"
              className={cn("inline-flex rounded-[10px] border p-0.5", palette.divider, palette.mutedSurface)}
            >
              {billingOptions.map((option) => {
                const checked = billing === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    tabIndex={checked ? 0 : -1}
                    onClick={(event) => setBilling(option.value, event.detail === 0)}
                    onKeyDown={(event) =>
                      onRadioKey(
                        event,
                        billingOptions.map((o) => o.value),
                        billing,
                        (value) => setBilling(value, true)
                      )
                    }
                    className={cn(
                      "relative rounded-[8px] px-3 py-1 text-[12.5px] font-medium transition-colors",
                      focusRing,
                      checked ? strongText : palette.secondaryText
                    )}
                  >
                    {checked && (
                      <motion.span
                        layoutId={shouldAnimate && !instant ? `${uid}-billing-pill` : undefined}
                        transition={{ type: "spring", stiffness: 520, damping: 40 }}
                        className={cn(
                          "absolute inset-0 rounded-[8px] border",
                          isDark
                            ? "border-[#2a2a2a] bg-[#202020]"
                            : "border-[#eadfce] bg-[#fffcf6] shadow-[var(--bjork-shadow-soft)]"
                        )}
                        aria-hidden="true"
                      />
                    )}
                    <span className="relative">{option.label}</span>
                  </button>
                );
              })}
            </div>
            {savings > 0 && (
              <span
                className={cn(
                  "rounded-[8px] border px-2 py-[3px] text-[11px] font-medium tabular-nums transition-opacity",
                  green.bgColor,
                  green.borderColor,
                  green.textColor,
                  billing === "annual" ? "opacity-100" : "opacity-70"
                )}
              >
                Save {savings}%<span className="sr-only"> with annual billing</span>
              </span>
            )}
          </div>
        </div>

        {/* Narrow layout: one plan at a time */}
        {plans.length > 1 && (
          <div className={cn("hidden border-b px-3 py-2.5 group-data-[layout=narrow]/pt:block", palette.divider)}>
            <div
              role="radiogroup"
              aria-label="Plan to compare"
              className={cn("grid rounded-[10px] border p-0.5", palette.divider, palette.mutedSurface)}
              style={{ gridTemplateColumns: `repeat(${plans.length}, minmax(0, 1fr))` }}
            >
              {plans.map((plan) => {
                const checked = plan.id === activeMobilePlanId;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    tabIndex={checked ? 0 : -1}
                    onClick={() => setMobilePlanId(plan.id)}
                    onKeyDown={(event) =>
                      onRadioKey(
                        event,
                        plans.map((p) => p.id),
                        activeMobilePlanId ?? plans[0].id,
                        setMobilePlanId
                      )
                    }
                    className={cn(
                      "relative truncate rounded-[8px] px-1.5 py-1.5 text-[12px] font-medium transition-colors",
                      focusRing,
                      checked ? strongText : palette.secondaryText
                    )}
                  >
                    {checked && (
                      <span
                        className={cn(
                          "absolute inset-0 rounded-[8px] border",
                          plan.highlighted
                            ? cn(accentEdge, isDark ? "bg-[#202020]" : "bg-[#fffcf6]")
                            : isDark
                              ? "border-[#2a2a2a] bg-[#202020]"
                              : "border-[#eadfce] bg-[#fffcf6] shadow-[var(--bjork-shadow-soft)]"
                        )}
                        aria-hidden="true"
                      />
                    )}
                    <span className="relative">{plan.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div
          ref={scrollRef}
          onScroll={onScroll}
          role="region"
          aria-label={`${caption}, scrollable`}
          tabIndex={0}
          className={cn("relative overflow-auto overscroll-contain", focusRing, "focus-visible:ring-inset")}
          style={{ maxHeight }}
        >
          <table className="w-full min-w-0 table-fixed border-separate border-spacing-0 group-data-[layout=wide]/pt:min-w-[640px]">
            <caption className="sr-only">
              {caption}, billed {billing === "annual" ? "annually" : "monthly"}
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className={cn(
                    "sticky top-0 z-20 w-[52%] border-b px-4 pb-4 pt-7 text-left align-bottom group-data-[layout=wide]/pt:w-[25%] group-data-[layout=wide]/pt:px-5",
                    surface,
                    palette.divider
                  )}
                >
                  <span className={cn("text-[11px] font-medium uppercase tracking-[0.08em]", palette.secondaryText)}>
                    Features
                  </span>
                </th>
                {plans.map((plan) => {
                  const price = billing === "annual" ? plan.annualPrice : plan.monthlyPrice;
                  const priceText =
                    price === null ? plan.customPriceLabel ?? "Custom" : formatPrice(price, currency);
                  return (
                    <th
                      key={plan.id}
                      scope="col"
                      className={cn(
                        "sticky top-0 z-20 border-b px-3 pb-4 pt-7 text-left align-top font-normal group-data-[layout=wide]/pt:px-4",
                        surface,
                        palette.divider,
                        planColClass(plan),
                        plan.highlighted && cn("rounded-t-[14px] border-x border-t", accentEdge)
                      )}
                    >
                      {plan.highlighted && (
                        <span aria-hidden="true" className={cn("pointer-events-none absolute inset-0 rounded-t-[13px]", accentWash)} />
                      )}
                      {plan.highlighted && (
                        <span
                          className={cn(
                            "absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap rounded-b-[7px] border border-t-0 px-2 pb-[2px] pt-[1px] text-[10px] font-medium uppercase tracking-[0.08em]",
                            accentEdge,
                            isDark ? "bg-[#1d130d] text-[#d86a2c]" : "bg-[#fbeee3] text-[#bd4514]"
                          )}
                        >
                          {plan.badge ?? "Recommended"}
                        </span>
                      )}
                      <div className="relative flex min-w-0 flex-col">
                        <span className={cn("block truncate text-[14px] font-semibold tracking-tight", strongText)}>
                          {plan.name}
                        </span>
                        <div
                          className={cn(
                            "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
                            compact ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
                          )}
                        >
                          <p className={cn("min-h-0 overflow-hidden text-[12px] leading-[1.4]", palette.secondaryText)}>
                            <span className="block pt-1">{plan.blurb}</span>
                          </p>
                        </div>
                        <div className="mt-3 flex items-baseline">
                          <span className="relative inline-flex h-[30px] shrink-0 items-baseline overflow-hidden">
                            <AnimatePresence initial={false} mode="popLayout">
                              <motion.span
                                key={`${billing}-${priceText}`}
                                initial={shouldAnimate && !instant ? { y: billing === "annual" ? 14 : -14, opacity: 0 } : false}
                                animate={{ y: 0, opacity: 1 }}
                                exit={
                                  shouldAnimate && !instant
                                    ? { y: billing === "annual" ? -14 : 14, opacity: 0 }
                                    : { opacity: 0, transition: { duration: 0 } }
                                }
                                transition={{ type: "spring", stiffness: 520, damping: 38 }}
                                className={cn("text-[26px] font-semibold leading-[30px] tracking-tight tabular-nums", strongText)}
                              >
                                {priceText}
                              </motion.span>
                            </AnimatePresence>
                          </span>
                        </div>
                        <p className={cn("h-4 truncate text-[11.5px] leading-4", palette.secondaryText)}>
                          {plan.priceSuffix ?? "\u00a0"}
                        </p>
                        <p className={cn("h-4 truncate text-[11px] leading-4 tabular-nums", palette.secondaryText)}>
                          {billing === "annual" && plan.monthlyPrice && plan.annualPrice !== null && plan.annualPrice < plan.monthlyPrice
                            ? `${formatPrice(plan.monthlyPrice, currency)} billed monthly`
                            : billing === "monthly" && plan.annualPrice && plan.monthlyPrice && plan.annualPrice < plan.monthlyPrice
                              ? `${formatPrice(plan.annualPrice, currency)} billed yearly`
                              : " "}
                        </p>
                        <button
                          type="button"
                          onClick={() => onPlanSelect?.(plan.id, billing)}
                          aria-label={`${plan.ctaLabel}, ${plan.name} plan`}
                          className={cn(
                            "mt-3 inline-flex h-8 w-full items-center justify-center whitespace-nowrap rounded-[9px] border px-1.5 text-[12.5px] font-medium transition-[background-color,transform] active:scale-[0.98]",
                            focusRing,
                            plan.highlighted
                              ? isDark
                                ? "border-[#ec5c13] bg-[#ec5c13] text-[#111] hover:bg-[#d86a2c]"
                                : "border-[#bd4514] bg-[#bd4514] text-[#fffcf6] hover:bg-[#d86a2c]"
                              : palette.control
                          )}
                        >
                          <span className="truncate">{plan.ctaLabel}</span>
                        </button>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            {loading ? (
              <tbody aria-busy="true">
                {Array.from({ length: 7 }, (_, row) => (
                  <tr key={row}>
                    <td className={cn("border-b px-4 py-3.5 group-data-[layout=wide]/pt:px-5", palette.divider)}>
                      <span
                        className={cn("block h-3 animate-pulse rounded-full motion-reduce:animate-none", palette.mutedSurface)}
                        style={{ width: `${48 + ((row * 17) % 36)}%` }}
                      />
                    </td>
                    {plans.map((plan) => (
                      <td
                        key={plan.id}
                        className={cn("border-b px-3 py-3.5 text-center", palette.divider, planColClass(plan), highlightCellClass(plan))}
                      >
                        <span className={cn("mx-auto block h-3 w-10 animate-pulse rounded-full motion-reduce:animate-none", palette.mutedSurface)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ) : (
              visibleGroups.map(({ group, open }, groupIndex) => {
                const groupId = `${uid}-group-${groupIndex}`;
                return (
                  <tbody key={group.title}>
                    <tr>
                      <th
                        scope="colgroup"
                        colSpan={layout === "narrow" ? 2 : plans.length + 1}
                        className={cn("p-0 text-left", palette.mutedSurface)}
                      >
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-controls={groupId}
                          onClick={() => toggleGroup(group.title)}
                          className={cn(
                            "flex w-full items-center gap-2 border-b px-4 py-2 text-left group-data-[layout=wide]/pt:px-5",
                            palette.divider,
                            focusRing,
                            "focus-visible:ring-inset"
                          )}
                        >
                          <ChevronDown
                            aria-hidden="true"
                            className={cn(
                              "size-3.5 transition-transform duration-200 motion-reduce:transition-none",
                              palette.secondaryText,
                              !open && "-rotate-90"
                            )}
                          />
                          <span className={cn("text-[11px] font-medium uppercase tracking-[0.08em]", palette.secondaryText)}>
                            {group.title}
                          </span>
                          <span className={cn("ml-auto text-[11px] tabular-nums", palette.secondaryText)}>
                            {group.features.length}
                          </span>
                        </button>
                      </th>
                    </tr>
                    {group.features.map((feature, featureIndex) => {
                      const hintKey = `${groupIndex}-${featureIndex}`;
                      const hintId = `${uid}-hint-${hintKey}`;
                      const isLastRow = groupIndex === lastOpenGroupIndex && featureIndex === group.features.length - 1;
                      return (
                        <motion.tr
                          key={feature.label}
                          id={featureIndex === 0 ? groupId : undefined}
                          hidden={!open}
                          initial={false}
                          animate={open ? { opacity: 1 } : { opacity: 0 }}
                          transition={shouldAnimate ? { duration: 0.18, delay: featureIndex * 0.02 } : { duration: 0 }}
                          className={cn("group/row transition-colors", isDark ? "hover:bg-[#181818]/70" : "hover:bg-[#f8f2e7]/72")}
                        >
                          <th
                            scope="row"
                            className={cn(
                              "border-b px-4 py-3 text-left text-[13px] font-normal group-data-[layout=wide]/pt:px-5",
                              palette.divider,
                              palette.primaryText
                            )}
                          >
                            <span className="relative inline-flex max-w-full items-center gap-1.5">
                              <span className="min-w-0">{feature.label}</span>
                              {feature.hint && (
                                <span className="relative inline-flex">
                                  <button
                                    type="button"
                                    aria-label={`About ${feature.label}`}
                                    aria-describedby={openHint === hintKey ? hintId : undefined}
                                    onMouseEnter={() => setOpenHint(hintKey)}
                                    onMouseLeave={() => setOpenHint((current) => (current === hintKey ? null : current))}
                                    onFocus={() => setOpenHint(hintKey)}
                                    onBlur={() => setOpenHint((current) => (current === hintKey ? null : current))}
                                    onClick={() => setOpenHint((current) => (current === hintKey ? null : hintKey))}
                                    className={cn(
                                      "inline-flex size-5 items-center justify-center rounded-full transition-colors",
                                      focusRing,
                                      isDark ? "text-[#ededed]/30 hover:text-[#ededed]/70" : "text-[#171717]/30 hover:text-[#171717]/70"
                                    )}
                                  >
                                    <Info className="size-3.5" aria-hidden="true" />
                                  </button>
                                  <AnimatePresence>
                                    {openHint === hintKey && (
                                      <motion.span
                                        id={hintId}
                                        role="tooltip"
                                        initial={shouldAnimate ? { opacity: 0, y: 4 } : { opacity: 1 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={shouldAnimate ? { opacity: 0, y: 2, transition: { duration: 0.1 } } : { opacity: 0, transition: { duration: 0 } }}
                                        transition={{ type: "spring", stiffness: 520, damping: 36 }}
                                        className={cn(
                                          "absolute left-1/2 top-full z-30 mt-1.5 w-[220px] -translate-x-1/2 rounded-[10px] border px-3 py-2 text-[12px] font-normal leading-[1.45] group-data-[layout=narrow]/pt:left-auto group-data-[layout=narrow]/pt:right-[-60px] group-data-[layout=narrow]/pt:translate-x-0",
                                          palette.menu
                                        )}
                                      >
                                        {feature.hint}
                                      </motion.span>
                                    )}
                                  </AnimatePresence>
                                </span>
                              )}
                            </span>
                          </th>
                          {plans.map((plan) => (
                            <td
                              key={plan.id}
                              className={cn(
                                "border-b px-3 py-3 text-center",
                                palette.divider,
                                planColClass(plan),
                                highlightCellClass(plan),
                                plan.highlighted && accentWash,
                                plan.highlighted && isLastRow && cn("rounded-b-[14px]", accentEdge)
                              )}
                            >
                              {renderValue(feature.values[plan.id])}
                            </td>
                          ))}
                        </motion.tr>
                      );
                    })}
                  </tbody>
                );
              })
            )}
          </table>
          {!loading && featureGroups.length === 0 && (
            <p className={cn("px-5 py-10 text-center text-[13px]", palette.secondaryText)}>
              No features listed for these plans yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
