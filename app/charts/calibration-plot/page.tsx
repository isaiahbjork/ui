"use client";

import { useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage, ShellSegmented } from "@/components/bjork-ui/component-demo-shell";
import { CalibrationPlot, createForecasts } from "@/components/bjork-ui/charts/calibration-plot";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { DemoColumn } from "../_demo/controls";

const item = getGalleryItem("calibration-plot");
const RAW = createForecasts(41, 3000, false);
const FIXED = createForecasts(41, 3000, true);

export default function Page() {
  const isPreview = usePreviewMode();
  const [which, setWhich] = useState<"raw" | "fixed">("raw");
  const [bins, setBins] = useState(10);
  function reset() {
    setWhich("raw");
    setBins(10);
  }


  return (
    <SimpleComponentDemoPage
      item={item}
      description="A reliability diagram for probability forecasts. Each bin plots how often things happened against how likely they were called, with a Wilson interval, a count strip underneath and Brier and ECE above. Points rise off the diagonal, so the distance from perfect is the first thing you see. Brackets change the bin count."
      dependencies={["framer-motion"]}
      usageCode={`import { CalibrationPlot } from "@/components/bjork-ui/charts/calibration-plot";

<CalibrationPlot forecasts={predictions.map((x) => ({ p: x.probability, outcome: x.won ? 1 : 0 }))} bins={10} />`}
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[560px] scale-[0.98]"
      onReset={reset}
      optionsDefaultOpen={false}
      controls={
        <>
          <ShellSegmented
            label="Model"
            value={which}
            onChange={setWhich}
            options={[
              { label: "Overconfident", value: "raw" },
              { label: "Recalibrated", value: "fixed" },
            ]}
          />
          <ShellSegmented
            label="Bins"
            value={bins}
            onChange={setBins}
            options={[
              { label: "5", value: 5 },
              { label: "10", value: 10 },
              { label: "15", value: 15 },
            ]}
          />
        </>
      }
    >
      {isPreview ? (
        <div className="w-[540px]">
          <CalibrationPlot forecasts={RAW} activeBin={8} height={470} ariaLabel="Forecast calibration" />
        </div>
      ) : (
        <DemoColumn width={600}>
          <CalibrationPlot forecasts={which === "raw" ? RAW : FIXED} bins={bins} onBinsChange={setBins} ariaLabel="Forecast calibration" />
        </DemoColumn>
      )}
    </SimpleComponentDemoPage>
  );
}
