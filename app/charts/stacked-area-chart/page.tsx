"use client";

import { useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage, ShellSegmented } from "@/components/bjork-ui/component-demo-shell";
import { StackedAreaChart, type AreaSeries, type StackedAreaMode } from "@/components/bjork-ui/charts/stacked-area-chart";
import { mulberry32 } from "@/components/bjork-ui/_core/random";
import { gaussian } from "@/components/bjork-ui/charts/_kit/scale";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { DemoColumn } from "../_demo/controls";

const item = getGalleryItem("stacked-area-chart");

const DAY = 86400000;
const START = Date.UTC(2025, 0, 1);
const DAYS = 365;
const TIMES = Array.from({ length: DAYS }, (_, j) => START + j * DAY);
// The v2 launch on May 14: a spike that settles into a lasting step.
const LAUNCH = 133;
const END = TIMES[DAYS - 1];

// Seeded daily active users by plan: growth, a gentle weekend dip (deeper on paid plans), an August
// lull, the holiday trough, and the launch.
function createActiveUsers(seed: number): AreaSeries[] {
  const rnd = mulberry32(seed);
  const plans = [
    { id: "free", label: "Free", base: 9800, growth: 0.3, weekend: 0.97, launch: 0.14 },
    { id: "starter", label: "Starter", base: 6200, growth: 0.45, weekend: 0.95, launch: 0.1 },
    { id: "pro", label: "Pro", base: 5100, growth: 0.7, weekend: 0.93, launch: 0.24 },
    { id: "team", label: "Team", base: 2900, growth: 1.1, weekend: 0.91, launch: 0.42 },
    { id: "enterprise", label: "Enterprise", base: 1700, growth: 0.55, weekend: 0.89, launch: 0.06 },
  ];
  return plans.map((pl) => {
    let noise = 0;
    return {
      id: pl.id,
      label: pl.label,
      values: TIMES.map((t, j) => {
        const dow = new Date(t).getUTCDay();
        const weekday = dow === 0 || dow === 6 ? pl.weekend : 1;
        const trend = 1 + pl.growth * (j / DAYS);
        const season = 1 - 0.09 * Math.exp(-((j - 222) ** 2) / (2 * 20 * 20)) - 0.18 * Math.exp(-((j - 358) ** 2) / (2 * 5 * 5));
        const launch = j >= LAUNCH ? pl.launch * (0.4 + 0.6 * Math.exp(-(j - LAUNCH) / 8)) : 0;
        noise = noise * 0.7 + gaussian(rnd) * 0.008;
        return Math.round(pl.base * trend * season * weekday * (1 + launch) * (1 + noise));
      }),
    };
  });
}

const SERIES = createActiveUsers(14);

type Preset = "year" | "quarter" | "launch";
const PRESETS: Record<Preset, [number, number]> = {
  year: [START, END],
  quarter: [END - 89 * DAY, END],
  launch: [TIMES[LAUNCH] - 21 * DAY, TIMES[LAUNCH] + 42 * DAY],
};

export default function Page() {
  const isPreview = usePreviewMode();
  const [mode, setMode] = useState<StackedAreaMode>("stacked");
  const [range, setRange] = useState<[number, number]>(PRESETS.year);
  const preset = (Object.keys(PRESETS) as Preset[]).find((k) => PRESETS[k][0] === range[0] && PRESETS[k][1] === range[1]) ?? null;

  const reset = () => {
    setMode("stacked");
    setRange(PRESETS.year);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A total split into its parts over time. Each band sits on the one below with a thin seam between them, and the crosshair reads every part and the total for one day. Switch to 100% to compare shares, or to lines to compare the parts on their own; the bands glide between layouts. Legend items hide and show a series, and the strip underneath picks the window the plot shows: drag it, resize it from either edge, or double-click to see the whole year again."
      dependencies={["framer-motion"]}
      usageCode={`import { StackedAreaChart } from "@/components/bjork-ui/charts/stacked-area-chart";

const day = 86400000;
const times = [0, 1, 2, 3].map((i) => Date.UTC(2025, 0, 1) + i * day);

<StackedAreaChart
  times={times}
  series={[
    { id: "free", label: "Free", values: [9800, 9900, 10100, 9700] },
    { id: "pro", label: "Pro", values: [5100, 5240, 5320, 5180] },
    { id: "team", label: "Team", values: [2900, 3020, 3110, 3060] },
  ]}
  mode="stacked"
  ariaLabel="Daily active users by plan"
/>`}
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[740px] scale-[1.1]"
      optionsDefaultOpen={false}
      onReset={reset}
      controls={
        <>
          <ShellSegmented
            label="Layout"
            value={mode}
            onChange={setMode}
            options={[
              { label: "Stacked", value: "stacked" },
              { label: "100%", value: "percent" },
              { label: "Lines", value: "lines" },
            ]}
          />
          <ShellSegmented
            label="Window"
            value={preset ?? ("custom" as Preset)}
            onChange={(k) => setRange(PRESETS[k])}
            options={[
              { label: "Year", value: "year" },
              { label: "90 days", value: "quarter" },
              { label: "Launch", value: "launch" },
            ]}
          />
        </>
      }
    >
      {isPreview ? (
        <div className="w-[700px]">
          <StackedAreaChart
            times={TIMES}
            series={SERIES}
            defaultRange={[Date.UTC(2025, 3, 1), Date.UTC(2025, 8, 30)]}
            activeTime={Date.UTC(2025, 4, 16)}
            height={400}
            ariaLabel="Daily active users by plan"
          />
        </div>
      ) : (
        <DemoColumn width={860}>
          <StackedAreaChart times={TIMES} series={SERIES} mode={mode} range={range} onRangeChange={setRange} height={420} ariaLabel="Daily active users by plan" />
        </DemoColumn>
      )}
    </SimpleComponentDemoPage>
  );
}
