"use client";

import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BonusesIncentivesCard } from "@/components/isaiahbjork/cards/bonuses-incentives-card";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("bonuses-incentives-card");

export default function BonusesIncentivesCardPage() {
  return (
    <SimpleComponentDemoPage item={item} description="A bonuses and incentives card with animated circular details and expandable reward-style content." previewScaleClassName="w-[640px] scale-[0.84]">
      <BonusesIncentivesCard />
    </SimpleComponentDemoPage>
  );
}
