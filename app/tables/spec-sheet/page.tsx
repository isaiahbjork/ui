"use client";

import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { SpecSheet } from "@/components/bjork-ui/tables/spec-sheet";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("spec-sheet");

export default function SpecSheetDemo() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const tableTheme = previewTheme === "light" || previewTheme === "dark" ? previewTheme : "auto";

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A product spec sheet that compares up to three models side by side. Rows that differ are marked, one switch hides everything they share, group headings stick while you scroll, and on a phone it becomes a one-model view with a picker."
      usageCode={`import { SpecSheet, type SpecGroup, type SpecVariant } from "@/components/bjork-ui/tables/spec-sheet";

const variants: SpecVariant[] = [
  { id: "h14", name: "Halden 14", detail: "from $1,599" },
  { id: "h16", name: "Halden 16", detail: "from $2,299" },
];

const groups: SpecGroup[] = [
  {
    id: "display",
    label: "Display",
    rows: [
      { label: "Size", value: { h14: 14.2, h16: 16.2 }, unit: "in" },
      { label: "Peak brightness", value: { h14: 500, h16: 600 }, unit: "nits", note: "HDR content" },
      { label: "Color gamut", value: "100% DCI-P3" },
    ],
  },
];

<SpecSheet
  title="Compare models"
  variants={variants}
  groups={groups}
  onDifferencesOnlyChange={(on) => console.log(on)}
/>`}
      previewScaleClassName="w-[860px] scale-[0.98]"
      previewCaptureScaleClassName="w-[880px] scale-[0.9]"
      previewInnerClassName="bg-[#f7f5ef] dark:bg-[#111]"
    >
      <SpecSheet theme={tableTheme} enableAnimations={!isPreview} maxHeight={isPreview ? 406 : 540} />
    </SimpleComponentDemoPage>
  );
}
