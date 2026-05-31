"use client";
import { useTheme } from "next-themes";
import { HudAreaChart } from "@/components/bjork-ui/hud/graph";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { getGalleryItem } from "@/lib/bjork-gallery";

export default function Page() {
  const item = getGalleryItem("hud-graph");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
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
      description="A minimal HUD area chart for telemetry, signal, or system-health surfaces. It accepts raw time-series points plus stroke, fill, dot, and scale controls for compact display contexts."
      dependencies={["framer-motion", "next-themes", "clsx"]}
      usageCode={`import { HudAreaChart } from "@/components/bjork-ui/hud/graph";

export function Demo() {
  return <HudAreaChart data={data} showYAxis={false} scale={1.5} />;
}`}
      previewScaleClassName="w-[760px] scale-[0.92]"
    >
      <HudAreaChart
        showYAxis={false}
        data={data}
        gradientColor={isDark ? "#ffffff" : "#000000"}
        borderColor={isDark ? "#ffffff" : "#000000"}
        dotColor={isDark ? "#ffffff" : "#000000"}
        dotSize={0.8}
        dotOpacity={0.1}
        scale={1.5}
      />
    </SimpleComponentDemoPage>
  );
}
