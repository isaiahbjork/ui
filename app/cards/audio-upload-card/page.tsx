"use client";

import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { AudioUploadCard } from "@/components/isaiahbjork/cards/audio-upload-card";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("audio-upload-card");

export default function AudioUploadCardPage() {
  return (
    <SimpleComponentDemoPage
      item={item}
      description="An audio upload card with a compact drop zone, file metadata, and a polished upload state for media workflows."
      previewScaleClassName="w-[520px] scale-[0.9]"
    >
      <AudioUploadCard />
    </SimpleComponentDemoPage>
  )
}
