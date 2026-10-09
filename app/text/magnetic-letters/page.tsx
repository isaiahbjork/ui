"use client";

import { useState } from "react";
import { SimpleComponentDemoPage, ShellSegmented } from "@/components/bjork-ui/component-demo-shell";
import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { MagneticLetters, type MagneticMode } from "@/components/bjork-ui/text/magnetic-letters";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("magnetic-letters");

const PREVIEW_POINTER = { x: 0.6, y: -0.15 };
const modes: MagneticMode[] = ["attract", "repel"];
const strengths = [
  { label: "soft", value: 0.6 },
  { label: "firm", value: 1 },
  { label: "strong", value: 1.5 },
] as const;

export default function MagneticLettersDemo() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const tone = previewTheme === "light" || previewTheme === "dark" ? previewTheme : undefined;

  const [mode, setMode] = useState<MagneticMode>("attract");
  const [strength, setStrength] = useState<number>(1);

  const reset = () => {
    setMode("attract");
    setStrength(1);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Letters on damped springs that lean toward the cursor or shy away from it, tilting and scaling as they go. Click to send a shockwave through the line and watch it reassemble with a little overshoot. Focus it from the keyboard for a gentle ripple, or press Enter to scatter."
      usageCode={`import { MagneticLetters } from "@/components/bjork-ui/text/magnetic-letters";

<MagneticLetters
  text="Pull me closer"
  mode="attract"       // or "repel"
  strength={1}
  radius={1.35}        // field reach, in em
  stiffness={210}
  damping={15}         // lower overshoots more
  shockwave            // click, Enter or Space scatters
/>`}
      previewScaleClassName="w-[344px]"
      previewCaptureScaleClassName="w-[860px] scale-[0.98]"
      optionsDefaultOpen={false}
      onReset={reset}
      controls={
        <>
          <ShellSegmented
            label="Field"
            value={mode}
            options={modes.map((m) => ({ value: m, label: m }))}
            onChange={setMode}
          />
          <ShellSegmented
            label="Strength"
            value={strength}
            options={strengths.map((s) => ({ value: s.value, label: s.label }))}
            onChange={setStrength}
          />
        </>
      }
    >
      <div className="flex w-[min(880px,calc(100vw-72px))] max-w-full flex-col items-center gap-8">
        <MagneticLetters
          tone={tone}
          mode={mode}
          strength={strength}
          pointer={isPreview ? PREVIEW_POINTER : undefined}
        />
      </div>
    </SimpleComponentDemoPage>
  );
}
