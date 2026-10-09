"use client";

import { useState } from "react";
import {
  ShellActions,
  ShellSegmented,
  ShellSwitch,
  SimpleComponentDemoPage,
} from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { DEMO_SIGNATURE, VelocityInk, type InkPen } from "@/components/bjork-ui/controls/velocity-ink";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("velocity-ink");

const PEN_OPTIONS: Array<{ value: InkPen; label: string }> = [
  { value: "pen", label: "Pen" },
  { value: "brush", label: "Brush" },
  { value: "fineliner", label: "Fineliner" },
];

const DEFAULT_PEN: InkPen = "pen";
const DEFAULT_GUIDE = true;

export default function Page() {
  const isPreview = usePreviewMode();
  const [pen, setPen] = useState<InkPen>(DEFAULT_PEN);
  const [guideOn, setGuideOn] = useState(DEFAULT_GUIDE);
  const [svg, setSvg] = useState("");
  const [exported, setExported] = useState<string | null>(null);

  const reset = () => {
    setPen(DEFAULT_PEN);
    setGuideOn(DEFAULT_GUIDE);
    setExported(null);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Sign with ink whose width follows your hand speed. Export the stroke as SVG, or type instead."
      usageCode={`<VelocityInk
  pen="pen"
  onChange={(strokes, svg) => saveSignature(svg)}
  attract
/>

// Typed fallback and Shift snapping are on by default
<VelocityInk fallbackInput snapAngles={8} />`}
      previewScaleClassName="w-[340px]"
      previewCaptureScaleClassName="w-[720px] scale-[1]"
      optionsDefaultOpen={false}
      onReset={reset}
      controls={
        <>
          <ShellSegmented label="Tool" value={pen} options={PEN_OPTIONS} onChange={setPen} />
          <ShellSwitch label="Guide" checked={guideOn} onCheckedChange={setGuideOn} />
          <ShellActions label="Export">
            <BjorkButton size="sm" variant="secondary" onClick={() => setExported(svg)} disabled={!svg}>
              Export SVG
            </BjorkButton>
          </ShellActions>
        </>
      }
    >
      {isPreview ? (
        <div className="w-[min(560px,calc(100vw-56px))] min-w-0">
          <VelocityInk value={DEMO_SIGNATURE} toolbar={false} fallbackInput={false} className="w-full" />
        </div>
      ) : (
        <div className="flex w-[min(560px,calc(100vw-56px))] min-w-0 flex-col gap-4">
          <VelocityInk
            className="w-full"
            pen={pen}
            onPenChange={setPen}
            guide={guideOn ? "signature" : "none"}
            onChange={(_, next) => setSvg(next)}
          />
          {exported && (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="Exported signature"
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(exported)}`}
                width={120}
                className="h-auto rounded-[8px] border border-[color:var(--bjork-border,#232323)] bg-[color:var(--bjork-surface,#121212)]"
              />
              <span className="font-mono text-[12px] tabular-nums text-[color:var(--bjork-text-muted,rgba(237,237,237,0.52))]">
                {exported.length} characters
              </span>
            </div>
          )}
        </div>
      )}
    </SimpleComponentDemoPage>
  );
}
