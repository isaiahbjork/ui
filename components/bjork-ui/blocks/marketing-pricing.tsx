"use client";

import { Fragment, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Minus } from "lucide-react";
import {
  blockFrame,
  blockToneProps,
  focusRing,
  Reveal,
  SectionHeader,
  useBlockReducedMotion,
  type BlockTone,
} from "@/components/bjork-ui/blocks/marketing-kit";
import { cn } from "@/lib/utils";

export type PricingBillingPeriod = "monthly" | "annual";

export interface MarketingPricingPlan {
  id: string;
  name: string;
  blurb: string;
  /** Price per month when billed monthly. `null` shows `customLabel`. */
  monthly: number | null;
  /** Effective price per month when billed annually. */
  annual: number | null;
  customLabel?: string;
  /** Shown under the price, such as "per month, 5 seats included". */
  unit?: string;
  cta: { label: string; href: string };
  highlighted?: boolean;
  /** Badge on the highlighted plan. */
  badge?: string;
  /** Line above the feature list, such as "Everything in Hobby, plus". */
  featuresHeading?: string;
  features: string[];
}

export type ComparisonValue = boolean | string;

export interface ComparisonGroup {
  title: string;
  rows: { label: string; values: Record<string, ComparisonValue> }[];
}

export interface MarketingPricingProps {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  plans: MarketingPricingPlan[];
  /** Feature comparison under the cards. Omit to hide it. */
  comparison?: ComparisonGroup[];
  defaultCompareOpen?: boolean;
  defaultBilling?: PricingBillingPeriod;
  /** Controlled billing period. */
  billing?: PricingBillingPeriod;
  onBillingChange?: (billing: PricingBillingPeriod) => void;
  /** Called when a plan's button is pressed, before the link navigates. */
  onPlanSelect?: (planId: string, billing: PricingBillingPeriod) => void;
  /** Label next to the toggle, such as "2 months free". Defaults to the largest saving. */
  savingsLabel?: string;
  currency?: string;
  footnote?: ReactNode;
  tone?: BlockTone;
  /** Play the in-view and price motion. Turn off for screenshots. */
  animate?: boolean;
  className?: string;
}

export const MARKETING_PRICING_SAMPLE: MarketingPricingProps = {
  eyebrow: "Pricing",
  title: "Pay for traces, not seats.",
  description:
    "Every plan includes the whole team. Start free, and move up when your agents do more than you can read by hand.",
  plans: [
    {
      id: "hobby",
      name: "Hobby",
      blurb: "For a side project or a first agent.",
      monthly: 0,
      annual: 0,
      unit: "free forever",
      cta: { label: "Start free", href: "#signup" },
      features: ["10,000 traces a month", "7-day retention", "Replay and search", "Community support"],
    },
    {
      id: "team",
      name: "Team",
      blurb: "For agents your customers talk to.",
      monthly: 79,
      annual: 64,
      unit: "per month, whole team",
      cta: { label: "Start 14-day trial", href: "#trial" },
      highlighted: true,
      badge: "Most teams",
      featuresHeading: "Everything in Hobby, plus",
      features: [
        "500,000 traces a month",
        "30-day retention",
        "Alerts on any span",
        "Cost per run and per user",
        "Masking rules for personal data",
      ],
    },
    {
      id: "scale",
      name: "Scale",
      blurb: "For many agents across many teams.",
      monthly: 349,
      annual: 279,
      unit: "per month, whole org",
      cta: { label: "Choose Scale", href: "#scale" },
      featuresHeading: "Everything in Team, plus",
      features: ["5M traces a month", "1-year retention", "SSO and audit log", "Dedicated region", "Support within 4 hours"],
    },
  ],
  comparison: [
    {
      title: "Tracing",
      rows: [
        { label: "Traces per month", values: { hobby: "10k", team: "500k", scale: "5M" } },
        { label: "Retention", values: { hobby: "7 days", team: "30 days", scale: "1 year" } },
        { label: "Replay from any step", values: { hobby: true, team: true, scale: true } },
        { label: "OpenTelemetry export", values: { hobby: false, team: true, scale: true } },
      ],
    },
    {
      title: "Monitoring",
      rows: [
        { label: "Alerts", values: { hobby: false, team: "25 rules", scale: "Unlimited" } },
        { label: "Cost tracking", values: { hobby: "Per run", team: "Per run and user", scale: "Per run and user" } },
        { label: "Evaluations", values: { hobby: false, team: false, scale: true } },
      ],
    },
    {
      title: "Security",
      rows: [
        { label: "Personal data masking", values: { hobby: "Default rules", team: "Custom rules", scale: "Custom rules" } },
        { label: "SSO and SCIM", values: { hobby: false, team: false, scale: true } },
        { label: "Audit log", values: { hobby: false, team: false, scale: true } },
      ],
    },
  ],
  footnote: "Prices in USD before tax. Traces over your plan are billed at $0.40 per thousand, and we email you before that happens.",
};

