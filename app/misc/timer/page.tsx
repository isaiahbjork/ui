"use client";

import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { Timer } from "@/components/bjork-ui/misc/timer";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("timer");

export default function Page() {
  const isPreview = usePreviewMode();
  const previewTone = usePreviewSearchParam("theme") === "light" ? "light" : "dark";

  if (isPreview) {
    return (
      <div
        className={
          previewTone === "light"
            ? "flex min-h-screen items-center justify-center overflow-hidden bg-[#f7f5ef]"
            : "flex min-h-screen items-center justify-center overflow-hidden bg-[#111]"
        }
      >
        <div className="w-[400px] scale-[0.8]">
          <Timer title="Focus" duration={25 * 60} tone={previewTone} />
        </div>
      </div>
    );
  }

  if (!item) return null;

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A countdown instrument: rolling digits on a hairline dial. Drag the dial or the digits to set time, use the presets, and run it from the keyboard."
      previewScaleClassName="w-[420px] scale-[0.92]"
    >
      <Timer title="Focus" duration={25 * 60} presets={[60, 5 * 60, 25 * 60]} />
    </SimpleComponentDemoPage>
  );
}
