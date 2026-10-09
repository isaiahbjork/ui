"use client";

import { useEffect, useState } from "react";
import {
  ReasoningDisclosure,
  SAMPLE_REASONING,
  SAMPLE_REASONING_STEPS,
} from "@/components/bjork-ui/ai/reasoning-disclosure";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { BjorkSwitch } from "@/components/bjork-ui/primitives/switch";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("reasoning-disclosure");

const CHUNKS = SAMPLE_REASONING.match(/\s*\S{1,6}/g) ?? [];
const OFFSETS = CHUNKS.reduce<number[]>((acc, chunk, i) => [...acc, (i === 0 ? 0 : acc[i - 1]) + chunk.length], []);
const TICK_MS = 45;

// Each outline step appears once the stream passes the paragraph it summarises.
const PARAGRAPH_STARTS = SAMPLE_REASONING.split(/\n{2,}/).reduce<number[]>(
  (acc, p, i, all) => [...acc, i === 0 ? 0 : acc[i - 1] + all[i - 1].length + 2],
  [],
);

function stepsFor(length: number): string[] {
  return SAMPLE_REASONING_STEPS.filter((_, i) => length > (PARAGRAPH_STARTS[i] ?? Infinity));
}

// Fixed clock for the preview pose.
const POSE = 1_700_000_000_000;
const POSE_CUT = SAMPLE_REASONING.indexOf("The risk is");

function Demo() {
  const isPreview = usePreviewMode();
  const [count, setCount] = useState(0);
  const [run, setRun] = useState(0);
  const [autoCollapse, setAutoCollapse] = useState(true);

  const done = count >= CHUNKS.length;
  useEffect(() => {
    if (isPreview || done) return;
    const id = window.setTimeout(() => setCount((c) => c + 1), count === 0 ? 500 : TICK_MS);
    return () => window.clearTimeout(id);
  }, [isPreview, done, count, run]);

  const text = isPreview ? SAMPLE_REASONING.slice(0, POSE_CUT) : SAMPLE_REASONING.slice(0, count === 0 ? 0 : OFFSETS[count - 1]);

  return (
    <div className="flex w-[min(520px,calc(100vw-56px))] flex-col gap-6">
      {isPreview ? (
        <ReasoningDisclosure
          text={text}
          streaming
          steps={stepsFor(text.length)}
          startedAt={POSE}
          now={POSE + 7400}
        />
      ) : (
        <ReasoningDisclosure
          key={run}
          text={text}
          streaming={!done}
          steps={stepsFor(text.length)}
          autoCollapse={autoCollapse}
        />
      )}
      {!isPreview && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <BjorkButton
            variant="secondary"
            size="sm"
            onClick={() => {
              setCount(0);
              setRun((r) => r + 1);
            }}
          >
            Replay
          </BjorkButton>
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[color:var(--bjork-text-muted)]">
            <BjorkSwitch aria-label="Auto-collapse" size="sm" checked={autoCollapse} onCheckedChange={setAutoCollapse} />
            Auto-collapse
          </label>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <SimpleComponentDemoPage
      item={item}
      description="A model's reasoning as a quiet disclosure. The label shimmers and the seconds count while it streams into a capped, self-scrolling viewport, then it settles into “Thought for 12s” and folds away."
      dependencies={["framer-motion", "clsx", "tailwind-merge"]}
      usageCode={`import { ReasoningDisclosure } from "@/components/bjork-ui/ai/reasoning-disclosure";

export function Reasoning({ text, done, ms }: { text: string; done: boolean; ms?: number }) {
  return <ReasoningDisclosure text={text} streaming={!done} durationMs={ms} />;
}`}
      previewScaleClassName="w-[340px]"
      previewCaptureScaleClassName="w-[520px] scale-[1.3]"
    >
      <Demo />
    </SimpleComponentDemoPage>
  );
}
