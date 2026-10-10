"use client";

import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { Overlay2 } from "@/components/bjork-ui/hud/overlay-2";
import { getGalleryItem } from "@/lib/bjork-gallery";

export default function Page() {
  const item = getGalleryItem("hud-2");

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A telemetry overlay for a live line: throughput with a drawn sparkline, four readouts in mono, and a sample and update footer. It sits on the library surface with ember as the only accent."
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
