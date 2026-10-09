"use client";

import { useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage, ShellSwitch } from "@/components/bjork-ui/component-demo-shell";
import { ScatterBrush, createScatterCloud, type Brush } from "@/components/bjork-ui/charts/scatter-brush";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { DemoColumn } from "../_demo/controls";

const item = getGalleryItem("scatter-brush");
const POINTS = createScatterCloud(23);
const X_DOMAIN: [number, number] = [0, 10];
const Y_DOMAIN: [number, number] = [0, 100];
const PREVIEW_BRUSH: Brush = { x0: 5.3, x1: 8.2, y0: 56, y1: 92 };
const fmtX = (v: number) => `${v.toFixed(1)}m`;
const fmtY = (v: number) => `${Math.round(v)}`;

export default function Page() {
  const isPreview = usePreviewMode();
  const [trend, setTrend] = useState(true);

  const reset = () => setTrend(true);

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Fifteen hundred points on one canvas. Drag out a region to select it: the selection takes the accent, everything else falls back, and the marginal histograms and the readout follow live. The trend line is a least-squares fit over whatever is selected, so brushing one cluster shows its own slope and r² rather than the overall one. Drag the brush to move it or its edges to resize it, click empty space to clear, and drive it all from the keyboard."
      dependencies={["framer-motion"]}
      usageCode={`import { ScatterBrush } from "@/components/bjork-ui/charts/scatter-brush";

<ScatterBrush
  points={sessions.map((s) => ({ x: s.minutes, y: s.score, label: s.id }))}
  xLabel="Session length"
  yLabel="Engagement"
  trend
  onBrushChange={(brush, selected) => console.log(selected.length)}
/>`}
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[700px] scale-[1.1]"
      optionsDefaultOpen={false}
      onReset={reset}
      controls={<ShellSwitch label="Trend line" checked={trend} onCheckedChange={setTrend} />}
    >
      {isPreview ? (
        <div className="w-[660px]">
          <ScatterBrush points={POINTS} xDomain={X_DOMAIN} yDomain={Y_DOMAIN} defaultBrush={PREVIEW_BRUSH} trend xLabel="Session length" yLabel="Engagement" formatX={fmtX} formatY={fmtY} height={440} ariaLabel="Sessions" />
        </div>
      ) : (
        <DemoColumn width={720}>
          <ScatterBrush points={POINTS} xDomain={X_DOMAIN} yDomain={Y_DOMAIN} trend={trend} xLabel="Session length" yLabel="Engagement" formatX={fmtX} formatY={fmtY} height={460} ariaLabel="Sessions" />
        </DemoColumn>
      )}
    </SimpleComponentDemoPage>
  );
}
