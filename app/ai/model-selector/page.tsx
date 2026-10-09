"use client";

import { useRef, useState } from "react";
import { ModelSelector, SAMPLE_MODELS } from "@/components/bjork-ui/ai/model-selector";
import { ShellSegmented, SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("model-selector");

type Side = "top" | "bottom";
const DEFAULT_SIDE: Side = "bottom";

function Demo({ side }: { side: Side }) {
  const isPreview = usePreviewMode();
  const [model, setModel] = useState("halcyon-3-pro");
  const current = SAMPLE_MODELS.find((m) => m.id === model);
  const composerRef = useRef<HTMLDivElement>(null);

  if (isPreview) {
    // Posed frame: the composer with the menu open below it, the current model checked and highlighted.
    return (
      <div className="flex h-[520px] w-[min(440px,calc(100vw-56px))] flex-col items-stretch">
        <div ref={composerRef} className="rounded-[14px] border border-[color:var(--bjork-border)] px-3 pb-2 pt-3">
          <p className="px-1 text-[14px] leading-5 text-[color:var(--bjork-text-soft)]">Ask anything…</p>
          <div className="mt-4 flex items-center justify-between gap-2">
            <ModelSelector defaultValue="halcyon-3-pro" defaultOpen anchorRef={composerRef} />
          </div>
        </div>
      </div>
    );
  }

  // Pinned to the top of the pane so the open list (with its own scroll) has room below the composer.
  return (
    <div className="flex min-h-[600px] w-[min(460px,calc(100vw-56px))] flex-col items-stretch gap-6 self-start pt-6">
      <div ref={composerRef} className="rounded-[14px] border border-[color:var(--bjork-border)] px-3 pb-2 pt-3">
        <p className="px-1 text-[14px] leading-5 text-[color:var(--bjork-text-soft)]">Ask anything…</p>
        <div className="mt-6 flex items-center justify-between gap-2">
          <ModelSelector value={model} onValueChange={setModel} side={side} anchorRef={composerRef} />
          <span className="truncate font-mono text-[11px] text-[color:var(--bjork-text-faint)]">
            {current ? `${(current.contextWindow ?? 0) / 1000}k ctx` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const [side, setSide] = useState<Side>(DEFAULT_SIDE);

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A model picker with search, providers as groups, and the numbers that matter on every row: capabilities, context window, speed and price. Arrow keys move, Enter picks, Escape returns focus to the trigger."
      dependencies={["lucide-react", "clsx", "tailwind-merge"]}
      usageCode={`import { useState } from "react";
import { ModelSelector, SAMPLE_MODELS } from "@/components/bjork-ui/ai/model-selector";

export function Demo() {
  const [model, setModel] = useState("halcyon-3-pro");
  return <ModelSelector models={SAMPLE_MODELS} value={model} onValueChange={setModel} />;
}`}
      previewScaleClassName="w-[360px]"
      previewCaptureScaleClassName="w-[400px] scale-[1.0]"
      onReset={() => setSide(DEFAULT_SIDE)}
      controls={
        <ShellSegmented
          label="Side"
          value={side}
          onChange={(value) => setSide(value as Side)}
          options={[
            { value: "bottom", label: "Opens below" },
            { value: "top", label: "Opens above" },
          ]}
        />
      }
    >
      <Demo side={side} />
    </SimpleComponentDemoPage>
  );
}
