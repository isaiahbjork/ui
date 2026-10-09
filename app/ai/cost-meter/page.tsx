"use client";

import { useState } from "react";
import { CostMeter, SAMPLE_USAGE, type CostPeriod } from "@/components/bjork-ui/ai/cost-meter";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("cost-meter");

function Demo() {
  const isPreview = usePreviewMode();
  const [period, setPeriod] = useState<CostPeriod>("30d");
  const [extra, setExtra] = useState(0);
  const usage = SAMPLE_USAGE.periods[period];

  if (isPreview) {
    // Posed frame: 30 days at 72% of the budget, crosshair on Oct 4.
    const p = SAMPLE_USAGE.periods["30d"];
    return (
      <div className="w-[min(520px,calc(100vw-56px))]">
        <CostMeter
          spend={p.spend}
          budget={p.budget}
          breakdown={p.breakdown}
          history={SAMPLE_USAGE.history}
          defaultPeriod="30d"
          defaultActivePoint={9}
        />
      </div>
    );
  }

  return (
    <div className="flex w-[min(520px,calc(100vw-56px))] flex-col items-stretch gap-6">
      <CostMeter
        spend={usage.spend + extra}
        budget={usage.budget}
        breakdown={usage.breakdown}
        history={SAMPLE_USAGE.history}
        period={period}
        onPeriodChange={(p) => {
          setPeriod(p);
          setExtra(0);
        }}
      />
      <div className="flex flex-wrap items-center justify-center gap-2">
        <BjorkButton variant="secondary" size="sm" onClick={() => setExtra((x) => x + usage.budget * 0.09)}>
          Run a long job
        </BjorkButton>
        <BjorkButton variant="ghost" size="sm" onClick={() => setExtra(0)}>
          Reset
        </BjorkButton>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <SimpleComponentDemoPage
      item={item}
      description="Spend against a budget: a figure that springs to new totals, a budget bar that turns amber at 80% and red past 100%, a per-model breakdown with cache savings, and a 14-day sparkline you can scrub with the arrow keys."
      dependencies={["framer-motion", "clsx", "tailwind-merge"]}
      usageCode={`import { CostMeter, SAMPLE_USAGE } from "@/components/bjork-ui/ai/cost-meter";

export function Usage() {
  const month = SAMPLE_USAGE.periods["30d"];
  return (
    <CostMeter
      spend={month.spend}
      budget={month.budget}
      breakdown={month.breakdown}
      history={SAMPLE_USAGE.history}
      defaultPeriod="30d"
    />
  );
}`}
      previewScaleClassName="w-[360px]"
      previewCaptureScaleClassName="w-[520px] scale-[0.95]"
    >
      <Demo />
    </SimpleComponentDemoPage>
  );
}
