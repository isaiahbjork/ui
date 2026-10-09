"use client";

import { useRef, useState } from "react";
import { ModelSelector, SAMPLE_MODELS } from "@/components/bjork-ui/ai/model-selector";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BjorkButtonGroup } from "@/components/bjork-ui/primitives/button-group";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("model-selector");

function Demo() {
  const isPreview = usePreviewMode();
  const [model, setModel] = useState("halcyon-3-pro");
  const [side, setSide] = useState<"top" | "bottom">("bottom");
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
      <div className="flex flex-wrap items-center justify-center gap-3">
        <BjorkButtonGroup role="group" aria-label="Preferred side">
          {(["bottom", "top"] as const).map((value) => (
            <BjorkButton
              key={value}
              aria-pressed={side === value}
              variant={side === value ? "default" : "ghost"}
              size="sm"
              onClick={() => setSide(value)}
            >
              Opens {value === "bottom" ? "below" : "above"}
            </BjorkButton>
          ))}
        </BjorkButtonGroup>
      </div>
    </div>
  );
}

export default function Page() {
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
    >
      <Demo />
    </SimpleComponentDemoPage>
  );
}