/**
 * A pricing section: billing toggle, plan cards with prices that roll when the period changes, and a
 * feature comparison that opens below. The comparison is a real table, scrollable with a pinned first
 * column on narrow screens.
 */
export function MarketingPricing({
  eyebrow,
  title,
  description,
  plans,
  comparison,
  defaultCompareOpen = false,
  defaultBilling = "annual",
  billing: controlledBilling,
  onBillingChange,
  onPlanSelect,
  savingsLabel,
  currency = "$",
  footnote,
  tone = "auto",
  animate = true,
  className,
}: MarketingPricingProps) {
  const titleId = useId();
  const toneProps = blockToneProps(tone);
  const [uncontrolled, setUncontrolled] = useState<PricingBillingPeriod>(defaultBilling);
  const billing = controlledBilling ?? uncontrolled;
  const setBilling = (next: PricingBillingPeriod) => {
    if (controlledBilling === undefined) setUncontrolled(next);
    onBillingChange?.(next);
  };

  const bestSaving = plans.reduce((best, plan) => {
    if (!plan.monthly || plan.annual === null) return best;
    return Math.max(best, Math.round((1 - plan.annual / plan.monthly) * 100));
  }, 0);
  const savings = savingsLabel ?? (bestSaving > 0 ? `Save ${bestSaving}%` : undefined);

  const columns =
    plans.length >= 4
      ? "@4xl:max-w-[1120px] @4xl:grid-cols-4"
      : plans.length === 3
        ? "@4xl:max-w-[1120px] @4xl:grid-cols-3"
        : "@3xl:max-w-[760px] @3xl:grid-cols-2";

  return (
    <section
      aria-labelledby={titleId}
      {...toneProps}
      className={cn(
        "@container w-full bg-[var(--bjork-bg)] py-20 font-bjork-alpha text-[color:var(--bjork-text)] @3xl:py-28",
        toneProps.className,
        className,
      )}
    >
      <div className={blockFrame}>
        <SectionHeader id={titleId} eyebrow={eyebrow} title={title} description={description} align="center" className="mx-auto">
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <BillingToggle value={billing} onChange={setBilling} animate={animate} />
            {savings ? (
              <span
                className={cn(
                  "rounded-full border border-[color:var(--bjork-accent-muted)] bg-[var(--bjork-accent-soft)] px-2.5 py-1 font-mono text-[11px] text-[color:var(--bjork-accent)] transition-opacity duration-200",
                  billing === "annual" ? "opacity-100" : "opacity-60",
                )}
              >
                {savings}
                <span className="sr-only"> with annual billing</span>
              </span>
            ) : null}
          </div>
        </SectionHeader>

        <ul className={cn("mx-auto mt-12 grid max-w-[480px] grid-cols-1 gap-3 @3xl:mt-16", columns)}>
          {plans.map((plan, index) => {
            const card = (
              <PlanCard plan={plan} billing={billing} currency={currency} animate={animate} onPlanSelect={onPlanSelect} />
            );
            return animate ? (
              <Reveal key={plan.id} as="li" delay={index * 0.06} className="flex">
                {card}
              </Reveal>
            ) : (
              <li key={plan.id} className="flex">
                {card}
              </li>
            );
          })}
        </ul>

        {comparison && comparison.length > 0 ? (
          <Comparison plans={plans} groups={comparison} defaultOpen={defaultCompareOpen} />
        ) : null}

        {footnote ? (
          <p className="mx-auto mt-10 max-w-[64ch] text-center text-[13px] leading-6 text-[color:var(--bjork-text-muted)]">
            {footnote}
          </p>
        ) : null}
      </div>
    </section>
  );
}

const PERIODS: { value: PricingBillingPeriod; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Annual" },
];

