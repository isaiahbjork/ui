"use client";

import { useEffect, useState } from "react";
import {
  AttachmentChips,
  SAMPLE_ATTACHMENTS,
  SAMPLE_THUMBNAILS,
  type AttachmentItem,
} from "@/components/bjork-ui/ai/attachment-chips";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { BjorkButtonGroup } from "@/components/bjork-ui/primitives/button-group";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("attachment-chips");

type SimItem = AttachmentItem & { failAt?: number; wait?: number };

const TICK = 120;

// A fresh batch: everything queued. The wireframe fails part-way on its first attempt.
function freshBatch(run: number): SimItem[] {
  return [
    { id: `${run}-a`, name: "harbor-dusk.png", size: 2_516_582, status: "queued", thumbnail: SAMPLE_THUMBNAILS.dusk },
    { id: `${run}-b`, name: "q3-board-memo.pdf", size: 1_288_490, status: "queued" },
    { id: `${run}-c`, name: "wireframe-v4.jpg", size: 4_404_019, status: "queued", thumbnail: SAMPLE_THUMBNAILS.gridShot, failAt: 0.58 },
    { id: `${run}-d`, name: "retention-cohorts.csv", size: 348_160, status: "queued" },
    { id: `${run}-e`, name: "use-session.ts", size: 6_350, status: "queued" },
  ];
}

function step(items: SimItem[]): SimItem[] {
  let uploading = items.filter((i) => i.status === "uploading").length;
  return items.map((i): SimItem => {
    if (i.status === "queued" && uploading < 2) {
      uploading += 1;
      return { ...i, status: "uploading", progress: 0 };
    }
    if (i.status === "uploading") {
      // Bigger files move slower, with a floor so tiny files still show a frame or two.
      const progress = Math.min(1, (i.progress ?? 0) + Math.max(0.035, 140_000 / i.size));
      if (i.failAt !== undefined && progress >= i.failAt) {
        return { ...i, status: "error", progress, error: "Connection lost", failAt: undefined };
      }
      if (progress >= 1) return { ...i, status: "processing", progress: 1, wait: i.name.endsWith(".pdf") ? 22 : 9 };
      return { ...i, progress };
    }
    if (i.status === "processing") {
      const wait = (i.wait ?? 0) - 1;
      return wait <= 0 ? { ...i, status: "ready", wait: 0 } : { ...i, wait };
    }
    return i;
  });
}

function Demo() {
  const isPreview = usePreviewMode();
  const [run, setRun] = useState(0);
  const [items, setItems] = useState<SimItem[]>(() => freshBatch(0));
  const [layout, setLayout] = useState<"row" | "grid">("row");
  const [opened, setOpened] = useState<string | null>(null);

  const busy = items.some((i) => i.status === "queued" || i.status === "uploading" || i.status === "processing");
  useEffect(() => {
    if (isPreview || !busy) return;
    const id = window.setInterval(() => setItems((list) => step(list)), TICK);
    return () => window.clearInterval(id);
  }, [isPreview, busy]);

  const restart = () => {
    setRun((r) => r + 1);
    setItems(freshBatch(run + 1));
    setOpened(null);
  };

  return (
    <div className="flex w-[min(500px,calc(100vw-56px))] flex-col items-stretch gap-6">
      <AttachmentChips
        items={isPreview ? SAMPLE_ATTACHMENTS : items}
        layout={isPreview ? "row" : layout}
        onRemove={(id) => setItems((list) => list.filter((i) => i.id !== id))}
        onRetry={(id) =>
          setItems((list) => list.map((i) => (i.id === id ? { ...i, status: "uploading", error: undefined } : i)))
        }
        onOpen={(id) => setOpened(items.find((i) => i.id === id)?.name ?? null)}
      />
      {!isPreview && (
        <>
          <p className="min-h-4 text-center font-mono text-[11px] text-[color:var(--bjork-text-faint)]">
            {opened ? `Opened ${opened}` : "Click a ready file to open it"}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <BjorkButton variant="secondary" size="sm" onClick={restart}>
              Upload again
            </BjorkButton>
            <BjorkButtonGroup role="group" aria-label="Layout">
              {(["row", "grid"] as const).map((value) => (
                <BjorkButton
                  key={value}
                  aria-pressed={layout === value}
                  variant={layout === value ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setLayout(value)}
                >
                  {value}
                </BjorkButton>
              ))}
            </BjorkButtonGroup>
          </div>
        </>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <SimpleComponentDemoPage
      item={item}
      description="Attached files with honest upload states: queued, uploading with a ring and percentage, indexing, ready, and failed with a retry. Removing a file closes the gap smoothly."
      dependencies={["framer-motion", "lucide-react", "clsx", "tailwind-merge"]}
      usageCode={`import { AttachmentChips, type AttachmentItem } from "@/components/bjork-ui/ai/attachment-chips";

export function Tray({ files, remove, retry }: { files: AttachmentItem[]; remove: (id: string) => void; retry: (id: string) => void }) {
  return <AttachmentChips items={files} onRemove={remove} onRetry={retry} layout="row" />;
}`}
      previewScaleClassName="w-[340px]"
      previewCaptureScaleClassName="w-[500px] scale-[1.2]"
    >
      <Demo />
    </SimpleComponentDemoPage>
  );
}
