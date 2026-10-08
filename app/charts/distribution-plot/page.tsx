"use client";

import { useMemo, useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { DistributionPlot, createDistributionSample } from "@/components/bjork-ui/charts/distribution-plot";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { ControlRow, DemoColumn, OptionGroup, ToggleButton } from "../_demo/controls";

const item = getGalleryItem("distribution-plot");
const LATENCY = createDistributionSample(12, "latency");
const BIMODAL = createDistributionSample(19, "bimodal");

export default function Page() {
  const isPreview = usePreviewMode();
  const [kind, setKind] = useState<"latency" | "bimodal">("latency");
  const [bins, setBins] = useState<number | "auto">("auto");
  const [density, setDensity] = useState(true);
  const values = kind === "latency" ? LATENCY : BIMODAL;
  const domain = useMemo<[number, number]>(() => (kind === "latency" ? [0, 600] : [0, 700]), [kind]);

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A histogram with its density curve and percentile pins. Drag the threshold, or step it with the arrow keys, and the tail past it fills with the accent while the pill reads the exact share. Brackets change the bin count, and the bars morph between binnings instead of jumping."
      dependencies={["framer-motion"]}
      usageCode={`import { DistributionPlot } from "@/components/bjork-ui/charts/distribution-plot";

<DistributionPlot
  values={latencies}
  defaultThreshold={250}
  unit="ms"
  markers={["p50", "p95", "p99"]}
/>`}
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[780px] scale-[1.08]"
    >
      {isPreview ? (
        <div className="w-[740px]">
          <DistributionPlot values={LATENCY} domain={[0, 600]} defaultThreshold={340} unit="ms" height={360} ariaLabel="API latency" />
        </div>
      ) : (
        <DemoColumn width={820}>
          <DistributionPlot
            key={kind}
            values={values}
            domain={domain}
            bins={bins}
            onBinsChange={setBins}
            showDensity={density}
            defaultThreshold={kind === "latency" ? 340 : 320}
            unit="ms"
            height={340}
            ariaLabel={kind === "latency" ? "API latency" : "Checkout time"}
          />
          <ControlRow>
            <OptionGroup
              label="Dataset"
              value={kind}
              onChange={setKind}
              options={[
                { label: "Latency", value: "latency" },
                { label: "Bimodal", value: "bimodal" },
              ]}
            />
            <OptionGroup
              label="Bins"
              value={bins}
              onChange={setBins}
              options={[
                { label: "Auto", value: "auto" },
                { label: "16", value: 16 },
                { label: "40", value: 40 },
              ]}
            />
            <ToggleButton pressed={density} onClick={() => setDensity((v) => !v)}>
              Density
            </ToggleButton>
          </ControlRow>
        </DemoColumn>
      )}
    </SimpleComponentDemoPage>
  );
}
