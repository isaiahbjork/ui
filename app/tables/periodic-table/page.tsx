"use client";

import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { PeriodicTable, type ChemicalElement } from "@/components/bjork-ui/tables/periodic-table";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("periodic-table");

export default function PeriodicTableDemo() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const tableTheme = previewTheme === "light" || previewTheme === "dark" ? previewTheme : "auto";

  const handleElementSelect = (element: ChemicalElement) => {
    console.log("Selected element:", element.symbol);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A full periodic table with spring-physics hover cards that blur in from below each element."
      previewScaleClassName="w-[1090px] scale-[0.62]"
      previewInnerClassName="bg-[#f7f5ef] dark:bg-[#111]"
    >
      <PeriodicTable
        onElementSelect={handleElementSelect}
        theme={tableTheme}
        enableAnimations={!isPreview}
      />
    </SimpleComponentDemoPage>
  );
}
