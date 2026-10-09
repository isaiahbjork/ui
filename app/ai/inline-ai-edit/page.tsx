"use client";

import { useState } from "react";
import { InlineAiEdit, SAMPLE_DOCUMENT, mockRewrite } from "@/components/bjork-ui/ai/inline-ai-edit";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("inline-ai-edit");

const POSED = "It is a lot more faster then before and it actually understands what you mean";
const POSE_START = SAMPLE_DOCUMENT.indexOf(POSED);
const POSE = {
  start: POSE_START,
  end: POSE_START + POSED.length,
  proposal: "It is much faster, and it understands what you mean",
  label: "Improve",
};

// A new run value remounts the editor with the text it is given.
function Demo({
  doc,
  setDoc,
  run,
}: {
  doc: string;
  setDoc: (doc: string) => void;
  run: number;
}) {
  const isPreview = usePreviewMode();

  if (isPreview) {
    return (
      <div className="w-[min(600px,calc(100vw-56px))] pb-12">
        <InlineAiEdit defaultValue={SAMPLE_DOCUMENT} pose={POSE} />
      </div>
    );
  }

  return (
    <div className="flex w-[min(600px,calc(100vw-56px))] flex-col items-stretch gap-6 pb-10">
      <InlineAiEdit key={run} value={doc} onValueChange={setDoc} onRewrite={mockRewrite} />
      <div className="flex flex-wrap items-center justify-center gap-3">
        <span className="font-mono text-[11px] text-[color:var(--bjork-text-faint)]">Select text, or click a paragraph and press ⌘K</span>
      </div>
    </div>
  );
}

export default function Page() {
  const [doc, setDoc] = useState(SAMPLE_DOCUMENT);
  const [run, setRun] = useState(0);

  const reset = () => {
    setDoc(SAMPLE_DOCUMENT);
    setRun((r) => r + 1);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Select text and ask AI to rewrite it. A floating toolbar offers quick edits or a free-form instruction, and the proposal streams in place over the struck original until you accept or discard it."
      dependencies={["lucide-react", "clsx", "tailwind-merge"]}
      usageCode={`import { InlineAiEdit, SAMPLE_DOCUMENT } from "@/components/bjork-ui/ai/inline-ai-edit";

export function Demo() {
  const [doc, setDoc] = useState(SAMPLE_DOCUMENT);
  return (
    <InlineAiEdit
      value={doc}
      onValueChange={setDoc}
      onRewrite={async function* (text, instruction) {
        // Stream chunks from your model here.
        yield* streamRewrite(text, instruction);
      }}
    />
  );
}`}
      previewScaleClassName="w-[360px]"
      previewCaptureScaleClassName="w-[600px] scale-[0.95]"
      optionsDefaultOpen={false}
      onReset={reset}
    >
      <Demo doc={doc} setDoc={setDoc} run={run} />
    </SimpleComponentDemoPage>
  );
}
