"use client";

import {
  MarketingPricing,
  MARKETING_PRICING_SAMPLE,
} from "@/components/bjork-ui/blocks/marketing-pricing";
import { MarketingBlockDemo } from "@/components/marketing-block-demo";

export default function MarketingPricingDemo() {
  return (
    <MarketingBlockDemo
      slug="marketing-pricing"
      description="A pricing section with a monthly and annual toggle, plan cards whose prices roll to the new period, and a full feature comparison that opens underneath. The toggle is a proper radio group with arrow keys, and the comparison is a real table that scrolls sideways on phones with its feature column pinned."
      usageCode={`import {
  MarketingPricing,
  type MarketingPricingPlan,
} from "@/components/bjork-ui/blocks/marketing-pricing";

const plans: MarketingPricingPlan[] = [
  { id: "hobby", name: "Hobby", blurb: "For a first agent.", monthly: 0, annual: 0,
    unit: "free forever", cta: { label: "Start free", href: "/signup" },
    features: ["10,000 traces a month", "7-day retention"] },
  { id: "team", name: "Team", blurb: "For agents customers talk to.", monthly: 79, annual: 64,
    unit: "per month, whole team", cta: { label: "Start trial", href: "/trial" },
    highlighted: true, badge: "Most teams",
    featuresHeading: "Everything in Hobby, plus",
    features: ["500,000 traces a month", "Alerts on any span"] },
];

<MarketingPricing
  title="Pay for traces, not seats."
  plans={plans}
  comparison={[
    { title: "Tracing", rows: [
      { label: "Retention", values: { hobby: "7 days", team: "30 days" } },
      { label: "OpenTelemetry export", values: { hobby: false, team: true } },
    ] },
  ]}
  onPlanSelect={(planId, billing) => track("plan_selected", { planId, billing })}
/>`}
      note="Prices are per month; the annual price is the effective monthly rate and the card works out the yearly total. The savings badge defaults to the largest discount across plans. Pass `billing` and `onBillingChange` to control the period from outside, for example to sync it with a URL parameter."
      previewOffset={40}
      render={({ isPreview }) => <MarketingPricing {...MARKETING_PRICING_SAMPLE} animate={!isPreview} />}
    />
  );
}
