"use client";

import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { Timer } from "@/components/isaiahbjork/misc/timer";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("timer");

export default function Page() {
  return (
    <SimpleComponentDemoPage item={item} description="A circular timer component with ticks, gradient progress, and primary/secondary controls." previewScaleClassName="w-[520px] scale-[0.9]">
      <Timer
        initialTime={1}
        duration={10} // 10 seconds duration
        strokeWidth={24} // thick progress line
        tickLength={12} // smaller tick marks
        tickColor="rgba(0,0,0,0.2)"
        textColor="rgb(31, 41, 55)" // gray-800
        titleColor="rgb(107, 114, 128)" // gray-500
        gradientFrom="#FFD700" // gold
        gradientVia="#FFC107" // amber  
        gradientTo="#FF8F00" // orange
        primaryButtonColor="rgb(31, 41, 55)" // gray-800
        primaryButtonHover="rgb(55, 65, 81)" // gray-700
        secondaryButtonColor="rgb(243, 244, 246)" // gray-100
        secondaryButtonHover="rgb(229, 231, 235)" // gray-200
        title="Work Time"
        className="w-full max-w-md mx-auto bg-white/80 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-gray-200"
      />
    </SimpleComponentDemoPage>
  );
}
