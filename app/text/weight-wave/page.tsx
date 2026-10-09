"use client";

import { useState } from "react";
import { SimpleComponentDemoPage, ShellSegmented, ShellSwitch } from "@/components/bjork-ui/component-demo-shell";
import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { WeightWave } from "@/components/bjork-ui/text/weight-wave";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("weight-wave");

const radii = [
  { label: "tight", value: 0.6 },
  { label: "medium", value: 0.95 },
  { label: "wide", value: 1.6 },
] as const;

export default function WeightWaveDemo() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const tone = previewTheme === "light" || previewTheme === "dark" ? previewTheme : undefined;

  const [radius, setRadius] = useState<number>(0.95);
  const [idle, setIdle] = useState(true);
  const [slant, setSlant] = useState(false);

  const reset = () => {
    setRadius(0.95);
    setIdle(true);
    setSlant(false);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A line of Geist whose weight axis swells under the cursor with a gaussian falloff. When the pointer is away, a crest of weight travels the line on its own. Each glyph runs on its own spring, written straight to the style in one animation frame loop."
      usageCode={`import { WeightWave } from "@/components/bjork-ui/text/weight-wave";

<WeightWave
  text="Feel the weight"
  minWeight={140}
  maxWeight={900}
  radius={0.95}        // gaussian sigma, in em
  idle                 // travelling crest while the pointer is away
  waveDuration={3.2}
  slant={0}            // faux slant in degrees
  fontSize={132}       // upper bound; fits the container
/>`}
      previewScaleClassName="w-[344px]"
      previewCaptureScaleClassName="w-[860px] scale-[0.98]"
      optionsDefaultOpen={false}
      onReset={reset}
      controls={
        <>
          <ShellSegmented
            label="Falloff"
            value={radius}
            options={radii.map((r) => ({ value: r.value, label: r.label }))}
            onChange={setRadius}
          />
          <ShellSwitch label="Idle wave" checked={idle} onCheckedChange={setIdle} />
          <ShellSwitch label="Slant" checked={slant} onCheckedChange={setSlant} />
        </>
      }
    >
      <div className="flex w-[min(880px,calc(100vw-72px))] max-w-full flex-col items-center gap-8">
        <WeightWave
          tone={tone}
          radius={radius}
          idle={idle}
          slant={slant ? 9 : 0}
          frozenPhase={isPreview ? 0.46 : undefined}
        />
      </div>
    </SimpleComponentDemoPage>
  );
}
