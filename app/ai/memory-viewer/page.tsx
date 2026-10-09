"use client";

import { useState } from "react";
import { MemoryViewer, SAMPLE_MEMORIES, type MemoryItem } from "@/components/bjork-ui/ai/memory-viewer";
import { ShellActions, SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("memory-viewer");

// The preview trims to four memories across three groups so the frame stays balanced.
const POSE_IDS = ["m1", "m3", "m4", "m6"];
const POSE_MEMORIES = SAMPLE_MEMORIES.filter((m) => POSE_IDS.includes(m.id));

function Demo({
  memories,
  run,
  log,
  onForget,
  onEdit,
}: {
  memories: MemoryItem[];
  run: number;
  log: string;
  onForget: (id: string) => void;
  onEdit: (id: string, text: string) => void;
}) {
  const isPreview = usePreviewMode();

  if (isPreview) {
    return (
      <div className="w-[min(520px,calc(100vw-56px))]">
        <MemoryViewer memories={POSE_MEMORIES} defaultEditingId="m3" />
      </div>
    );
  }

  return (
    <div className="flex w-[min(520px,calc(100vw-56px))] flex-col items-stretch gap-5">
      <MemoryViewer key={run} memories={memories} onForget={onForget} onEdit={onEdit} />
      <p className="min-w-0 truncate text-center font-mono text-[11px] text-[color:var(--bjork-text-faint)]">{log}</p>
    </div>
  );
}

export default function Page() {
  const [memories, setMemories] = useState<MemoryItem[]>(SAMPLE_MEMORIES);
  const [run, setRun] = useState(0);
  const [log, setLog] = useState("Hover a memory to edit or forget it");

  const reset = () => {
    setMemories(SAMPLE_MEMORIES);
    setLog("Hover a memory to edit or forget it");
    setRun((r) => r + 1);
  };

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
      previewCaptureScaleClassName="w-[520px] scale-[0.84]"
      optionsDefaultOpen={false}
      onReset={reset}
      controls={
        <ShellActions>
          <BjorkButton variant="ghost" size="sm" onClick={() => setMemories([])}>
            Clear all
          </BjorkButton>
          <BjorkButton variant="secondary" size="sm" onClick={reset}>
            Reset
          </BjorkButton>
        </ShellActions>
      }
    >
      <Demo
        memories={memories}
        run={run}
        log={log}
        onForget={(id) => {
          setMemories((list) => list.filter((m) => m.id !== id));
          setLog(`onForget(${id}) after the undo window`);
        }}
        onEdit={(id, text) => {
          setMemories((list) => list.map((m) => (m.id === id ? { ...m, text } : m)));
          setLog(`onEdit(${id})`);
        }}
      />
    </SimpleComponentDemoPage>
  );
}
