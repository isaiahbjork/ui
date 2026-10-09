"use client";

import { useState } from "react";
import { ResponseCompare, SAMPLE_COMPARISON, type CompareVote } from "@/components/bjork-ui/ai/response-compare";
import { ShellActions, ShellSwitch, SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
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

const DEFAULT_BLIND = true;

function Demo({
  blind,
  run,
  vote,
  onVote,
}: {
  blind: boolean;
  run: number;
  vote: CompareVote | null;
  onVote: (vote: CompareVote | null) => void;
}) {
  const isPreview = usePreviewMode();

  if (isPreview) {
    return (
      <div className="w-[min(700px,calc(100vw-56px))]">
        <ResponseCompare {...SAMPLE_COMPARISON} rubric={[]} defaultValue={POSED_VOTE} />
      </div>
    );
  }

  return (
    <div className="flex w-[min(700px,calc(100vw-56px))] flex-col items-stretch gap-6">
      <ResponseCompare key={`${run}-${blind}`} {...SAMPLE_COMPARISON} blind={blind} onVote={onVote} />
      <p className="text-center font-mono text-[11px] text-[color:var(--bjork-text-faint)]">
        {vote ? `onVote → ${vote.choice}` : "Arrow keys move between choices"}
      </p>
    </div>
  );
}

export default function Page() {
  const [blind, setBlind] = useState(DEFAULT_BLIND);
  const [run, setRun] = useState(0);
  const [vote, setVote] = useState<CompareVote | null>(null);

  const reset = () => {
    setBlind(DEFAULT_BLIND);
    setVote(null);
    setRun((r) => r + 1);
  };

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
      optionsDefaultOpen={false}
      onReset={reset}
      controls={
        <>
          <ShellSwitch label="Blind" checked={blind} onCheckedChange={setBlind} />
          <ShellActions>
            <BjorkButton variant="ghost" size="sm" onClick={reset}>
              Reset
            </BjorkButton>
          </ShellActions>
        </>
      }
    >
      <Demo blind={blind} run={run} vote={vote} onVote={setVote} />
    </SimpleComponentDemoPage>
  );
}
