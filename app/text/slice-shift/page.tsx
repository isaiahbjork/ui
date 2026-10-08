"use client";

import { useState } from "react";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { BjorkButton, BjorkButtonGroup } from "@/components/bjork-ui/primitives";
import { SliceShift, type SliceShiftTrigger } from "@/components/bjork-ui/text/slice-shift";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("slice-shift");

const modes = ["hover", "scroll", "loop", "words"] as const;
const sliceCounts = [5, 7, 11] as const;
const WORDS = ["Shear", "Shift", "Register", "Slice"];

export default function SliceShiftDemo() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const tone = previewTheme === "light" || previewTheme === "dark" ? previewTheme : undefined;
  const [mode, setMode] = useState<(typeof modes)[number]>("hover");
  const [slices, setSlices] = useState<(typeof sliceCounts)[number]>(7);

  const words = mode === "words";
  const trigger: SliceShiftTrigger = words ? "loop" : mode;

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A headline cut into horizontal strips. Pointer or scroll velocity shears the strips sideways in alternating directions, a thin accent hairline shows at each cut, and springs pull everything back into registration. Pass words to get a venetian-blind swap between them."
      usageCode={`import { SliceShift } from "@/components/bjork-ui/text/slice-shift";

// Shear on pointer velocity
<SliceShift text="Registration" trigger="hover" slices={7} maxOffset={0.22} stagger={0.032} />

// Venetian-blind word swap
<SliceShift words={["Shear", "Shift", "Register"]} interval={2600} duration={720} />`}
      previewScaleClassName="w-[900px] scale-[0.8]"
    >
      <div className="flex w-[860px] max-w-full min-w-0 flex-col items-center gap-8">
        {!isPreview ? (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <BjorkButtonGroup aria-label="Trigger">
              {modes.map((value) => (
                <BjorkButton
                  key={value}
                  size="sm"
                  variant={mode === value ? "secondary" : "ghost"}
                  aria-pressed={mode === value}
                  onClick={() => setMode(value)}
                >
                  {value}
                </BjorkButton>
              ))}
            </BjorkButtonGroup>
            <BjorkButtonGroup aria-label="Slices">
              {sliceCounts.map((value) => (
                <BjorkButton
                  key={value}
                  size="sm"
                  variant={slices === value ? "secondary" : "ghost"}
                  aria-pressed={slices === value}
                  onClick={() => setSlices(value)}
                >
                  {value} slices
                </BjorkButton>
              ))}
            </BjorkButtonGroup>
          </div>
        ) : null}
        <div className="w-full min-w-0 px-2">
          <SliceShift
            key={`${mode}-${slices}`}
            text="Registration"
            words={words ? WORDS : undefined}
            trigger={trigger}
            slices={isPreview ? 6 : slices}
            tone={tone}
            fontSize={isPreview ? 168 : 136}
            freezeAt={isPreview ? 0.42 : undefined}
          />
        </div>
        {!isPreview ? (
          <p className="text-center text-[12px] text-current opacity-50">
            {mode === "hover"
              ? "Sweep the pointer across the word."
              : mode === "scroll"
                ? "Scroll the page."
                : mode === "loop"
                  ? "Pulses every 2.6s."
                  : "Cycles every 2.6s."}
          </p>
        ) : null}
      </div>
    </SimpleComponentDemoPage>
  );
}
