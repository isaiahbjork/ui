"use client"

import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell"
import { ProductRevealCard } from "@/components/isaiahbjork/cards/product-reveal-card"
import { getGalleryItem } from "@/lib/bjork-gallery"

const item = getGalleryItem("product-reveal-card")

export default function Page() {
  return (
    <SimpleComponentDemoPage item={item} description="A product reveal card for hover-led product storytelling, feature peeks, and compact commerce surfaces." previewScaleClassName="w-[560px] scale-[0.88]">
      <ProductRevealCard />
    </SimpleComponentDemoPage>
  )
}
