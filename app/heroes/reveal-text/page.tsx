"use client";

import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { RevealText } from "@/components/bjork-ui/heroes/reveal-text";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("reveal-text");

export default function Page() {

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A large reveal text animation with delayed overlay motion for title treatments and motion studies."
      previewScaleClassName="w-[860px] scale-[0.7]"
    >
      <div className="flex h-full min-h-[520px] w-full items-center justify-center overflow-hidden">
        <RevealText
          text="STUNNING"
          textColor="text-[#171717] dark:text-white"
          overlayColor="text-[#ec5c13]"
          fontSize="text-[clamp(68px,8.4vw,128px)]"
          letterDelay={0.08}
          overlayDelay={0.05}
          overlayDuration={0.4}
          springDuration={600}
        />
      </div>
    </SimpleComponentDemoPage>
  );
}
