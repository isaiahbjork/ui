"use client";

import { useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { BjorkInput } from "@/components/bjork-ui/primitives/input";
import {
  ShellActions,
  ShellSwitch,
  SimpleComponentDemoPage,
} from "@/components/bjork-ui/component-demo-shell";
import { SolarSkyPanel } from "@/components/bjork-ui/cards/solar-sky-panel";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("solar-sky-panel");

const PLACES = [
  { label: "Reykjavík", latitude: 64.1466, longitude: -21.9426, timeZone: "Atlantic/Reykjavik" },
  { label: "Austin", latitude: 30.2672, longitude: -97.7431, timeZone: "America/Chicago" },
  { label: "Tokyo", latitude: 35.6762, longitude: 139.6503, timeZone: "Asia/Tokyo" },
];

// Preview pose: 19:30 local in each place's zone. Bright in Reykjavík, dusk in Austin, night in Tokyo.
const PREVIEW_LOCAL = "2026-06-21T19:30";

// Converts a wall-clock time in an IANA zone to an absolute instant.
function zonedInstant(local: string, zone: string): Date {
  const [day, time] = local.split("T");
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });
  const p: Record<string, number> = {};
  for (const part of formatter.formatToParts(asUtc)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute) - asUtc;
  return new Date(asUtc - offset);
}

export default function Page() {
  const isPreview = usePreviewMode();
  const [day, setDay] = useState("");
  const [returnToNow, setReturnToNow] = useState(true);

  const panelDate = (zone: string) => {
    if (isPreview) return zonedInstant(PREVIEW_LOCAL, zone);
    // A chosen day opens at noon in each place's zone. Empty means live: the clock, refreshed every minute.
    return day ? zonedInstant(`${day}T12:00`, zone) : undefined;
  };

  const reset = () => {
    setDay("");
    setReturnToNow(true);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A sky card lit by the real sun for any place and time. Scrub the day with your finger."
      dependencies={["framer-motion"]}
      usageCode={`import { SolarSkyPanel } from "@/components/bjork-ui/cards/solar-sky-panel";

export function Demo() {
  return (
    <SolarSkyPanel
      latitude={64.1466}
      longitude={-21.9426}
      locationLabel="Reykjavík"
      timeZone="Atlantic/Reykjavik"
      returnToNow
      onTimeChange={(date) => console.log(date)}
    />
  );
}`}
      // The shell scales the demo to fit a 340px base on phones. The capture frame gives three panels about 80% of the 900px clip.
      previewScaleClassName="w-[340px]"
      previewCaptureScaleClassName="w-[1000px] scale-[0.8]"
      optionsDefaultOpen={false}
      onReset={reset}
      controls={
        <>
          <ShellActions label="Day">
            <BjorkInput
              type="date"
              aria-label="Day"
              value={day}
              onChange={(event) => setDay(event.target.value)}
              className="w-auto"
            />
            <BjorkButton size="sm" variant="secondary" onClick={() => setDay("")}>
              Now
            </BjorkButton>
          </ShellActions>
          <ShellSwitch label="Return to now" checked={returnToNow} onCheckedChange={setReturnToNow} />
        </>
      }
    >
      <div className="flex w-full min-w-0 flex-col items-center gap-5">
        <div className="flex w-full max-w-[920px] flex-wrap justify-center gap-4">
          {PLACES.map((place) => (
            <SolarSkyPanel
              key={place.timeZone}
              latitude={place.latitude}
              longitude={place.longitude}
              locationLabel={place.label}
              timeZone={place.timeZone}
              date={panelDate(place.timeZone)}
              returnToNow={returnToNow}
              className="w-full sm:w-[280px]"
            />
          ))}
        </div>
      </div>
    </SimpleComponentDemoPage>
  );
}
