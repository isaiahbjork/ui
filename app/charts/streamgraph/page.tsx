"use client";

import { useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { Streamgraph, createGenreSeries, type StreamOffset } from "@/components/bjork-ui/charts/streamgraph";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { ControlRow, DemoColumn, OptionGroup } from "../_demo/controls";

const item = getGalleryItem("streamgraph");
const MONTHS = 24;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const X = Array.from({ length: MONTHS }, (_, j) => `${MONTH_NAMES[j % 12]} ${j < 12 ? "24" : "25"}`);
const SERIES = createGenreSeries(9, MONTHS);
const hours = (v: number) => `${Math.round(v)}k h`;

export default function Page() {
  const isPreview = usePreviewMode();
  const [offset, setOffset] = useState<StreamOffset>("wiggle");

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Layers flowing around a centre line, ordered inside out so the big steady layers sit in the middle and the seasonal ones ride the edges. Each layer keeps one colour from the legend to the tooltip, and past six the smallest fold into a grey Other. Switch between stream, stacked and 100% and every edge glides to its new place. The crosshair reads every layer at once; Enter or a click pins one in focus and greys the rest."
      dependencies={["framer-motion"]}
      usageCode={`import { Streamgraph } from "@/components/bjork-ui/charts/streamgraph";

<Streamgraph
  x={["Jan", "Feb", "Mar"]}
  series={[
    { id: "jazz", label: "Jazz", values: [120, 140, 132] },
    { id: "folk", label: "Folk", values: [60, 72, 90] },
  ]}
  offset="wiggle"
/>`}
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[780px] scale-[1.08]"
    >
      {isPreview ? (
        <div className="w-[740px]">
          <Streamgraph series={SERIES} x={X} index={4} formatValue={hours} height={380} ariaLabel="Listening hours by genre" />
        </div>
      ) : (
        <DemoColumn width={860}>
          <Streamgraph series={SERIES} x={X} offset={offset} formatValue={hours} height={380} ariaLabel="Listening hours by genre" />
          <ControlRow>
            <OptionGroup
              label="Layout"
              value={offset}
              onChange={setOffset}
              options={[
                { label: "Stream", value: "wiggle" },
                { label: "Stacked", value: "zero" },
                { label: "100%", value: "expand" },
              ]}
            />
          </ControlRow>
        </DemoColumn>
      )}
    </SimpleComponentDemoPage>
  );
}
