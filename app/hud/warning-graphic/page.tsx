"use client";

import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { WarningGraphic } from "@/components/bjork-ui/hud/warning";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("warning-graphic");

export default function Page() {
  return (
    <SimpleComponentDemoPage item={item} description="A warning graphic for alert states, system panels, and high-contrast HUD overlays." previewScaleClassName="w-[680px] scale-[0.86]">
      <WarningGraphic 
        width={600}
        height={230}
        enableAnimations={true}
        animationSpeed={1.5}
        className="drop-shadow-lg"
      />
    </SimpleComponentDemoPage>
  );
}
