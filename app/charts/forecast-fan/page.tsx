"use client";

import { useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage, ShellSwitch } from "@/components/bjork-ui/component-demo-shell";
import { ForecastFan, createForecastSeries } from "@/components/bjork-ui/charts/forecast-fan";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { DemoColumn } from "../_demo/controls";

const item = getGalleryItem("forecast-fan");
const SERIES = createForecastSeries(4, { weeks: 52, horizon: 26, base: 180 });
// Above the history, so the marker lands in open forecast space rather than on the now line.
const THRESHOLD = { value: 300, label: "$300K target" };
const formatK = (v: number) => `$${Math.round(v)}K`;

export default function Page() {
  const isPreview = usePreviewMode();
  const [show80, setShow80] = useState(true);
  const [show95, setShow95] = useState(true);
  const [target, setTarget] = useState(true);
  function reset() {
    setShow80(true);
    setShow95(true);
    setTarget(true);
  }


  return (
    <SimpleComponentDemoPage
      item={item}
      description="History meets forecast at a clear now line. The 50, 80 and 95% bands open out of the last real value, the median runs on as a dashed accent line, and the scrub reads every interval at once. Give it a threshold and it marks the first week the outer band reaches it."
      dependencies={["framer-motion"]}
      usageCode={`import { ForecastFan } from "@/components/bjork-ui/charts/forecast-fan";

<ForecastFan
  history={history}            // { t, v }[]
  forecast={forecast}          // { t, mid, bands: [[p25, p75], [p10, p90], [p025, p975]] }[]
  bandLabels={["50%", "80%", "95%"]}
  threshold={{ value: 300, label: "$300K target" }}
  formatValue={(v) => \`$\${Math.round(v)}K\`}
/>`}
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[800px] scale-[1.06]"
      onReset={reset}
      optionsDefaultOpen={false}
      controls={
        <>
          <ShellSwitch label="80% band" checked={show80} onCheckedChange={setShow80} />
          <ShellSwitch label="95% band" checked={show95} onCheckedChange={setShow95} />
          <ShellSwitch label="Target" checked={target} onCheckedChange={setTarget} />
        </>
      }
    >
      {isPreview ? (
        <div className="w-[760px]">
          <ForecastFan {...SERIES} threshold={THRESHOLD} formatValue={formatK} index={60} height={380} ariaLabel="Weekly revenue" />
        </div>
      ) : (
        <DemoColumn width={860}>
          <ForecastFan
            {...SERIES}
            visibleBands={[true, show80, show95]}
            threshold={target ? THRESHOLD : undefined}
            formatValue={formatK}
            height={360}
            ariaLabel="Weekly revenue"
          />
        </DemoColumn>
      )}
    </SimpleComponentDemoPage>
  );
}
