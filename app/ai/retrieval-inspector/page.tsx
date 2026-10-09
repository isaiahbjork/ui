"use client";

import { useState } from "react";
import { RetrievalInspector, SAMPLE_RETRIEVAL } from "@/components/bjork-ui/ai/retrieval-inspector";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("retrieval-inspector");

function Demo() {
  const isPreview = usePreviewMode();
  const [threshold, setThreshold] = useState(0.7);

  return (
    <div className="flex w-[min(680px,calc(100vw-56px))] flex-col items-stretch gap-6">
      <RetrievalInspector
        {...SAMPLE_RETRIEVAL}
        threshold={threshold}
        onThresholdChange={setThreshold}
        defaultExpandedId={isPreview ? "c3" : undefined}
      />
      {!isPreview && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {[0.6, 0.7, 0.8].map((t) => (
            <BjorkButton
              key={t}
              variant={threshold === t ? "default" : "ghost"}
              aria-pressed={threshold === t}
              size="sm"
              onClick={() => setThreshold(t)}
            >
              {t.toFixed(2)}
            </BjorkButton>
          ))}
          <span className="font-mono text-[11px] text-[color:var(--bjork-text-faint)]">↑ ↓ to move, Enter to open</span>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <SimpleComponentDemoPage
      item={item}
      description="A debug view for retrieval: the query and model, then each chunk with its source, similarity, rerank move, token cost and whether the answer used it. Query terms are marked, and a threshold dims what would be cut."
      dependencies={["clsx", "tailwind-merge"]}
      usageCode={`import { RetrievalInspector, SAMPLE_RETRIEVAL } from "@/components/bjork-ui/ai/retrieval-inspector";

export function Demo() {
  return (
    <RetrievalInspector
      query={SAMPLE_RETRIEVAL.query}
      meta={SAMPLE_RETRIEVAL.meta}
      chunks={SAMPLE_RETRIEVAL.chunks}
      defaultThreshold={0.7}
    />
  );
}`}
      previewScaleClassName="w-[380px]"
      previewCaptureScaleClassName="w-[780px] scale-[0.6]"
    >
      <Demo />
    </SimpleComponentDemoPage>
  );
}
