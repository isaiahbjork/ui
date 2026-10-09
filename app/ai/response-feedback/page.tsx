"use client";

import { useState } from "react";
import { ResponseFeedback, type FeedbackPayload } from "@/components/bjork-ui/ai/response-feedback";
import { ShellActions, SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("response-feedback");

const ANSWER =
  "Kestrel Mini supports a 128k context window and streams at roughly 90 tokens a second on the standard tier. For long documents, split them into sections and summarise each one first.";

function Demo({
  run,
  last,
  onSubmit,
  onUndo,
}: {
  run: number;
  last: FeedbackPayload | null;
  onSubmit: (payload: FeedbackPayload) => void;
  onUndo: () => void;
}) {
  const isPreview = usePreviewMode();

  return (
    <div className="flex w-[min(460px,calc(100vw-56px))] flex-col gap-3">
      <p className="text-[14px] leading-[22px] text-[color:var(--bjork-text-medium)]">{ANSWER}</p>
      {isPreview ? (
        <ResponseFeedback defaultValue="down" defaultOpen defaultReasons={["Inaccurate", "Outdated sources"]} />
      ) : (
        <ResponseFeedback key={run} onSubmit={onSubmit} onUndo={onUndo} />
      )}
      {!isPreview && (
        <p className="mt-6 min-h-4 max-w-full truncate text-center font-mono text-[11px] text-[color:var(--bjork-text-faint)]">
          {last
            ? `onSubmit → ${last.rating}${last.reasons.length ? ` · ${last.reasons.join(", ")}` : ""}${last.comment ? ` · “${last.comment}”` : ""}`
            : "Nothing sent yet"}
        </p>
      )}
    </div>
  );
}

export default function Page() {
  const [run, setRun] = useState(0);
  const [last, setLast] = useState<FeedbackPayload | null>(null);

  const reset = () => {
    setLast(null);
    setRun((r) => r + 1);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Thumbs up and down for an AI answer. A rating opens a short panel of reasons and an optional comment, then folds into a quiet receipt you can undo."
      dependencies={["framer-motion", "lucide-react", "clsx", "tailwind-merge"]}
      usageCode={`import { ResponseFeedback } from "@/components/bjork-ui/ai/response-feedback";

export function Feedback({ messageId }: { messageId: string }) {
  return (
    <ResponseFeedback
      onSubmit={({ rating, reasons, comment }) => sendFeedback(messageId, rating, reasons, comment)}
    />
  );
}`}
      previewScaleClassName="w-[340px]"
      previewCaptureScaleClassName="w-[460px] scale-[1.25]"
      onReset={reset}
      controls={
        <ShellActions>
          <BjorkButton variant="ghost" size="sm" onClick={reset}>
            Reset
          </BjorkButton>
        </ShellActions>
      }
    >
      <Demo run={run} last={last} onSubmit={setLast} onUndo={() => setLast(null)} />
    </SimpleComponentDemoPage>
  );
}
