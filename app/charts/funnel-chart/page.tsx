"use client";

import { useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage, ShellSegmented, ShellSwitch } from "@/components/bjork-ui/component-demo-shell";
import { FunnelChart, type FunnelStep } from "@/components/bjork-ui/charts/funnel-chart";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { DemoColumn } from "../_demo/controls";

const item = getGalleryItem("funnel-chart");

type Platform = "web" | "mobile";

// September signups through to first payment, with August as the comparison period.
const FUNNELS: Record<Platform, { steps: FunnelStep[]; previous: Record<string, number> }> = {
  web: {
    steps: [
      { id: "signup", label: "Signed up", value: 12480 },
      { id: "workspace", label: "Created workspace", value: 10610 },
      { id: "connect", label: "Connected data", value: 4920 },
      { id: "invite", label: "Invited teammate", value: 3610 },
      { id: "trial", label: "Started trial", value: 2740 },
      { id: "paid", label: "Paid", value: 1480 },
    ],
    previous: { signup: 12020, workspace: 10100, connect: 4410, invite: 3190, trial: 2350, paid: 1190 },
  },
  mobile: {
    steps: [
      { id: "signup", label: "Signed up", value: 8940 },
      { id: "workspace", label: "Created workspace", value: 7010 },
      { id: "connect", label: "Connected data", value: 3860 },
      { id: "invite", label: "Invited teammate", value: 1620 },
      { id: "trial", label: "Started trial", value: 1290 },
      { id: "paid", label: "Paid", value: 590 },
    ],
    previous: { signup: 8100, workspace: 6480, connect: 3350, invite: 1580, trial: 1210, paid: 560 },
  },
};

export default function Page() {
  const isPreview = usePreviewMode();
  const [platform, setPlatform] = useState<Platform>("web");
  const [compare, setCompare] = useState(true);
  function reset() {
    setPlatform("web");
    setCompare(true);
  }

  const f = FUNNELS[platform];

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Conversion through ordered steps, drawn as plain bars from one shared baseline so length is the count. The people lost at each step sit as a hatched run beyond the bar, out to where the step before ended. Step conversion reads in the gutter between bars, overall conversion in the right column, and the step with the steepest drop takes the accent. Pass a comparison period to get a marker at last period's count and the change in points."
      dependencies={["framer-motion"]}
      usageCode={`import { FunnelChart } from "@/components/bjork-ui/charts/funnel-chart";

<FunnelChart
  steps={[
    { id: "signup", label: "Signed up", value: 12480 },
    { id: "connect", label: "Connected data", value: 4920 },
    { id: "trial", label: "Started trial", value: 2740 },
    { id: "paid", label: "Paid", value: 1480 },
  ]}
  previous={{ signup: 12020, connect: 4410, trial: 2350, paid: 1190 }}
  previousLabel="August"
  valueLabel="Accounts"
/>`}
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[720px] scale-[1.12]"
      onReset={reset}
      optionsDefaultOpen={false}
      controls={
        <>
          <ShellSegmented
            label="Platform"
            value={platform}
            onChange={setPlatform}
            options={[
              { label: "Web", value: "web" },
              { label: "Mobile", value: "mobile" },
            ]}
          />
          <ShellSwitch label="Compare to August" checked={compare} onCheckedChange={setCompare} />
        </>
      }
    >
      {isPreview ? (
        <div className="w-[680px]">
          <FunnelChart
            steps={FUNNELS.web.steps}
            previous={FUNNELS.web.previous}
            previousLabel="August"
            valueLabel="Accounts"
            activeId="connect"
            height={360}
            ariaLabel="September signup funnel, web"
          />
        </div>
      ) : (
        <DemoColumn width={760}>
          <FunnelChart
            steps={f.steps}
            previous={compare ? f.previous : null}
            previousLabel="August"
            valueLabel="Accounts"
            ariaLabel={`September signup funnel, ${platform}`}
          />
        </DemoColumn>
      )}
    </SimpleComponentDemoPage>
  );
}
