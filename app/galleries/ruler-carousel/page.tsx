"use client";

import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { ArrowLeftRight, MousePointer2, Ruler } from "lucide-react";
import { ComponentDemoShell } from "@/components/bjork-ui/component-demo-shell";
import { RulerCarousel, type CarouselItem } from "@/components/isaiahbjork/galleries/ruler-carousel";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("ruler-carousel");
const originalItems: CarouselItem[] = [
  { id: 1, title: "NIKE" },
  { id: 2, title: "ALO" },
  { id: 3, title: "CONVERSE" },
  { id: 4, title: "UNIQLO" },
  { id: 5, title: "ON CLOUD" },
  { id: 6, title: "SKIMS" },
  { id: 7, title: "ADIDAS" },
  { id: 8, title: "PUMA" },
  { id: 9, title: "REEBOK" },
];

export default function Page() {
  const isPreview = usePreviewMode();
  const demo = (
    <div className="flex h-[520px] w-full items-center justify-center overflow-hidden">
      <RulerCarousel originalItems={originalItems} />
    </div>
  );

  if (isPreview) {
    return (
      <div className="flex min-h-screen items-center justify-center overflow-hidden bg-[#0b0b0b]">
        <div className="w-[920px] scale-[0.55]">{demo}</div>
      </div>
    );
  }

  if (!item) return null;

  return (
    <ComponentDemoShell
      item={item}
      description="A tactile horizontal carousel with ruler marks, infinite item wrapping, keyboard controls, and a centered active item. It is designed for brand selectors, product families, and high-impact gallery browsing."
      dependencies={["framer-motion", "clsx"]}
      interactionRows={[
        {
          icon: <Ruler className="size-5" />,
          label: "Ruler scale",
          value: "Top and bottom tick marks give the carousel a measured physical feel.",
        },
        {
          icon: <ArrowLeftRight className="size-5" />,
          label: "Infinite travel",
          value: "The item set loops in both directions without exposing the reset point.",
        },
        {
          icon: <MousePointer2 className="size-5" />,
          label: "Keyboard and click",
          value: "Clicking an item or using arrow keys moves the active item into center focus.",
        },
      ]}
      cliCommand="npx shadcn add @bjork-ui/ruler-carousel"
      usageCode={`import { RulerCarousel } from "@/components/isaiahbjork/galleries/ruler-carousel";

export function Demo() {
  return <RulerCarousel originalItems={items} />;
}`}
    >
      {demo}
    </ComponentDemoShell>
  );
}
