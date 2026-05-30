"use client";

import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { PredictionMarketCard } from "@/components/isaiahbjork/cards/prediction-market-card";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("prediction-market-card");

export default function Page() {
  return (
    <SimpleComponentDemoPage item={item} description="A prediction market card with betting-style probability, market metadata, and action surfaces." previewScaleClassName="w-[620px] scale-[0.84]">
      <PredictionMarketCard />
    </SimpleComponentDemoPage>
  );
}
