"use client";

import { useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { StateTimeline, createIncidentLanes, type TimelineState } from "@/components/bjork-ui/charts/state-timeline";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { ControlRow, DemoColumn, OptionGroup } from "../_demo/controls";

const item = getGalleryItem("state-timeline");
const HOUR = 3600000;
const END = Date.UTC(2025, 9, 8, 12);
const DOMAIN: [number, number] = [END - 7 * 24 * HOUR, END];
const STATES: TimelineState[] = [
  { id: "ok", label: "Operational", tone: "ok" },
  { id: "degraded", label: "Degraded", tone: "warn" },
  { id: "down", label: "Outage", tone: "down" },
  { id: "maintenance", label: "Maintenance", tone: "accent" },
];
const LANES = createIncidentLanes(8, ["Edge", "Gateway", "Auth", "Search", "Billing", "Postgres"], DOMAIN);
const PREVIEW_VIEW: [number, number] = [END - 3 * 24 * HOUR, END];
// The preview poses the first incident inside the preview window.
const PREVIEW_FOCUS = (() => {
  for (let lane = 0; lane < LANES.length; lane++) {
    const segment = LANES[lane].segments.findIndex((sg) => sg.state !== "ok" && sg.start > PREVIEW_VIEW[0] + 12 * HOUR);
    if (segment >= 0) return { lane, segment };
  }
  return null;
})();

export default function Page() {
  const isPreview = usePreviewMode();
  const [range, setRange] = useState<number>(7);
  const view: [number, number] = [END - range * 24 * HOUR, END];

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Lanes of states over time with an overview brush underneath. Healthy time stays quiet so incidents stand out. Drag the brush or its grips, pinch or ctrl-scroll to zoom, and step through segments with the arrow keys. The gutter keeps each lane's uptime for the window you are looking at."
      dependencies={["framer-motion"]}
      usageCode={`import { StateTimeline } from "@/components/bjork-ui/charts/state-timeline";

<StateTimeline
  domain={[weekAgo, now]}
  states={[
    { id: "ok", label: "Operational", tone: "ok" },
    { id: "degraded", label: "Degraded", tone: "warn" },
    { id: "down", label: "Outage", tone: "down" },
  ]}
  lanes={[{ id: "api", label: "API", segments: [{ start, end, state: "down", note: "5xx above 20%" }] }]}
  now={now}
/>`}
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[800px] scale-[1.06]"
    >
      {isPreview ? (
        <div className="w-[760px]">
          <StateTimeline lanes={LANES} states={STATES} domain={DOMAIN} view={PREVIEW_VIEW} now={END} focus={PREVIEW_FOCUS} laneHeight={26} ariaLabel="Service health" />
        </div>
      ) : (
        <DemoColumn width={860}>
          <StateTimeline lanes={LANES} states={STATES} domain={DOMAIN} view={view} now={END} ariaLabel="Service health" />
          <ControlRow>
            <OptionGroup
              label="Range"
              value={range}
              onChange={setRange}
              options={[
                { label: "24h", value: 1 },
                { label: "3d", value: 3 },
                { label: "7d", value: 7 },
              ]}
            />
          </ControlRow>
        </DemoColumn>
      )}
    </SimpleComponentDemoPage>
  );
}
