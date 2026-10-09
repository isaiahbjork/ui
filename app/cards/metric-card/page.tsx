"use client";

import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { MetricCard } from "@/components/bjork-ui/cards/metric-card";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("metric-card");

export default function Page() {
  return (
    <SimpleComponentDemoPage
      item={item}
      description="A KPI tile: headline value, delta against the previous period and a sparkline you can scrub with the pointer or the arrow keys. Switching the period re-totals the number and redraws the line."
      dependencies={["framer-motion", "lucide-react", "next-themes"]}
      interactionRows={[
        { label: "Scrub", value: "Pointer or arrow keys; Home, End, Page Up/Down; Escape resets" },
        { label: "Period", value: "Radio group with a sliding indicator; arrow keys switch" },
        { label: "Compare", value: "Dashed line is the previous period; delta colours flip with invert" },
      ]}
      usageCode={`import { MetricCard } from "@/components/bjork-ui/cards/metric-card";

<MetricCard
  label="Net revenue"
  periods={["7d", "30d", "90d"]}
  data={{
    "7d": { points: [{ t: Date.UTC(2026, 9, 1), v: 4210 }, /* … */], previous: [3980 /* … */] },
    "30d": { points: thirtyDays, previous: priorThirtyDays },
  }}
  aggregate="sum" // "last" for levels like MRR
  format="currency"
  currency="USD"
  onPeriodChange={(p) => track("metric_period", p)}
/>

// Lower is better:
<MetricCard label="Churn" format="percent" aggregate="average" invert data={churn} />`}
      previewScaleClassName="w-[440px] scale-[0.95]"
    >
      <MetricCard />
    </SimpleComponentDemoPage>
  );
}
