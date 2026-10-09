"use client";

import { useEffect, useState } from "react";
import { SAMPLE_STREAMING_MARKDOWN, StreamingMessage } from "@/components/bjork-ui/ai/streaming-message";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { BjorkButtonGroup } from "@/components/bjork-ui/primitives/button-group";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("streaming-message");

const QUESTION = "Saving drafts makes typing feel sticky on slow laptops. What should I change?";

// Token-sized chunks: a word with its leading whitespace, long words split into pieces of up to five characters.
const CHUNKS = SAMPLE_STREAMING_MARKDOWN.match(/\s*\S{1,5}/g) ?? [];
const OFFSETS = CHUNKS.reduce<number[]>((acc, chunk, i) => [...acc, (i === 0 ? 0 : acc[i - 1]) + chunk.length], []);

const SPEEDS = { slow: 70, normal: 32, fast: 12 } as const;
type Speed = keyof typeof SPEEDS;

// Preview pose: mid-stream, inside the open code fence, so the code block shows its "writing" state.
const POSE_CUT = SAMPLE_STREAMING_MARKDOWN.indexOf('=== "hidden"');

function Demo() {
  const isPreview = usePreviewMode();
  const [count, setCount] = useState(0);
  const [run, setRun] = useState(0);
  const [speed, setSpeed] = useState<Speed>("normal");

  const done = count >= CHUNKS.length;
  useEffect(() => {
    if (isPreview || done) return;
    // A short pause before the first token, like a real time-to-first-token.
    const delay = count === 0 ? 600 : SPEEDS[speed];
    const id = window.setTimeout(() => setCount((c) => c + 1), delay);
    return () => window.clearTimeout(id);
  }, [isPreview, done, count, speed, run]);

  const content = isPreview
    ? SAMPLE_STREAMING_MARKDOWN.slice(0, POSE_CUT)
    : SAMPLE_STREAMING_MARKDOWN.slice(0, count === 0 ? 0 : OFFSETS[count - 1]);
  const streaming = isPreview || !done;

  return (
    <div className="flex w-[min(600px,calc(100vw-56px))] flex-col gap-6">
      {!isPreview && <StreamingMessage role="user" content={QUESTION} />}
      <StreamingMessage key={run} content={content} streaming={streaming} lineNumbers={false} />
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
          <BjorkButtonGroup role="group" aria-label="Stream speed">
            {(Object.keys(SPEEDS) as Speed[]).map((value) => (
              <BjorkButton
                key={value}
                aria-pressed={speed === value}
                variant={speed === value ? "default" : "ghost"}
                size="sm"
                onClick={() => setSpeed(value)}
              >
                {value}
              </BjorkButton>
            ))}
          </BjorkButtonGroup>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <SimpleComponentDemoPage
      item={item}
      description="Assistant markdown that renders as it streams. Half-typed markup never flashes, an unclosed fence is already a code block, and only the last block re-renders per chunk."
      dependencies={["lucide-react", "clsx", "tailwind-merge"]}
      usageCode={`import { StreamingMessage } from "@/components/bjork-ui/ai/streaming-message";

export function Reply({ text, done }: { text: string; done: boolean }) {
  // Pass the full text so far on every chunk.
  return <StreamingMessage content={text} streaming={!done} />;
}`}
      previewScaleClassName="w-[360px]"
      previewCaptureScaleClassName="w-[600px] scale-[0.98]"
    >
      <Demo />
    </SimpleComponentDemoPage>
  );
}
