"use client";

import { useSyncExternalStore } from "react";
import {
  usePreviewMode,
  usePreviewSearchParam,
} from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import {
  Timetable,
  type TimetableEvent,
} from "@/components/bjork-ui/tables/timetable";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("timetable");

// Wednesday 11:20, so the "now" line lands mid-morning on the conference's third day.
const DEMO_NOW = new Date(2026, 9, 14, 11, 20);

const narrowQuery = "(max-width: 639px)";

function subscribeNarrow(onChange: () => void) {
  const query = window.matchMedia(narrowQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// On phones the shell would shrink the desktop layout; render at true width so the compact layout shows.
function useNarrowViewport() {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(narrowQuery).matches,
    () => false,
  );
}

export default function TimetableDemo() {
  const isPreview = usePreviewMode();
  const narrow = useNarrowViewport() && !isPreview;
  const previewTheme = usePreviewSearchParam("theme");
  const tableTheme =
    previewTheme === "light" || previewTheme === "dark" ? previewTheme : "auto";

  const handleEventSelect = (event: TimetableEvent) => {
    console.log("Selected session:", event.id);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A weekly timetable for agendas, class schedules and room bookings. Overlapping sessions share the slot side by side, a now line tracks the current day, and track chips filter the week. Under 560px it folds into a day picker with a single-day agenda."
      usageCode={`import { Timetable, type TimetableEvent } from "@/components/bjork-ui/tables/timetable";

const events: TimetableEvent[] = [
  { id: "k1", title: "Opening keynote", day: "mon", start: "09:30", end: "10:30", location: "Hall A", track: "Plenary" },
  { id: "w1", title: "Workshop: Layout motion", day: "wed", start: "10:30", end: "12:30", location: "Studio 3", track: "Craft" },
];

<Timetable
  events={events}
  startHour={9}
  endHour={18}
  slotMinutes={30}
  now={new Date()}
  onEventSelect={(event) => openSession(event.id)}
/>`}
      previewScaleClassName={
        narrow ? "w-[340px] scale-100" : "w-[1120px] scale-[0.62]"
      }
      previewCaptureScaleClassName="w-[1120px] scale-[0.79]"
      previewInnerClassName="bg-[#f7f5ef] dark:bg-[#111]"
    >
      <div className={narrow ? "w-[calc(100vw-72px)]" : "w-full"}>
        <Timetable
          now={DEMO_NOW}
          defaultSelectedId={isPreview ? "w3" : null}
          onEventSelect={handleEventSelect}
          theme={tableTheme}
          enableAnimations={!isPreview}
        />
      </div>
    </SimpleComponentDemoPage>
  );
}
