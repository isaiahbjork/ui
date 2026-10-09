"use client";

import { useState } from "react";
import { SimpleComponentDemoPage, ShellActions, ShellSegmented } from "@/components/bjork-ui/component-demo-shell";
import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { BjorkButton } from "@/components/bjork-ui/primitives";
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

  const reset = () => {
    setTrigger("in-view");
    setRun(0);
  };

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