function BillingToggle({
  value,
  onChange,
  animate,
}: {
  value: PricingBillingPeriod;
  onChange: (value: PricingBillingPeriod) => void;
  animate: boolean;
}) {
  const reduce = useBlockReducedMotion();
  const pillId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  // Radio group keyboard model: arrows move the selection and the focus together.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    let next = index;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = PERIODS.length - 1;
    else next = (index + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + PERIODS.length) % PERIODS.length;
    onChange(PERIODS[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Billing period"
      className="relative flex rounded-[13px] border border-[color:var(--bjork-border)] bg-[var(--bjork-field-inset)] p-1 shadow-[var(--bjork-shadow-inset)]"
    >
      {PERIODS.map((period, index) => {
        const checked = value === period.value;
        return (
          <button
            key={period.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(period.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "relative h-9 rounded-[10px] px-4 text-[13.5px] font-medium transition-colors duration-150",
              checked ? "text-[color:var(--bjork-text)]" : "text-[color:var(--bjork-text-muted)] hover:text-[color:var(--bjork-text-medium)]",
              focusRing,
            )}
          >
            {checked ? (
              <motion.span
                layoutId={animate && !reduce ? pillId : undefined}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-[10px] border border-[color:var(--bjork-border)] bg-[var(--bjork-surface)] shadow-[var(--bjork-shadow-surface)]"
              />
            ) : null}
            <span className="relative">{period.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function formatPrice(value: number, currency: string) {
  return `${currency}${value.toLocaleString("en-US")}`;
}

function PlanCard({
  plan,
  billing,
  currency,
  animate,
  onPlanSelect,
}: {
  plan: MarketingPricingPlan;
  billing: PricingBillingPeriod;
  currency: string;
  animate: boolean;
  onPlanSelect?: (planId: string, billing: PricingBillingPeriod) => void;
}) {
  const reduce = useBlockReducedMotion();
  const nameId = useId();
  const price = billing === "annual" ? plan.annual : plan.monthly;
  const priceText = price === null ? plan.customLabel ?? "Custom" : formatPrice(price, currency);
  const roll = animate && !reduce;
  const direction = billing === "annual" ? 1 : -1;
  const yearly =
    billing === "annual" && plan.annual ? `${formatPrice(plan.annual * 12, currency)} billed yearly` : null;
  const monthlyNote =
    billing === "monthly" && plan.annual && plan.monthly && plan.annual < plan.monthly
      ? `${formatPrice(plan.annual, currency)}/mo billed yearly`
      : null;

  return (
    <article
      aria-labelledby={nameId}
      className={cn(
        "relative flex w-full flex-col rounded-[22px] border p-6 @xl:p-7",
        plan.highlighted
          ? "border-[color:var(--bjork-accent-muted)] bg-[var(--bjork-surface)] shadow-[0_0_0_4px_var(--bjork-accent-soft),var(--bjork-shadow-panel)]"
          : "border-[color:var(--bjork-border)] bg-[var(--bjork-surface)] shadow-[var(--bjork-shadow-panel)]",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id={nameId} className="text-[17px] font-semibold tracking-[-0.02em]">
          {plan.name}
        </h3>
        {plan.highlighted && plan.badge ? (
          <span className="rounded-full bg-[var(--bjork-accent-soft)] px-2.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-[color:var(--bjork-accent)]">
            {plan.badge}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-[14px] leading-6 text-[color:var(--bjork-text-muted)]">{plan.blurb}</p>

      <div className="mt-6 flex items-end gap-2">
        <span className="relative inline-flex h-[52px] items-end overflow-hidden font-bjork-display text-[48px] font-semibold leading-none tracking-[-0.045em] tabular-nums">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={priceText}
              initial={roll ? { y: 28 * direction, opacity: 0 } : { opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={roll ? { y: -28 * direction, opacity: 0 } : { opacity: 0 }}
              transition={roll ? { type: "spring", stiffness: 380, damping: 32 } : { duration: 0.15 }}
              className="block"
            >
              {priceText}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>
      <p className="mt-2 min-h-[40px] text-[13px] leading-5 text-[color:var(--bjork-text-muted)]">
        {plan.unit}
        {yearly || monthlyNote ? (
          <span className="block text-[color:var(--bjork-text-soft)]">{yearly ?? monthlyNote}</span>
        ) : null}
      </p>

      <a
        href={plan.cta.href}
        onClick={() => onPlanSelect?.(plan.id, billing)}
        aria-describedby={nameId}
        className={cn(
          "mt-6 inline-flex h-11 items-center justify-center rounded-[13px] px-4 text-[14px] font-medium tracking-[-0.01em] transition-[transform,background-color,border-color] duration-150 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100",
          plan.highlighted
            ? "bjork-layered-button-accent text-white"
            : "border border-[color:var(--bjork-border-strong)] bg-[var(--bjork-surface)] text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-soft)] hover:bg-[var(--bjork-surface-hover)]",
          focusRing,
        )}
      >
        {plan.cta.label}
      </a>

      <div className="mt-7 border-t border-[color:var(--bjork-border-muted)] pt-6">
        {plan.featuresHeading ? (
          <p className="mb-3 text-[12.5px] font-medium text-[color:var(--bjork-text-medium)]">{plan.featuresHeading}</p>
        ) : null}
        <ul className="flex flex-col gap-2.5">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5 text-[14px] leading-5 text-[color:var(--bjork-text-medium)]">
              <Check
                aria-hidden
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  plan.highlighted ? "text-[color:var(--bjork-accent)]" : "text-[color:var(--bjork-text-soft)]",
                )}
              />
              {feature}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function Comparison({
  plans,
  groups,
  defaultOpen,
}: {
  plans: MarketingPricingPlan[];
  groups: ComparisonGroup[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const reduce = useBlockReducedMotion();
  const panelId = useId();
  const captionId = useId();

  return (
    <div className="mx-auto mt-10 max-w-[1120px]">
      <div className="flex justify-center">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className={cn(
            "group/compare inline-flex h-10 items-center gap-2 rounded-full px-4 text-[14px] text-[color:var(--bjork-text-medium)] transition-colors duration-150 hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)]",
            focusRing,
          )}
        >
          {open ? "Hide the full comparison" : "Compare every feature"}
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 transition-transform duration-200 ease-out motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="panel"
            id={panelId}
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: reduce ? 0.15 : 0.35, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <div
              role="region"
              aria-labelledby={captionId}
              tabIndex={0}
              className={cn(
                "mt-6 overflow-x-auto rounded-[20px] border border-[color:var(--bjork-border)] bg-[var(--bjork-surface)] shadow-[var(--bjork-shadow-panel)]",
                focusRing,
              )}
            >
              <table className="w-full min-w-[560px] border-collapse text-left text-[14px]">
                <caption id={captionId} className="sr-only">
                  Feature comparison by plan
                </caption>
                <thead>
                  <tr className="border-b border-[color:var(--bjork-border)]">
                    <th
                      scope="col"
                      className="sticky left-0 z-10 w-[34%] bg-[var(--bjork-surface)] px-5 py-4 font-mono text-[10.5px] font-normal uppercase tracking-[0.12em] text-[color:var(--bjork-text-soft)]"
                    >
                      Feature
                    </th>
                    {plans.map((plan) => (
                      <th
                        key={plan.id}
                        scope="col"
                        className={cn(
                          "px-4 py-4 text-center text-[14px] font-semibold",
                          plan.highlighted && "text-[color:var(--bjork-accent)]",
                        )}
                      >
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <Fragment key={group.title}>
                      <tr className="bg-[var(--bjork-panel)]">
                        <th
                          scope="colgroup"
                          colSpan={plans.length + 1}
                          className="px-0 py-2.5 font-mono text-[10.5px] font-normal uppercase tracking-[0.12em] text-[color:var(--bjork-text-muted)]"
                        >
                          {/* A full-width cell cannot pin, so the label inside it does. */}
                          <span className="sticky left-0 inline-block px-5">{group.title}</span>
                        </th>
                      </tr>
                      {group.rows.map((row) => (
                        <tr key={row.label} className="border-t border-[color:var(--bjork-border-muted)]">
                          <th
                            scope="row"
                            className="sticky left-0 z-10 bg-[var(--bjork-surface)] px-5 py-3.5 font-normal text-[color:var(--bjork-text-medium)]"
                          >
                            {row.label}
                          </th>
                          {plans.map((plan) => (
                            <td
                              key={plan.id}
                              className={cn(
                                "px-4 py-3.5 text-center tabular-nums",
                                plan.highlighted && "bg-[color-mix(in_srgb,var(--bjork-accent-soft)_55%,transparent)]",
                              )}
                            >
                              <ComparisonCell value={row.values[plan.id]} highlighted={plan.highlighted} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ComparisonCell({ value, highlighted }: { value: ComparisonValue | undefined; highlighted?: boolean }) {
  if (value === true) {
    return (
      <>
        <Check
          aria-hidden
          className={cn(
            "mx-auto size-4",
            highlighted ? "text-[color:var(--bjork-accent)]" : "text-[color:var(--bjork-text-medium)]",
          )}
        />
        <span className="sr-only">Included</span>
      </>
    );
  }
  if (value === false || value === undefined) {
    return (
      <>
        <Minus aria-hidden className="mx-auto size-4 text-[color:var(--bjork-text-faint)]" />
        <span className="sr-only">Not included</span>
      </>
    );
  }
  return <span className="text-[13.5px] text-[color:var(--bjork-text)]">{value}</span>;
}
