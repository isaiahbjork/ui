"use client";

import { useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { DrawdownChart, createEquityCurve } from "@/components/bjork-ui/charts/drawdown-chart";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { ControlRow, DemoColumn, ToggleButton } from "../_demo/controls";

const item = getGalleryItem("drawdown-chart");
const CURVE = createEquityCurve(17);

export default function Page() {
  const isPreview = usePreviewMode();
  const [showBench, setShowBench] = useState(false);

  return (
    <SimpleComponentDemoPage
      item={item}
      description="An equity curve linked to its underwater pane. The dashed line is the running peak, the red pane is how far below it you are, and the worst drawdowns are a keypress away: each one gets a bracket from peak to trough and a note with how long it took to recover. One crosshair reads both panes."
      dependencies={["framer-motion"]}
      usageCode={`import { DrawdownChart } from "@/components/bjork-ui/charts/drawdown-chart";

<DrawdownChart data={equity} topN={3} formatValue={(v) => \`$\${Math.round(v / 1000)}K\`} />`}
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[780px] scale-[1.08]"
    >
      {isPreview ? (
        <div className="w-[740px]">
          <DrawdownChart data={CURVE.equity} height={420} ariaLabel="Strategy equity" />
        </div>
      ) : (
        <DemoColumn width={860}>
          <DrawdownChart data={CURVE.equity} benchmark={showBench ? CURVE.benchmark : undefined} height={420} ariaLabel="Strategy equity" />
          <ControlRow>
            <ToggleButton pressed={showBench} onClick={() => setShowBench((v) => !v)}>
              Benchmark
            </ToggleButton>
          </ControlRow>
        </DemoColumn>
      )}
    </SimpleComponentDemoPage>
  );
}
