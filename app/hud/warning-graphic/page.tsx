"use client";

import { useState } from "react";
import {
  ShellRange,
  ShellSwitch,
  SimpleComponentDemoPage,
} from "@/components/bjork-ui/component-demo-shell";
import { WarningGraphic } from "@/components/bjork-ui/hud/warning";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("warning-graphic");

export default function Page() {
  const [scale, setScale] = useState(480);
  const [speed, setSpeed] = useState(1.5);
  const [animate, setAnimate] = useState(true);

  function resetControls() {
    setScale(480);
    setSpeed(1.5);
    setAnimate(true);
  }

  const width = scale;
  const height = Math.round((scale * 57.531) / 176.958);

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A hazard mark drawn in ember and rust. Warm paper and rust in light mode, toned stripes on the dark surface. It replaces the old safety yellow and is the only warning colour in the library."
      dependencies={["framer-motion", "clsx"]}
      usageCode={`import { WarningGraphic } from "@/components/bjork-ui/hud/warning";

export function Demo() {
  return <WarningGraphic width={360} height={117} animationSpeed={1.5} />;
}`}
      previewScaleClassName="w-[600px] scale-[0.92]"
      onReset={resetControls}
      controls={
        <>
          <ShellRange
            label="Scale"
            value={scale}
            min={240}
            max={640}
            step={10}
            displayValue={`${scale}px`}
            onChange={setScale}
          />
          <ShellRange
            label="Speed"
            value={speed}
            min={0.5}
            max={3}
            step={0.1}
            displayValue={`${speed.toFixed(1)}x`}
            onChange={setSpeed}
          />
          <ShellSwitch label="Motion" checked={animate} onCheckedChange={setAnimate} />
        </>
      }
    >
      <div className="flex min-h-[280px] w-full items-center justify-center py-10">
        <WarningGraphic
          width={width}
          height={height}
          enableAnimations={animate}
          animationSpeed={speed}
        />
      </div>
    </SimpleComponentDemoPage>
  );
}
