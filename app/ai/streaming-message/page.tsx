"use client";

import { useEffect, useState } from "react";
import { SAMPLE_STREAMING_MARKDOWN, StreamingMessage } from "@/components/bjork-ui/ai/streaming-message";
import { ShellActions, ShellSegmented, SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
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

const DEFAULT_SPEED: Speed = "normal";

// A new run value remounts the demo, which streams the answer again from the start.
function Demo({ speed }: { speed: Speed }) {
  const isPreview = usePreviewMode();
  const [count, setCount] = useState(0);

  const done = count >= CHUNKS.length;
  useEffect(() => {
    if (isPreview || done) return;
    // A short pause before the first token, like a real time-to-first-token.
    const delay = count === 0 ? 600 : SPEEDS[speed];
    const id = window.setTimeout(() => setCount((c) => c + 1), delay);
    return () => window.clearTimeout(id);
  }, [isPreview, done, count, speed]);

  const content = isPreview
    ? SAMPLE_STREAMING_MARKDOWN.slice(0, POSE_CUT)
    : SAMPLE_STREAMING_MARKDOWN.slice(0, count === 0 ? 0 : OFFSETS[count - 1]);
  const streaming = isPreview || !done;

  return (
    <div className="flex w-[min(600px,calc(100vw-56px))] flex-col gap-6">
      {!isPreview && <StreamingMessage role="user" content={QUESTION} />}
      <StreamingMessage content={content} streaming={streaming} lineNumbers={false} />
    </div>
  );
}

export default function Page() {
  const [run, setRun] = useState(0);
  const [speed, setSpeed] = useState<Speed>(DEFAULT_SPEED);

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
      previewCaptureScaleClassName="w-[600px] scale-[1.1]"
      optionsDefaultOpen={false}
      onReset={() => {
        setSpeed(DEFAULT_SPEED);
        setRun((r) => r + 1);
      }}
      controls={
        <>
          <ShellActions>
            <BjorkButton variant="secondary" size="sm" onClick={() => setRun((r) => r + 1)}>
              Replay
            </BjorkButton>
          </ShellActions>
          <ShellSegmented
            label="Speed"
            value={speed}
            onChange={(value) => setSpeed(value as Speed)}
            options={(Object.keys(SPEEDS) as Speed[]).map((value) => ({ value, label: value }))}
          />
        </>
      }
    >
      <Demo key={run} speed={speed} />
    </SimpleComponentDemoPage>
  );
}
