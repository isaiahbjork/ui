"use client"

import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell"
import { EventCountdownCard } from "@/components/isaiahbjork/cards/event-countdown-card"
import { getGalleryItem } from "@/lib/bjork-gallery"

const item = getGalleryItem("event-countdown-card")

export default function Page() {
  return (
    <SimpleComponentDemoPage item={item} description="A compact event countdown card with animated urgency states and date-focused hierarchy." previewScaleClassName="w-[520px] scale-[0.92]">
      <EventCountdownCard />
    </SimpleComponentDemoPage>
  )
}
