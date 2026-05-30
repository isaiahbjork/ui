"use client";

import { useMemo, useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { Activity, Gauge, Sparkles } from "lucide-react";
import {
  ComponentDemoShell,
  ShellRange,
  ShellSegmented,
} from "@/components/bjork-ui/component-demo-shell";
import { AnimatedRadialChart } from "@/components/isaiahbjork/charts/animated-radial-chart";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("animated-radial-chart");

export default function Page() {
  const isPreview = usePreviewMode();
  const [value, setValue] = useState(74);
  const [size, setSize] = useState(330);
  const [strokeWidth, setStrokeWidth] = useState(20);
  const [labels, setLabels] = useState("show");
  const [duration, setDuration] = useState(1.6);

  const chartKey = useMemo(() => {
    return `${value}-${size}-${strokeWidth}-${labels}-${duration}`;
  }, [duration, labels, size, strokeWidth, value]);

  function resetControls() {
    setValue(74);
    setSize(330);
    setStrokeWidth(20);
    setLabels("show");
    setDuration(1.6);
  }

  const chart = (
    <AnimatedRadialChart
      key={chartKey}
      value={value}
      size={size}
      strokeWidth={strokeWidth}
      showLabels={labels === "show"}
      duration={duration}
    />
  );

  if (isPreview) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0b0b]">
        <AnimatedRadialChart value={74} size={320} strokeWidth={20} duration={1.2} />
      </div>
    );
  }

  if (!item) return null;

  return (
    <ComponentDemoShell
      item={item}
      onReset={resetControls}
      description="A production-grade radial progress display for dense dashboards, car-style HUDs, and high-signal metrics. The animation is driven by Framer Motion motion values, so changing the value, stroke, speed, or label state updates the chart directly without remounting the whole page shell."
      dependencies={["framer-motion", "clsx"]}
      interactionRows={[
        {
          icon: <Sparkles className="size-5" />,
          label: "Animated progress arc",
          value: "Motion values drive the arc, center value, and indicator line.",
        },
        {
          icon: <Gauge className="size-5" />,
          label: "Dynamic control surface",
          value: "The options panel edits live props and resets to the baseline state.",
        },
        {
          icon: <Activity className="size-5" />,
          label: "Reduced motion aware",
          value: "Animation timing contracts when the user prefers less motion.",
        },
      ]}
      cliCommand="npx shadcn add @bjork-ui/animated-radial-chart"
      usageCode={`import { AnimatedRadialChart } from "@/components/isaiahbjork/charts/animated-radial-chart";

export function Demo() {
  return (
    <AnimatedRadialChart
      value={74}
      size={330}
      strokeWidth={20}
      showLabels
      duration={1.6}
    />
  );
}`}
      note={
        <p className="max-w-[680px] text-[17px] leading-8 tracking-[-0.03em] text-[#171717]/62 dark:text-[#ededed]/68">
          This page is the first standardized component detail pass. The preview,
          source drawer, options panel, and left index are shared shell pieces so
          the rest of the component routes can move into the same system without
          rebuilding the page chrome each time.
        </p>
      }
      controls={
        <>
          <ShellRange
            label="Value"
            value={value}
            min={0}
            max={100}
            displayValue={`${value}%`}
            onChange={setValue}
          />
          <ShellRange
            label="Scale"
            value={size}
            min={220}
            max={430}
            displayValue={`${size}px`}
            onChange={setSize}
          />
          <ShellRange
            label="Stroke"
            value={strokeWidth}
            min={10}
            max={34}
            displayValue={`${strokeWidth}px`}
            onChange={setStrokeWidth}
          />
          <ShellRange
            label="Speed"
            value={duration}
            min={0.4}
            max={3}
            step={0.1}
            displayValue={`${duration.toFixed(1)}s`}
            onChange={setDuration}
          />
          <ShellSegmented
            label="Labels"
            value={labels}
            options={[
              { value: "show", label: "Show" },
              { value: "hide", label: "Hide" },
            ]}
            onChange={setLabels}
          />
          <ShellSegmented
            label="Preset"
            value={String(value)}
            options={[
              { value: "32", label: "Low" },
              { value: "74", label: "Base" },
              { value: "96", label: "Max" },
            ]}
            onChange={(nextValue) => setValue(Number(nextValue))}
          />
        </>
      }
    >
      {chart}
    </ComponentDemoShell>
  );
}
