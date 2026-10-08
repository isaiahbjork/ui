"use client";

import { useState } from "react";
import { SimpleComponentDemoPage, ShellSegmented } from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { BjorkSwitch } from "@/components/bjork-ui/primitives/switch";
import { DEMO_SIGNATURE, VelocityInk, type InkPen } from "@/components/bjork-ui/controls/velocity-ink";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("velocity-ink");

const PEN_OPTIONS = [
  { value: "pen", label: "Pen" },
  { value: "brush", label: "Brush" },
  { value: "fineliner", label: "Fineliner" },
];

function Demo() {
  const [pen, setPen] = useState<InkPen>("pen");
  const [guideOn, setGuideOn] = useState(true);
  const [svg, setSvg] = useState("");
  const [exported, setExported] = useState<string | null>(null);

  return (
    <div className="flex w-[min(560px,calc(100vw-56px))] min-w-0 flex-col gap-4">
      <VelocityInk
        className="w-full"
        pen={pen}
        onPenChange={setPen}
        guide={guideOn ? "signature" : "none"}
        onChange={(_, next) => setSvg(next)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ShellSegmented
          label="Tool"
          value={pen}
          options={PEN_OPTIONS}
          onChange={(next) => setPen(next as InkPen)}
        />
        <label className="flex items-center gap-2 text-sm">
          <BjorkSwitch checked={guideOn} onCheckedChange={setGuideOn} aria-label="Show signature guide" />
          Guide
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <BjorkButton type="button" onClick={() => setExported(svg)} disabled={!svg}>
          Export SVG
        </BjorkButton>
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
    </div>
  );
}

export default function Page() {
  const isPreview = usePreviewMode();

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
    >
      {isPreview ? (
        <div className="w-[min(560px,calc(100vw-56px))] min-w-0">
          <VelocityInk value={DEMO_SIGNATURE} toolbar={false} fallbackInput={false} className="w-full" />
        </div>
      ) : (
        <Demo />
      )}
    </SimpleComponentDemoPage>
  );
}
