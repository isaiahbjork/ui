"use client";

import { useEffect, useState } from "react";
import { ModelSelector } from "@/components/bjork-ui/ai/model-selector";
import {
  PromptComposer,
  SAMPLE_COMMANDS,
  type ComposerAttachment,
  type PromptSubmission,
} from "@/components/bjork-ui/ai/prompt-composer";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BjorkSwitch } from "@/components/bjork-ui/primitives/switch";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("prompt-composer");

const POSE_ATTACHMENTS: ComposerAttachment[] = [{ id: "pose-1", name: "launch-brief.pdf", size: 1_288_490 }];
const POSE_TEXT = "Draft a reply to Mara about the launch slip, using the brief.\n/";

function Demo() {
  const isPreview = usePreviewMode();
  const [streaming, setStreaming] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [last, setLast] = useState<PromptSubmission | null>(null);

  // A pretend reply streams for three seconds after each send.
  useEffect(() => {
    if (!streaming) return;
    const id = window.setTimeout(() => setStreaming(false), 3000);
    return () => window.clearTimeout(id);
  }, [streaming]);

  if (isPreview) {
    return (
      <div className="w-[min(560px,calc(100vw-56px))] pt-[268px]">
        <PromptComposer
          defaultValue={POSE_TEXT}
          defaultAttachments={POSE_ATTACHMENTS}
          commands={SAMPLE_COMMANDS}
          modelSlot={<ModelSelector defaultValue="halcyon-3-pro" side="top" />}
        />
      </div>
    );
  }

  return (
    <div className="flex w-[min(560px,calc(100vw-56px))] flex-col items-stretch gap-5 pt-[180px]">
      <PromptComposer
        streaming={streaming}
        disabled={disabled}
        onSubmit={(s) => {
          setLast(s);
          setStreaming(true);
        }}
        onStop={() => setStreaming(false)}
        modelSlot={<ModelSelector defaultValue="halcyon-3-pro" side="top" align="start" />}
      />
      <div className="flex min-h-5 flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 truncate font-mono text-[11px] text-[color:var(--bjork-text-faint)]">
          {streaming
            ? "Streaming reply… press stop"
            : last
              ? `Sent${last.command ? ` /${last.command.name}` : ""}: “${last.text || "(no text)"}”${
                  last.attachments.length ? ` + ${last.attachments.length} file${last.attachments.length > 1 ? "s" : ""}` : ""
                }`
              : "Enter sends, Shift+Enter adds a line, drop or paste files"}
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[color:var(--bjork-text-muted)]">
          <BjorkSwitch aria-label="Disabled" size="sm" checked={disabled} onCheckedChange={setDisabled} />
          Disabled
        </label>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <SimpleComponentDemoPage
      item={item}
      description="A chat input that grows with its text, takes files by button, paste or drop, opens a command list on “/”, and turns send into stop while a reply streams."
      dependencies={["framer-motion", "lucide-react", "clsx", "tailwind-merge"]}
      usageCode={`import { PromptComposer, SAMPLE_COMMANDS } from "@/components/bjork-ui/ai/prompt-composer";
import { ModelSelector } from "@/components/bjork-ui/ai/model-selector";

export function Composer({ streaming, send, stop }: { streaming: boolean; send: (text: string) => void; stop: () => void }) {
  return (
    <PromptComposer
      streaming={streaming}
      commands={SAMPLE_COMMANDS}
      onSubmit={({ text }) => send(text)}
      onStop={stop}
      modelSlot={<ModelSelector side="top" />}
    />
  );
}`}
      previewScaleClassName="w-[360px]"
      previewCaptureScaleClassName="w-[560px] scale-[1.0]"
    >
      <Demo />
    </SimpleComponentDemoPage>
  );
}
