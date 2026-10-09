"use client";

import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { StreakCard } from "@/components/bjork-ui/cards/streak-card";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("streak-card");

export default function Page() {
  const isPreview = usePreviewMode();
  return (
    <SimpleComponentDemoPage
      item={item}
      description="A habit streak: the current run, this week at a glance, a heatmap you can walk with the arrow keys, the next milestone and a check-in that celebrates once."
      dependencies={["framer-motion", "lucide-react", "next-themes"]}
      interactionRows={[
        { label: "Heatmap", value: "role=grid with a roving cell; arrows, Home and End; readout below" },
        { label: "Freezes", value: "Frozen days keep the streak alive without adding to it" },
        { label: "Check in", value: "Counter rolls and a burst plays once; static under reduced motion" },
      ]}
      usageCode={`import { StreakCard } from "@/components/bjork-ui/cards/streak-card";

<StreakCard
  title="Writing streak"
  unit="session"
  today="2026-10-08" // the user's local date
  days={[{ date: "2026-10-07", count: 2 }, /* … */]}
  frozen={["2026-09-29"]}
  freezesLeft={2}
  best={41}
  milestones={[7, 30, 100, 365]}
  onCheckIn={(date) => api.logSession(date)}
/>`}
      previewScaleClassName="w-[400px] scale-[0.9]"
    >
      <StreakCard key={isPreview ? "preview" : "live"} />
    </SimpleComponentDemoPage>
  );
}
