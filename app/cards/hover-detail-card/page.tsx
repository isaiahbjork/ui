"use client";

import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { HoverDetailCard } from "@/components/bjork-ui/cards/hover-detail-card";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("hover-detail-card");

export default function Page() {
  return (
    <SimpleComponentDemoPage item={item} description="A hover detail card for collection tiles, archive actions, and compact media metadata." previewScaleClassName="w-[560px] scale-[0.9]">
      <HoverDetailCard
        title="Studio shots"
        subtitle="52 tiles"
        primaryButton={{
          text: "Go to collection",
          color: "bg-white/90",
          hoverColor: "hover:bg-white",
          textColor: "text-gray-900",
        }}
        secondaryButton={{
          text: "Edit rules",
          color: "bg-blue-600",
          hoverColor: "hover:bg-blue-700",
          textColor: "text-white",
        }}
        pills={{
          left: {
            text: "1×1",
            color: "bg-[#ec5c13]/12",
            textColor: "text-[#bd4514] dark:text-[#d86a2c]",
          },
          sparkle: {
            show: true,
            color: "bg-[#ec5c13]/12 text-[#bd4514] dark:bg-[#090909] dark:text-[#d86a2c]",
          },
          right: {
            text: "Published",
            color: "bg-[#2d8f62]/12 dark:bg-[#8a7a60]/14",
            textColor: "text-[#1f6f4b] dark:text-[#b8aa91]",
          },
        }}
        enableAnimations={true}
      />
    </SimpleComponentDemoPage>
  );
}
