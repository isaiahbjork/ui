"use client";

import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { HoverDetailCard } from "@/components/isaiahbjork/cards/hover-detail-card";
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
            color: "bg-blue-100",
            textColor: "text-blue-800",
          },
          sparkle: {
            show: true,
            color: "bg-purple-100 text-purple-800",
          },
          right: {
            text: "Published",
            color: "bg-green-100",
            textColor: "text-green-800",
          },
        }}
        enableAnimations={true}
      />
    </SimpleComponentDemoPage>
  );
}
