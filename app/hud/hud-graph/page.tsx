"use client";
import { HudAreaChart } from "@/components/bjork-ui/hud/graph";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { getGalleryItem } from "@/lib/bjork-gallery";

export default function Page() {
  const item = getGalleryItem("hud-graph");
  // Sample data for the graph
  const data = [
    { time: "00:00", value: 10 },
    { time: "04:00", value: 35 },
    { time: "08:00", value: 65 },
    { time: "12:00", value: 4 },
    { time: "16:00", value: 45 },
    { time: "20:00", value: 30 },
    { time: "24:00", value: 30 },
  ];
  return (
    <SimpleComponentDemoPage
      item={item}
      description="A compact area chart for telemetry and system-health readouts. An ember line sits on a soft fade, hairline gridlines and mono axis labels, and the newest value stays pinned in the header until you hover a point."
      dependencies={["framer-motion", "next-themes", "clsx"]}
      usageCode={`import { HudAreaChart } from "@/components/bjork-ui/hud/graph";

export function Demo() {
  return <HudAreaChart data={data} showYAxis={false} scale={1.5} />;
}`}
      previewScaleClassName="w-[760px] scale-[0.92]"
    >
      <HudAreaChart showYAxis data={data} scale={1.5} />
    </SimpleComponentDemoPage>
  );
}
