"use client";

import { useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { ViolinPlot, createRegionGroups, type ViolinMode } from "@/components/bjork-ui/charts/violin-plot";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { ControlRow, DemoColumn, OptionGroup } from "../_demo/controls";

const item = getGalleryItem("violin-plot");
const GROUPS = createRegionGroups(21);
const DOMAIN: [number, number] = [0, 600];

export default function Page() {
  const isPreview = usePreviewMode();
  const [mode, setMode] = useState<ViolinMode>("violin");

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Groups drawn as violins, boxes or raw strips, and the shapes morph between the three views rather than swapping. Hover reads every quartile and where the value under the pointer ranks inside that group. Enter or a click holds a group in the accent."
      dependencies={["framer-motion"]}
      usageCode={`import { ViolinPlot } from "@/components/bjork-ui/charts/violin-plot";

<ViolinPlot
  groups={[
    { id: "us", label: "US East", values: usLatencies },
    { id: "eu", label: "EU West", values: euLatencies },
  ]}
  mode="violin"
  unit="ms"
/>`}
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[760px] scale-[1.1]"
    >
      {isPreview ? (
        <div className="w-[720px]">
          <ViolinPlot groups={GROUPS} yDomain={DOMAIN} highlightId="ap" unit="ms" height={380} ariaLabel="Response time by region" />
        </div>
      ) : (
        <DemoColumn width={800}>
          <ViolinPlot groups={GROUPS} yDomain={DOMAIN} mode={mode} onModeChange={setMode} unit="ms" height={360} ariaLabel="Response time by region" />
          <ControlRow>
            <OptionGroup
              label="View"
              value={mode}
              onChange={setMode}
              options={[
                { label: "Violin", value: "violin" },
                { label: "Box", value: "box" },
                { label: "Strip", value: "strip" },
              ]}
            />
          </ControlRow>
        </DemoColumn>
      )}
    </SimpleComponentDemoPage>
  );
}
