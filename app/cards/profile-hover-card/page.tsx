"use client"

import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell"
import { ProfileHoverCard } from "@/components/bjork-ui/cards/profile-hover-card"
import { getGalleryItem } from "@/lib/bjork-gallery"

const item = getGalleryItem("profile-hover-card")

export default function Page() {
  return (
    <SimpleComponentDemoPage item={item} description="A profile card with hover affordances for people grids, team views, and social surfaces." previewScaleClassName="w-[520px] scale-[0.92]">
      <ProfileHoverCard />
    </SimpleComponentDemoPage>
  )
}
