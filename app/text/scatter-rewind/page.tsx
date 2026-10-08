"use client";

import { useState } from "react";
import { Hand, Keyboard, MousePointer2 } from "lucide-react";
import { ComponentDemoShell, ShellRange, ShellSegmented } from "@/components/bjork-ui/component-demo-shell";
import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import {
  ScatterRewind,
  type ScatterRewindPhase,
  type ScatterRewindTrigger,
} from "@/components/bjork-ui/text/scatter-rewind";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("scatter-rewind");

const HEADLINE =
  "font-bjork-display text-[44px] font-semibold leading-[1.02] tracking-[-0.03em] md:text-[96px]";
const SUBLINE = "font-bjork-display text-[28px] font-medium leading-[1.2] tracking-[-0.01em]";

const usageSnippet = `import { ScatterRewind } from "@/components/bjork-ui/text/scatter-rewind";

<ScatterRewind
  text="Built to be undone"
  trigger="hover"
  windAngle={-15}
  className="font-bjork-display text-[96px] font-semibold tracking-[-0.03em]"
/>

// Drive it yourself, for example from scroll
<ScatterRewind text="Built to be undone" trigger="manual" progress={scrollProgress} />`;

export default function ScatterRewindPage() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const attractParam = usePreviewSearchParam("attract") === "1";
  const [trigger, setTrigger] = useState<ScatterRewindTrigger>("inView");
  const [progress, setProgress] = useState(0.5);
  const [wind, setWind] = useState(-15);
  const [phase, setPhase] = useState<ScatterRewindPhase>("intact");

  if (isPreview) {
    const light = previewTheme === "light";
    return (
      <div
        className={`flex min-h-screen items-center justify-center overflow-hidden ${light ? "light bg-[#f7f5ef]" : "dark bg-[#111]"}`}
      >
        <div className="w-[920px] scale-[1]">
          <ScatterRewind
            text="Built to be undone"
            trigger="manual"
            progress={0.42}
            windAngle={-15}
            className={HEADLINE}
          />
        </div>
      </div>
    );
  }

  if (!item) return null;

  const demo = (
    <div className="flex w-[min(920px,calc(100vw-56px))] min-w-0 flex-col items-start gap-6 py-10">
      <ScatterRewind
        text="Built to be undone"
        trigger={trigger}
        progress={progress}
        windAngle={wind}
        attract={attractParam}
        onPhaseChange={setPhase}
        className={HEADLINE}
      />
      <ScatterRewind
        as="p"
        text="Hover to scatter"
        trigger="hover"
        windAngle={wind}
        className={SUBLINE}
      />
      <p className="font-mono text-[12px] leading-5 text-[color:var(--bjork-text-muted)] tabular-nums">
        Phase: {phase}
      </p>
    </div>
  );

  return (
    <ComponentDemoShell
      item={item}
      description="A headline that blows away as type dust and rebuilds by running time backwards, along the same paths."
      dependencies={["framer-motion", "clsx"]}
      interactionRows={[
        {
          icon: <MousePointer2 className="size-5" />,
          label: "Pointer",
          value: "With the hover trigger, entering scatters the line and leaving rewinds it from wherever it is.",
        },
        {
          icon: <Keyboard className="size-5" />,
          label: "Keyboard",
          value: "With the click trigger, Enter or Space toggles between scattered and intact.",
        },
        {
          icon: <Hand className="size-5" />,
          label: "Reduced motion",
          value: "No particles. The heading fades to 15 percent opacity and back.",
        },
      ]}
      cliCommand="npx shadcn add @bjork-ui/scatter-rewind"
      usageCode={usageSnippet}
      controls={
        <>
          {/* Three triggers fit the options row; dragging Progress switches to manual (scrub) mode. */}
          <ShellSegmented
            label="Trigger"
            value={trigger}
            options={[
              { value: "inView", label: "View" },
              { value: "hover", label: "Hover" },
              { value: "click", label: "Click" },
            ]}
            onChange={(v) => setTrigger(v as ScatterRewindTrigger)}
          />
          <ShellRange
            label="Scrub"
            value={progress}
            min={0}
            max={1}
            step={0.01}
            displayValue={`${Math.round(progress * 100)}%`}
            onChange={(v) => {
              setProgress(v);
              setTrigger("manual");
            }}
          />
          <ShellSegmented
            label="Wind"
            value={String(wind)}
            options={[
              { value: "-45", label: "-45" },
              { value: "-15", label: "-15" },
              { value: "0", label: "0" },
              { value: "30", label: "30" },
            ]}
            onChange={(v) => setWind(Number(v))}
          />
        </>
      }
    >
      {demo}
    </ComponentDemoShell>
  );
}
