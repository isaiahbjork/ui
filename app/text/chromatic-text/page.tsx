"use client";

import { useRef, useState } from "react";
import { SimpleComponentDemoPage, ShellActions, ShellSegmented, ShellSwitch } from "@/components/bjork-ui/component-demo-shell";
import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { BjorkButton } from "@/components/bjork-ui/primitives";
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

  const reset = () => {
    setIntensity(1);
    setDecay(0.7);
    setGrain(false);
  };

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
      optionsDefaultOpen={false}
      onReset={reset}
      controls={
        <>
          <ShellActions>
            <BjorkButton size="sm" variant="secondary" onClick={() => textRef.current?.pulse()}>
              Pulse
            </BjorkButton>
          </ShellActions>
          <ShellSegmented
            label="Amount"
            value={intensity}
            options={intensities.map((v) => ({ value: v.value, label: v.label }))}
            onChange={setIntensity}
          />
          <ShellSegmented
            label="Decay"
            value={decay}
            options={decays.map((v) => ({ value: v.value, label: v.label }))}
            onChange={setDecay}
          />
          <ShellSwitch label="Grain" checked={grain} onCheckedChange={setGrain} />
        </>
      }
    >
      <div className="flex w-[min(860px,calc(100vw-72px))] flex-col items-center gap-6">
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
