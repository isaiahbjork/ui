"use client";

import { useState } from "react";
import { SimpleComponentDemoPage, ShellActions, ShellSegmented } from "@/components/bjork-ui/component-demo-shell";
import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { BjorkButton } from "@/components/bjork-ui/primitives";
import { StrokeDrawType, type StrokeDrawTrigger } from "@/components/bjork-ui/text/stroke-draw-type";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("stroke-draw-type");

const triggers: StrokeDrawTrigger[] = ["in-view", "hover", "loop"];

export default function StrokeDrawTypeDemo() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const tone = previewTheme === "light" || previewTheme === "dark" ? previewTheme : undefined;
  const [trigger, setTrigger] = useState<StrokeDrawTrigger>("in-view");
  const [run, setRun] = useState(0);

  const reset = () => {
    setTrigger("in-view");
    setRun(0);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Outline type that draws itself with a small glowing pen tip, then fills from below like liquid rising. Hover drains the fill back down, and the liquid hangs on the letter tops in beads before it lets go."
      usageCode={`import { StrokeDrawType } from "@/components/bjork-ui/text/stroke-draw-type";

<StrokeDrawType
  text="Signature"
  trigger="in-view" // "mount" | "in-view" | "hover" | "loop"
  strokeWidth={1.6}
  duration={1.5}
  stagger={0.11}
  drainOnHover
/>`}
      previewScaleClassName="w-[900px] scale-[0.8]"
      optionsDefaultOpen={false}
      onReset={reset}
      controls={
        <>
          <ShellSegmented
            label="Trigger"
            value={trigger}
            options={triggers.map((value) => ({ value, label: value }))}
            onChange={setTrigger}
          />
          <ShellActions>
            <BjorkButton size="sm" variant="secondary" onClick={() => setRun((r) => r + 1)}>
              Replay
            </BjorkButton>
          </ShellActions>
        </>
      }
    >
      <div className="flex w-[860px] max-w-full min-w-0 flex-col items-center gap-8">
        <div className="w-full min-w-0 px-2">
          <StrokeDrawType
            key={`${trigger}-${run}`}
            text="Signature"
            trigger={trigger}
            tone={tone}
            fontSize={isPreview ? 176 : 150}
            freezeAt={isPreview ? 0.55 : undefined}
          />
        </div>
        {!isPreview ? (
          <p className="text-center text-[12px] text-current opacity-50">
            {trigger === "hover" ? "Hover to fill." : trigger === "loop" ? "Draws, fills, drains, repeats." : "Hover to drain the fill."}
          </p>
        ) : null}
      </div>
    </SimpleComponentDemoPage>
  );
}
