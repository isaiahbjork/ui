"use client";

import { useState } from "react";
import { DiffReview, SAMPLE_DIFF, type DiffDecisions } from "@/components/bjork-ui/ai/diff-review";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("diff-review");

function Demo() {
  const isPreview = usePreviewMode();
  const [run, setRun] = useState(0);
  const [result, setResult] = useState<{ text: string; decisions: DiffDecisions } | null>(null);

  if (isPreview) {
    return (
      <div className="w-[min(620px,calc(100vw-56px))]">
        <DiffReview {...SAMPLE_DIFF} defaultDecisions={{ h0: "accepted" }} defaultFocusedHunk={1} />
      </div>
    );
  }

  const accepted = result ? Object.values(result.decisions).filter((d) => d === "accepted").length : 0;

  return (
    <div className="flex w-[min(620px,calc(100vw-56px))] flex-col items-stretch gap-5">
      <DiffReview key={run} {...SAMPLE_DIFF} onComplete={(text, decisions) => setResult({ text, decisions })} />
      <div className="flex flex-wrap items-center justify-center gap-3">
        <BjorkButton
          variant="secondary"
          size="sm"
          onClick={() => {
            setResult(null);
            setRun((r) => r + 1);
          }}
        >
          Reset
        </BjorkButton>
        <span className="font-mono text-[11px] text-[color:var(--bjork-text-faint)]">
          {result
            ? `onComplete → ${result.text.split("\n").length} lines, ${accepted} of ${Object.keys(result.decisions).length} accepted`
            : "Focus a change, then j / k to move, a / r to decide"}
        </span>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <SimpleComponentDemoPage
      item={item}
      description="Accept or reject an AI suggestion one change at a time. A line diff with word-level highlights, a resolved counter, keyboard review with j, k, a and r, and the merged text handed back when you finish."
      dependencies={["framer-motion", "clsx", "tailwind-merge"]}
      usageCode={`import { DiffReview, SAMPLE_DIFF } from "@/components/bjork-ui/ai/diff-review";

export function Demo() {
  return (
    <DiffReview
      filename={SAMPLE_DIFF.filename}
      original={SAMPLE_DIFF.original}
      suggestion={SAMPLE_DIFF.suggestion}
      onComplete={(text, decisions) => save(text)}
    />
  );
}`}
      previewScaleClassName="w-[380px]"
      previewCaptureScaleClassName="w-[620px] scale-[0.8]"
    >
      <Demo />
    </SimpleComponentDemoPage>
  );
}
