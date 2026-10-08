"use client";

import { useRef, useState } from "react";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { BjorkButton, BjorkButtonGroup } from "@/components/bjork-ui/primitives";
import { ChromaticText, type ChromaticTextHandle } from "@/components/bjork-ui/text/chromatic-text";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("chromatic-text");

const intensities = [
  { label: "subtle", value: 0.5 },
  { label: "normal", value: 1 },
  { label: "loud", value: 1.7 },
] as const;
const decays = [
  { label: "snappy", value: 0.35 },
  { label: "linger", value: 0.7 },
  { label: "smear", value: 1.6 },
] as const;

export default function ChromaticTextDemo() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const tone = previewTheme === "light" || previewTheme === "dark" ? previewTheme : undefined;
  const textRef = useRef<ChromaticTextHandle>(null);

  const [intensity, setIntensity] = useState<number>(1);
  const [decay, setDecay] = useState<number>(0.7);
  const [grain, setGrain] = useState(false);

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Type that stays perfectly crisp and single-coloured until it moves. Pointer velocity is written into a decaying flow field and the text is sampled along it with a spectral spread, so fast strokes split into colour and settle back to one ink. A soft lens follows the cursor."
      usageCode={`import { useRef } from "react";
import { ChromaticText, type ChromaticTextHandle } from "@/components/bjork-ui/text/chromatic-text";

const ref = useRef<ChromaticTextHandle>(null);

<ChromaticText
  ref={ref}
  text="Chromatic"
  intensity={1}   // 0 to 2
  radius={90}     // CSS px, pointer + lens radius
  decay={0.7}     // seconds to settle
  grain={0.4}     // 0 off, scanlines + grain while moving
  tone="dark"
/>

ref.current?.pulse(); // one-shot sweep`}
      previewScaleClassName="w-[360px]"
      previewCaptureScaleClassName="w-[860px] scale-[1]"
    >
      <div className="flex w-[min(860px,calc(100vw-72px))] flex-col items-center gap-6">
        {!isPreview ? (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <BjorkButton size="sm" variant="secondary" onClick={() => textRef.current?.pulse()}>
              Pulse
            </BjorkButton>
            <BjorkButtonGroup aria-label="Intensity">
              {intensities.map((v) => (
                <BjorkButton
                  key={v.label}
                  size="sm"
                  variant={intensity === v.value ? "secondary" : "ghost"}
                  aria-pressed={intensity === v.value}
                  onClick={() => setIntensity(v.value)}
                >
                  {v.label}
                </BjorkButton>
              ))}
            </BjorkButtonGroup>
            <BjorkButtonGroup aria-label="Decay">
              {decays.map((v) => (
                <BjorkButton
                  key={v.label}
                  size="sm"
                  variant={decay === v.value ? "secondary" : "ghost"}
                  aria-pressed={decay === v.value}
                  onClick={() => setDecay(v.value)}
                >
                  {v.label}
                </BjorkButton>
              ))}
            </BjorkButtonGroup>
            <BjorkButton
              size="sm"
              variant={grain ? "secondary" : "ghost"}
              aria-pressed={grain}
              onClick={() => setGrain((g) => !g)}
            >
              Grain
            </BjorkButton>
          </div>
        ) : null}
        <ChromaticText
          ref={textRef}
          text="Chromatic"
          intensity={intensity}
          decay={decay}
          grain={grain ? 0.5 : 0}
          tone={tone}
          frozen={isPreview}
          pulseOnMount={!isPreview}
        />
      </div>
    </SimpleComponentDemoPage>
  );
}
