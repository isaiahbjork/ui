"use client";

import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { Overlay2 } from "@/components/bjork-ui/hud/overlay-2";
import { getGalleryItem } from "@/lib/bjork-gallery";

export default function Page() {
  const item = getGalleryItem("hud-2");

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A second HUD overlay flow with the animated interface background, staggered system text, menu readout, status lockup, and no outer frame chrome."
      dependencies={["framer-motion", "clsx"]}
      usageCode={`import { Overlay2 } from "@/components/bjork-ui/hud/overlay-2";

export function Demo() {
  return <Overlay2 />;
}`}
      previewScaleClassName="w-[920px] scale-[0.72]"
      previewInnerClassName="p-0 bg-transparent"
    >
      <Overlay2 className="h-[620px] w-[920px]" compact />
    </SimpleComponentDemoPage>
  );
}
