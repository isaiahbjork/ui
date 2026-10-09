"use client";

import { useState } from "react";
import { MemoryViewer, SAMPLE_MEMORIES, type MemoryItem } from "@/components/bjork-ui/ai/memory-viewer";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("memory-viewer");

// The preview trims to five memories across three groups so the frame stays balanced.
const POSE_IDS = ["m1", "m3", "m4", "m6", "m7"];
const POSE_MEMORIES = SAMPLE_MEMORIES.filter((m) => POSE_IDS.includes(m.id));

function Demo() {
  const isPreview = usePreviewMode();
  const [memories, setMemories] = useState<MemoryItem[]>(SAMPLE_MEMORIES);
  const [run, setRun] = useState(0);
  const [log, setLog] = useState("Hover a memory to edit or forget it");

  if (isPreview) {
    return (
      <div className="w-[min(520px,calc(100vw-56px))]">
        <MemoryViewer memories={POSE_MEMORIES} defaultEditingId="m3" />
      </div>
    );
  }

  return (
    <div className="flex w-[min(520px,calc(100vw-56px))] flex-col items-stretch gap-5">
      <MemoryViewer
        key={run}
        memories={memories}
        onForget={(id) => {
          setMemories((list) => list.filter((m) => m.id !== id));
          setLog(`onForget(${id}) after the undo window`);
        }}
        onEdit={(id, text) => {
          setMemories((list) => list.map((m) => (m.id === id ? { ...m, text } : m)));
          setLog(`onEdit(${id})`);
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 truncate font-mono text-[11px] text-[color:var(--bjork-text-faint)]">{log}</p>
        <div className="flex gap-2">
          <BjorkButton variant="ghost" size="sm" onClick={() => setMemories([])}>
            Clear all
          </BjorkButton>
          <BjorkButton
            variant="secondary"
            size="sm"
            onClick={() => {
              setMemories(SAMPLE_MEMORIES);
              setRun((r) => r + 1);
            }}
          >
            Reset
          </BjorkButton>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <SimpleComponentDemoPage
      item={item}
      description="Everything the assistant remembers, grouped and searchable. Edit a memory in place, or forget it with five seconds to undo. Turning memory off dims the list and says what that means."
      dependencies={["framer-motion", "lucide-react", "clsx", "tailwind-merge"]}
      usageCode={`import { MemoryViewer, SAMPLE_MEMORIES } from "@/components/bjork-ui/ai/memory-viewer";

export function Settings() {
  return (
    <MemoryViewer
      memories={SAMPLE_MEMORIES}
      onForget={(id) => api.forget(id)}
      onEdit={(id, text) => api.update(id, text)}
    />
  );
}`}
      previewScaleClassName="w-[360px]"
      previewCaptureScaleClassName="w-[520px] scale-[0.92]"
    >
      <Demo />
    </SimpleComponentDemoPage>
  );
}
