"use client";

import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { Glitchy404 } from "@/components/isaiahbjork/hud/glitchy-404";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("glitchy-404");

export default function Page() {

  return (
    <SimpleComponentDemoPage item={item} description="A glitch-styled 404 graphic built for HUD pages, error states, and cinematic system screens." previewScaleClassName="w-[820px] scale-[0.78]">
      <Glitchy404 width={800} height={232} />
    </SimpleComponentDemoPage>
  );
}
