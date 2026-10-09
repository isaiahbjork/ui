"use client";

import { useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { CorrelationMatrix, createCorrelationDemo } from "@/components/bjork-ui/charts/correlation-matrix";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { ControlRow, DemoColumn, OptionGroup } from "../_demo/controls";

const item = getGalleryItem("correlation-matrix");
// Illustrative factor-model correlations. Not market data.
const DEMO = createCorrelationDemo(5);

export default function Page() {
  const isPreview = usePreviewMode();
  const [order, setOrder] = useState<"input" | "cluster">("input");
  const [triangle, setTriangle] = useState<"lower" | "full">("lower");

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A correlation heatmap on a diverging scale: positive in the accent, negative in blue, fading to the background at zero, with intensity on a power curve. Where cells get too small for numbers, negative ones keep a minus bar so sign never rests on colour alone. Hover lights the row and column and dims the rest. Switch to cluster order and every row and column slides into place, so the blocks of things that move together appear."
      dependencies={["framer-motion"]}
      usageCode={`import { CorrelationMatrix } from "@/components/bjork-ui/charts/correlation-matrix";

<CorrelationMatrix
  labels={["Stocks", "Bonds", "Gold"]}
  matrix={[
    [1, -0.3, 0.1],
    [-0.3, 1, 0.35],
    [0.1, 0.35, 1],
  ]}
  defaultOrder="cluster"
/>`}
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[560px] scale-[0.92]"
    >
      {isPreview ? (
        <div className="w-[540px]">
          <CorrelationMatrix {...DEMO} defaultOrder="cluster" activeCell={[2, 0]} ariaLabel="Asset correlations" />
        </div>
      ) : (
        <DemoColumn width={600}>
          <CorrelationMatrix {...DEMO} order={order} onOrderChange={setOrder} triangle={triangle} ariaLabel="Asset correlations" />
          <ControlRow>
            <OptionGroup
              label="Order"
              value={order}
              onChange={setOrder}
              options={[
                { label: "Original", value: "input" },
                { label: "Clustered", value: "cluster" },
              ]}
            />
            <OptionGroup
              label="Shape"
              value={triangle}
              onChange={setTriangle}
              options={[
                { label: "Lower", value: "lower" },
                { label: "Full", value: "full" },
              ]}
            />
          </ControlRow>
        </DemoColumn>
      )}
    </SimpleComponentDemoPage>
  );
}
