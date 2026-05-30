"use client";

import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { HoverImageGallery } from "@/components/isaiahbjork/galleries/hover-image-gallery";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("hover-image-gallery");

export default function Page() {

  return (
    <SimpleComponentDemoPage item={item} description="A hover-driven image gallery for visual indexes, portfolio grids, and image-led browsing." previewScaleClassName="w-[960px] scale-[0.68]">
      <HoverImageGallery />
    </SimpleComponentDemoPage>
  );
}
