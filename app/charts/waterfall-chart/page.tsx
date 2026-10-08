"use client";

import { useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { WaterfallChart, type WaterfallStep } from "@/components/bjork-ui/charts/waterfall-chart";
import { formatCompact } from "@/components/bjork-ui/charts/_kit/scale";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { ControlRow, DemoColumn, OptionGroup, ToggleButton } from "../_demo/controls";

const item = getGalleryItem("waterfall-chart");
const money = (v: number) => `$${formatCompact(v, 1)}`;

const SCENARIOS: Record<"good" | "bad", { start: { label: string; value: number }; steps: WaterfallStep[]; ghost: { label: string; value: number } }> = {
  good: {
    start: { label: "Gross edge", value: 18400 },
    steps: [
      { id: "fees", label: "Fees", value: -3100 },
      { id: "slip", label: "Slippage", value: -2400 },
      { id: "impact", label: "Impact", value: -4600 },
      { id: "rebate", label: "Rebates", value: 1200 },
      { id: "fund", label: "Funding", value: -800 },
    ],
    ghost: { label: "Uncapped", value: 13900 },
  },
  bad: {
    start: { label: "Gross edge", value: 9200 },
    steps: [
      { id: "fees", label: "Fees", value: -3300 },
      { id: "slip", label: "Slippage", value: -3900 },
      { id: "impact", label: "Impact", value: -5200 },
      { id: "rebate", label: "Rebates", value: 900 },
      { id: "fund", label: "Funding", value: -1100 },
    ],
    ghost: { label: "Uncapped", value: -6800 },
  },
};

export default function Page() {
  const isPreview = usePreviewMode();
  const [scenario, setScenario] = useState<"good" | "bad">("good");
  const [showGhost, setShowGhost] = useState(true);
  const sc = SCENARIOS[scenario];

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A P&L bridge from gross to net. Each step grows out of the running total before it, dashed connectors carry the level across, and losses read as hatched outlines rather than a second colour. The net bar takes the accent, or the error tone when it lands below zero. An optional dashed ghost shows what the total would have been."
      dependencies={["framer-motion"]}
      usageCode={`import { WaterfallChart } from "@/components/bjork-ui/charts/waterfall-chart";

<WaterfallChart
  start={{ label: "Gross edge", value: 18400 }}
  steps={[
    { id: "fees", label: "Fees", value: -3100 },
    { id: "rebate", label: "Rebates", value: 1200 },
  ]}
  ghost={{ label: "Uncapped", value: 13900 }}
  formatValue={(v) => \`$\${(v / 1000).toFixed(1)}K\`}
/>`}
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[720px] scale-[1.12]"
    >
      {isPreview ? (
        <div className="w-[680px]">
          <WaterfallChart start={SCENARIOS.good.start} steps={SCENARIOS.good.steps} ghost={SCENARIOS.good.ghost} formatValue={money} activeId="impact" height={380} ariaLabel="Weekly trading P&L" />
        </div>
      ) : (
        <DemoColumn width={760}>
          <WaterfallChart start={sc.start} steps={sc.steps} ghost={showGhost ? sc.ghost : null} formatValue={money} height={360} ariaLabel="Weekly trading P&L" />
          <ControlRow>
            <OptionGroup
              label="Scenario"
              value={scenario}
              onChange={setScenario}
              options={[
                { label: "Good week", value: "good" },
                { label: "Bad week", value: "bad" },
              ]}
            />
            <ToggleButton pressed={showGhost} onClick={() => setShowGhost((v) => !v)}>
              Ghost
            </ToggleButton>
          </ControlRow>
        </DemoColumn>
      )}
    </SimpleComponentDemoPage>
  );
}
