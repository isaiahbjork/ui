"use client";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { Status } from "@/components/isaiahbjork/hud/status";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("hud-status");

export default function Page() {
  return (
    <SimpleComponentDemoPage
      item={item}
      description="A compact HUD status panel for system health, telemetry, and ambient operational signals."
      previewScaleClassName="w-[560px] scale-[0.92]"
    >
      <Status />
    </SimpleComponentDemoPage>
  );
}
