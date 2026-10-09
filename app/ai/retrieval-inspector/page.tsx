"use client";

import { useState } from "react";
import { RetrievalInspector, SAMPLE_RETRIEVAL } from "@/components/bjork-ui/ai/retrieval-inspector";
import { ShellSegmented, SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("retrieval-inspector");

const THRESHOLDS = [0.6, 0.7, 0.8];
const DEFAULT_THRESHOLD = 0.7;

function Demo({ threshold, onThresholdChange }: { threshold: number; onThresholdChange: (t: number) => void }) {
  const isPreview = usePreviewMode();

  return (
    <div className="flex w-[min(680px,calc(100vw-56px))] flex-col items-stretch gap-6">
      <RetrievalInspector
        {...SAMPLE_RETRIEVAL}
        // The pose raises the cut so two chunks read as filtered.
        threshold={isPreview ? 0.8 : threshold}
        onThresholdChange={onThresholdChange}
      />
      {!isPreview && (
        <p className="text-center font-mono text-[11px] text-[color:var(--bjork-text-faint)]">↑ ↓ to move, Enter to open</p>
      )}
    </div>
  );
}

export default function Page() {
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);

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
      previewCaptureScaleClassName="w-[680px] scale-[0.66]"
      optionsDefaultOpen={false}
      onReset={() => setThreshold(DEFAULT_THRESHOLD)}
      controls={
        <ShellSegmented
          label="Threshold"
          value={threshold}
          options={THRESHOLDS.map((t) => ({ value: t, label: t.toFixed(2) }))}
          onChange={setThreshold}
        />
      }
    >
      <Demo threshold={threshold} onThresholdChange={setThreshold} />
    </SimpleComponentDemoPage>
  );
}
