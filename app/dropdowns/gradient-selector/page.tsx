"use client";

import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { GradientSelector, type GradientOption } from "@/components/bjork-ui/dropdowns/gradient-selector";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("gradient-selector");

export default function Page() {
  const handleSelectionChange = (option: GradientOption, index: number) => {
    console.log("Selected:", option.label, "Index:", index);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A wide gradient selector with animated option states for choosing model durations, themes, or generated looks."
      previewScaleClassName="w-[880px] scale-[0.78]"
    >
      <GradientSelector
        defaultSelected="5m"
        onSelectionChange={handleSelectionChange}
        className="w-full max-w-4xl"
      />
    </SimpleComponentDemoPage>
  );
}
