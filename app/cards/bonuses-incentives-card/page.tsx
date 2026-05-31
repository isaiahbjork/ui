"use client";

import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BonusesIncentivesCard } from "@/components/bjork-ui/cards/bonuses-incentives-card";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("bonuses-incentives-card");

export default function BonusesIncentivesCardPage() {
  const isPreview = usePreviewMode();

  return (
    <SimpleComponentDemoPage item={item} description="A bonuses and incentives card with animated circular details and expandable reward-style content." previewScaleClassName="w-[640px] scale-[0.84]">
      <BonusesIncentivesCard enableAnimations={!isPreview} />
    </SimpleComponentDemoPage>
  );
}
