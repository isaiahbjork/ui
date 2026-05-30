"use client";

import { useRef } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { Maximize2, ScrollText, Video } from "lucide-react";
import { ComponentDemoShell } from "@/components/bjork-ui/component-demo-shell";
import { VideoScrollHero } from "@/components/isaiahbjork/heroes/video-scroll-hero";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("video-scroll-hero");

export default function VideoScrollHeroPage() {
  const isPreview = usePreviewMode();
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const demo = (
    <div ref={scrollRootRef} className="hide-scrollbar h-[620px] w-full overflow-y-auto rounded-[18px] bg-[#070707]">
      <VideoScrollHero startScale={0.44} scrollRootRef={scrollRootRef} />
    </div>
  );

  if (isPreview) {
    return (
      <div className="flex min-h-screen items-center justify-center overflow-hidden bg-[#070707]">
        <div className="h-[720px] w-[960px] scale-[0.45] overflow-hidden">{demo}</div>
      </div>
    );
  }

  if (!item) return null;

  return (
    <ComponentDemoShell
      item={item}
      description="A scroll-reactive video hero that scales a media surface from a small cinematic frame into a full hero moment. The component listens to scroll progress and applies GPU-friendly transforms."
      dependencies={["framer-motion", "clsx"]}
      interactionRows={[
        {
          icon: <Video className="size-5" />,
          label: "Media-first hero",
          value: "A looping video surface carries the hero instead of a static illustration.",
        },
        {
          icon: <ScrollText className="size-5" />,
          label: "Scroll progress",
          value: "Scale is calculated from the component position inside the viewport.",
        },
        {
          icon: <Maximize2 className="size-5" />,
          label: "Transform scaling",
          value: "The expansion uses transform scale rather than layout-changing dimensions.",
        },
      ]}
      cliCommand="npx shadcn add @bjork-ui/video-scroll-hero"
      usageCode={`import { VideoScrollHero } from "@/components/isaiahbjork/heroes/video-scroll-hero";

export function Demo() {
  return <VideoScrollHero startScale={0.25} />;
}`}
    >
      {demo}
    </ComponentDemoShell>
  );
}
