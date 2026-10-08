"use client";

import { useState } from "react";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { BjorkButton, BjorkButtonGroup } from "@/components/bjork-ui/primitives";
import { InkBleedText, type InkBleedTrigger } from "@/components/bjork-ui/text/ink-bleed-text";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("ink-bleed-text");

const triggers: InkBleedTrigger[] = ["in-view", "loop"];

export default function InkBleedTextDemo() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const tone = previewTheme === "light" || previewTheme === "dark" ? previewTheme : undefined;
  const [trigger, setTrigger] = useState<InkBleedTrigger>("in-view");
  const [run, setRun] = useState(0);

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A word that soaks into paper. Drops land and wick outward through the fibres, the letters feather and wander while wet, then the ink dries to crisp type. Hover to re-wet the paper under the pointer."
      usageCode={`import { InkBleedText } from "@/components/bjork-ui/text/ink-bleed-text";

<InkBleedText
  text="Wet ink"
  trigger="in-view" // "mount" | "in-view" | "loop"
  duration={2.8}
  drops={3}
  spread={1}
  seed={7}
  rewet
/>`}
      previewScaleClassName="w-[900px] scale-[0.8]"
    >
      <div className="flex w-[860px] max-w-full min-w-0 flex-col items-center gap-8">
        {!isPreview ? (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <BjorkButtonGroup aria-label="Trigger">
              {triggers.map((value) => (
                <BjorkButton
                  key={value}
                  size="sm"
                  variant={trigger === value ? "secondary" : "ghost"}
                  aria-pressed={trigger === value}
                  onClick={() => setTrigger(value)}
                >
                  {value}
                </BjorkButton>
              ))}
            </BjorkButtonGroup>
            <BjorkButton size="sm" variant="ghost" onClick={() => setRun((r) => r + 1)}>
              Replay
            </BjorkButton>
          </div>
        ) : null}
        <div className="w-full min-w-0 px-2">
          <InkBleedText
            key={`${trigger}-${run}`}
            text="Wet ink"
            trigger={trigger}
            tone={tone}
            fontSize={isPreview ? 190 : 168}
            freezeAt={isPreview ? 0.22 : undefined}
          />
        </div>
        {!isPreview ? <p className="text-center text-[12px] text-current opacity-50">Hover to re-wet the paper.</p> : null}
      </div>
    </SimpleComponentDemoPage>
  );
}
