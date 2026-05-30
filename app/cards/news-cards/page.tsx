"use client";

import { NewsCards } from "@/components/isaiahbjork/cards/news-cards";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("news-cards");

export default function NewsCardsDemo() {
  return (
    <SimpleComponentDemoPage item={item} description="A responsive news card set with animated editorial cards and stacked content rhythm." previewScaleClassName="w-[980px] scale-[0.66]">
      <NewsCards enableAnimations />
    </SimpleComponentDemoPage>
  );
}
