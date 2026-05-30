"use client";

import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { Images, Layers, MousePointer2 } from "lucide-react";
import { ComponentDemoShell } from "@/components/bjork-ui/component-demo-shell";
import { PortfolioGallery } from "@/components/isaiahbjork/galleries/portfolio-gallery";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("portfolio-gallery");

export default function PortfolioGalleryDemo() {
  const isPreview = usePreviewMode();
  const demo = (
    <div className="h-[620px] w-full overflow-hidden rounded-[18px]">
      <PortfolioGallery 
        title="Creative library"
        archiveButton={{
          text: "View archives",
          href: "/work"
        }}
        onImageClick={(index) => {
          console.log(`Clicked image ${index + 1}`);
        }}
        pauseOnHover={true}
        marqueeRepeat={3}
      />
    </div>
  );

  if (isPreview) {
    return (
      <div className="flex min-h-screen items-center justify-center overflow-hidden bg-[#111111]">
        <div className="w-[900px] scale-[0.5]">{demo}</div>
      </div>
    );
  }

  if (!item) return null;

  return (
    <ComponentDemoShell
      item={item}
      description="A layered image gallery with overlapping desktop cards, hover lift, and mobile marquee fallback. It works well for portfolio archives, visual libraries, and editorial image indexes."
      dependencies={["framer-motion", "next/link", "clsx"]}
      interactionRows={[
        {
          icon: <Layers className="size-5" />,
          label: "Overlapping stack",
          value: "Images are staggered in depth with hover separation and z-index control.",
        },
        {
          icon: <Images className="size-5" />,
          label: "Responsive gallery",
          value: "Desktop uses the layered stack while mobile switches to marquee flow.",
        },
        {
          icon: <MousePointer2 className="size-5" />,
          label: "Image callbacks",
          value: "Each image click can be used to open lightboxes, archives, or project pages.",
        },
      ]}
      cliCommand="npx shadcn add @bjork-ui/portfolio-gallery"
      usageCode={`import { PortfolioGallery } from "@/components/isaiahbjork/galleries/portfolio-gallery";

export function Demo() {
  return <PortfolioGallery title="Creative library" />;
}`}
    >
      {demo}
    </ComponentDemoShell>
  );
}
