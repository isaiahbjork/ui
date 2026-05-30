"use client";

import { CoachSchedulingCard } from "@/components/isaiahbjork/cards/coach-scheduling-card";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { getGalleryItem } from "@/lib/bjork-gallery";

export default function CoachSchedulingDemo() {
  const item = getGalleryItem("coach-scheduling");

  const handleTimeSlotSelect = (day: string, time: string) => {
    console.log(`Selected: ${day} at ${time}`);
  };

  const handleLocationChange = (location: string) => {
    console.log(`Location changed to: ${location}`);
  };

  const handleWeekChange = (direction: "prev" | "next") => {
    console.log(`Week navigation: ${direction}`);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A booking card for coaching, consultation, or service scheduling flows. Location, week navigation, and time-slot selection are all callback driven so the card can plug into real availability data."
      dependencies={["framer-motion", "lucide-react", "clsx"]}
      usageCode={`import { CoachSchedulingCard } from "@/components/isaiahbjork/cards/coach-scheduling-card";

export function Demo() {
  return (
    <CoachSchedulingCard
      onTimeSlotSelect={(day, time) => console.log(day, time)}
      onLocationChange={(location) => console.log(location)}
      onWeekChange={(direction) => console.log(direction)}
    />
  );
}`}
      previewScaleClassName="w-[760px] scale-[0.82]"
    >
      <CoachSchedulingCard
        onTimeSlotSelect={handleTimeSlotSelect}
        onLocationChange={handleLocationChange}
        onWeekChange={handleWeekChange}
      />
    </SimpleComponentDemoPage>
  );
}
