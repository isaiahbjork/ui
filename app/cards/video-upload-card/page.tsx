"use client";

import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { FileVideo2, MousePointer2, Upload } from "lucide-react";
import { ComponentDemoShell } from "@/components/bjork-ui/component-demo-shell";
import { VideoUploadCard } from "@/components/bjork-ui/cards/video-upload-card";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("video-upload-card");

export default function VideoUploadCardPage() {
  const isPreview = usePreviewMode();
    const previewTheme = usePreviewSearchParam("theme");
  const isPreviewLight = previewTheme === "light";
  const previewTone = isPreview ? (isPreviewLight ? "light" : "dark") : undefined;
  const demo = (
    <div className="flex w-full items-center justify-center px-6">
      <VideoUploadCard tone={previewTone} />
    </div>
  );

  if (isPreview) {
    return (
      <div className={isPreviewLight ? "light flex min-h-screen items-center justify-center bg-[#f7f5ef]" : "dark flex min-h-screen items-center justify-center bg-[#111111]"}>
        <div className="w-[560px] scale-[0.76]">{demo}</div>
      </div>
    );
  }

  if (!item) return null;

  return (
    <ComponentDemoShell
      item={item}
      description="A video upload card with click-to-select, drag-over state, upload simulation, and inline video preview. The top mask keeps the reveal controlled while the file transitions into the playback surface."
      dependencies={["framer-motion", "clsx"]}
      interactionRows={[
        {
          icon: <Upload className="size-5" />,
          label: "Drag and drop",
          value: "Drop video files directly onto the card or click to open the file picker.",
        },
        {
          icon: <FileVideo2 className="size-5" />,
          label: "Inline preview",
          value: "Uploaded videos receive an object URL and render inside the card.",
        },
        {
          icon: <MousePointer2 className="size-5" />,
          label: "Stateful animation",
          value: "Upload, remove, playback, and hover states are animated independently.",
        },
      ]}
      cliCommand="npx shadcn add @bjork-ui/video-upload-card"
      usageCode={`import { VideoUploadCard } from "@/components/bjork-ui/cards/video-upload-card";

export function Demo() {
  return <VideoUploadCard />;
}`}
    >
      {demo}
    </ComponentDemoShell>
  )
}
