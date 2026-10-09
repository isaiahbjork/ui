"use client";

import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { PLAN_USAGE_SAMPLE, PlanUsageCard } from "@/components/bjork-ui/cards/plan-usage-card";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("plan-usage-card");

export default function Page() {
  return (
    <SimpleComponentDemoPage
      item={item}
      description="Plan usage for the current billing cycle. Each meter projects its cycle-end total from the pace so far, warns before a limit is hit and says what happens past it."
      dependencies={["framer-motion", "lucide-react", "next-themes"]}
      interactionRows={[
        { label: "Meters", value: "role=meter with value text; notes linked by aria-describedby" },
        { label: "Pace", value: "Hatched ghost shows the projected cycle-end total" },
        { label: "Motion", value: "Fills sweep in once; static under reduced motion" },
      ]}
      usageCode={`import { PlanUsageCard } from "@/components/bjork-ui/cards/plan-usage-card";

<PlanUsageCard
  planName="Pro"
  price="$20"
  interval="month"
  cycleStart="2026-10-01T00:00:00Z"
  cycleEnd="2026-11-01T00:00:00Z"
  meters={[
    { id: "requests", label: "API requests", used: 71_840, limit: 100_000, unit: "requests", overage: "$0.40 per 1K" },
    { id: "seats", label: "Seats", used: 6, limit: 10, unit: "seats", paced: false },
  ]}
  status="ready" // "loading" | "error"
  onRetry={refetch}
  onUpgrade={() => router.push("/billing/upgrade")}
  onManage={() => router.push("/billing")}
/>`}
      previewScaleClassName="w-[440px] scale-[0.92]"
    >
      <PlanUsageCard
        now={PLAN_USAGE_SAMPLE.now}
        onUpgrade={() => {}}
        onManage={() => {}}
        onRetry={() => {}}
      />
    </SimpleComponentDemoPage>
  );
}
