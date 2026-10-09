"use client";

import { useState } from "react";
import { ContextMeter, SAMPLE_CONTEXT, type ContextSegment } from "@/components/bjork-ui/ai/context-meter";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("context-meter");
const LIMIT = 200_000;

function bump(segments: ContextSegment[], id: string, delta: number): ContextSegment[] {
  return segments.map((s) => (s.id === id ? { ...s, tokens: Math.max(0, s.tokens + delta) } : s));
}

function Demo() {
  const isPreview = usePreviewMode();
  const [segments, setSegments] = useState<ContextSegment[]>(SAMPLE_CONTEXT);

  return (
    <div className="flex w-[min(460px,calc(100vw-56px))] flex-col items-stretch gap-7">
      <ContextMeter segments={segments} limit={LIMIT} />

      <div className="flex items-center justify-between gap-3 rounded-[12px] border border-[color:var(--bjork-border)] px-3 py-2">
        <span className="min-w-0 truncate text-[13px] text-[color:var(--bjork-text-muted)]">
          Compact, for a composer footer
        </span>
        <ContextMeter segments={segments} limit={LIMIT} variant="compact" />
      </div>

      {!isPreview && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <BjorkButton variant="secondary" size="sm" onClick={() => setSegments((s) => bump(s, "conversation", 9_000))}>
            Add turn
          </BjorkButton>
          <BjorkButton variant="secondary" size="sm" onClick={() => setSegments((s) => bump(s, "files", 14_000))}>
            Attach file
          </BjorkButton>
          <BjorkButton variant="secondary" size="sm" onClick={() => setSegments((s) => bump(s, "tools", 6_000))}>
            Tool call
          </BjorkButton>
          <BjorkButton
            variant="ghost"
            size="sm"
            onClick={() => setSegments((s) => bump(bump(s, "conversation", -48_000), "tools", -10_000))}
          >
            Summarize
          </BjorkButton>
          <BjorkButton variant="ghost" size="sm" onClick={() => setSegments(SAMPLE_CONTEXT)}>
            Reset
          </BjorkButton>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <SimpleComponentDemoPage
      item={item}
      description="Context window usage split by what is spending it. The bar and legend are linked, and the meter turns amber, then red, as the window fills."
      dependencies={["clsx", "tailwind-merge"]}
      usageCode={`import { ContextMeter, SAMPLE_CONTEXT } from "@/components/bjork-ui/ai/context-meter";

export function Demo() {
  return (
    <>
      <ContextMeter segments={SAMPLE_CONTEXT} limit={200_000} />
      <ContextMeter segments={SAMPLE_CONTEXT} limit={200_000} variant="compact" />
    </>
  );
}`}
      previewScaleClassName="w-[340px]"
      previewCaptureScaleClassName="w-[460px] scale-[1.05]"
    >
      <Demo />
    </SimpleComponentDemoPage>
  );
}
