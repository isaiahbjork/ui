"use client";

import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { PricingTable, type PricingBilling } from "@/components/bjork-ui/tables/pricing-table";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("pricing-table");

export default function PricingTableDemo() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const tableTheme = previewTheme === "light" || previewTheme === "dark" ? previewTheme : "auto";

  const handlePlanSelect = (planId: string, billing: PricingBilling) => {
    console.log("Selected plan:", planId, billing);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A plan comparison table for pricing pages. The plan header with price and call to action stays pinned while the feature list scrolls, groups collapse, and on narrow screens a plan selector shows one column at a time."
      usageCode={`import {
  PricingTable,
  type PricingPlan,
  type PricingFeatureGroup,
} from "@/components/bjork-ui/tables/pricing-table";

const plans: PricingPlan[] = [
  { id: "team", name: "Team", blurb: "Targeting and rollouts.", monthlyPrice: 24, annualPrice: 19,
    priceSuffix: "per seat / mo", ctaLabel: "Start trial", highlighted: true },
  { id: "scale", name: "Scale", blurb: "Experiments and SSO.", monthlyPrice: 64, annualPrice: 52,
    priceSuffix: "per seat / mo", ctaLabel: "Upgrade" },
];

const featureGroups: PricingFeatureGroup[] = [
  { title: "Flags", features: [
    { label: "Segment targeting", hint: "Target by any attribute.", values: { team: true, scale: true } },
    { label: "Environments", values: { team: 5, scale: 20 } },
  ] },
];

<PricingTable
  plans={plans}
  featureGroups={featureGroups}
  defaultBilling="annual"
  onPlanSelect={(planId, billing) => startCheckout(planId, billing)}
/>`}
      previewScaleClassName="w-[1000px] scale-[0.8]"
      previewLayout={isPreview ? "single" : "list"}
    >
      <PricingTable
        onPlanSelect={handlePlanSelect}
        theme={tableTheme}
        enableAnimations={!isPreview}
        maxHeight={isPreview ? 500 : 560}
      />
    </SimpleComponentDemoPage>
  );
}
