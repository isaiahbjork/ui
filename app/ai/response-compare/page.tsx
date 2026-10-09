"use client";

import { useState } from "react";
import { ResponseCompare, SAMPLE_COMPARISON, type CompareVote } from "@/components/bjork-ui/ai/response-compare";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { BjorkSwitch } from "@/components/bjork-ui/primitives/switch";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("response-compare");

const POSED_VOTE: CompareVote = {
  choice: "a",
  rubric: {
    Accuracy: { a: true, b: false },
    Helpfulness: { a: true, b: false },
    Tone: { a: true, b: true },
  },
};

function Demo() {
  const isPreview = usePreviewMode();
  const [blind, setBlind] = useState(true);
  const [run, setRun] = useState(0);
  const [vote, setVote] = useState<CompareVote | null>(null);

  if (isPreview) {
    return (
      <div className="w-[min(700px,calc(100vw-56px))]">
        <ResponseCompare {...SAMPLE_COMPARISON} rubric={[]} defaultValue={POSED_VOTE} />
      </div>
    );
  }

  return (
    <div className="flex w-[min(700px,calc(100vw-56px))] flex-col items-stretch gap-6">
      <ResponseCompare key={`${run}-${blind}`} {...SAMPLE_COMPARISON} blind={blind} onVote={setVote} />
      <div className="flex flex-wrap items-center justify-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[color:var(--bjork-text-muted)]">
          <BjorkSwitch aria-label="Blind" size="sm" checked={blind} onCheckedChange={setBlind} />
          Blind
        </label>
        <BjorkButton
          variant="secondary"
          size="sm"
          onClick={() => {
            setVote(null);
            setRun((r) => r + 1);
          }}
        >
          Reset
        </BjorkButton>
        <span className="font-mono text-[11px] text-[color:var(--bjork-text-faint)]">
          {vote ? `onVote → ${vote.choice}` : "Arrow keys move between choices"}
        </span>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <SimpleComponentDemoPage
      item={item}
      description="Two answers to one prompt, side by side, with latency, tokens and cost. Vote with a radio group, mark a rubric per side, and blind model names reveal once the vote is in."
      dependencies={["clsx", "tailwind-merge"]}
      usageCode={`import { ResponseCompare, SAMPLE_COMPARISON } from "@/components/bjork-ui/ai/response-compare";

export function Demo() {
  return (
    <ResponseCompare
      prompt={SAMPLE_COMPARISON.prompt}
      responses={SAMPLE_COMPARISON.responses}
      rubric={["Accuracy", "Helpfulness", "Tone"]}
      blind
      onVote={(vote) => console.log(vote)}
    />
  );
}`}
      previewScaleClassName="w-[380px]"
      previewCaptureScaleClassName="w-[700px] scale-[0.82]"
    >
      <Demo />
    </SimpleComponentDemoPage>
  );
}
