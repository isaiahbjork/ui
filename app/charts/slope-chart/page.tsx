"use client";

import { useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage, ShellSegmented } from "@/components/bjork-ui/component-demo-shell";
import { SlopeChart, type SlopeItem } from "@/components/bjork-ui/charts/slope-chart";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { DemoColumn } from "../_demo/controls";

const item = getGalleryItem("slope-chart");

// Illustrative share of new projects by language. Not real survey data.
const ITEMS: SlopeItem[] = [
  { id: "ts", label: "TypeScript", a: 18.2, b: 24.6 },
  { id: "py", label: "Python", a: 21.4, b: 23.1 },
  { id: "js", label: "JavaScript", a: 17.9, b: 12.4 },
  { id: "go", label: "Go", a: 6.1, b: 7.8 },
  { id: "rs", label: "Rust", a: 3.2, b: 6.4 },
  { id: "java", label: "Java", a: 10.8, b: 8.2 },
  { id: "cs", label: "C#", a: 7.4, b: 6.9 },
  { id: "kt", label: "Kotlin", a: 3.6, b: 3.9 },
  { id: "swift", label: "Swift", a: 3.1, b: 2.7 },
  { id: "php", label: "PHP", a: 5.2, b: 2.6 },
  { id: "rb", label: "Ruby", a: 2.4, b: 1.4 },
];

const YEARS: [string, string] = ["2023", "2025"];

export default function Page() {
  const isPreview = usePreviewMode();
  const [filter, setFilter] = useState<"all" | "up" | "down">("all");

  const reset = () => setFilter("all");

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Before and after for every item, one line each. End labels spread apart when values crowd and keep a leader line back to their point. Hovering finds the nearest line, click or Enter pins one in the accent, and the filter fades whatever did not move your way."
      dependencies={["framer-motion"]}
      usageCode={`import { SlopeChart } from "@/components/bjork-ui/charts/slope-chart";

<SlopeChart
  labels={["2023", "2025"]}
  items={[
    { id: "ts", label: "TypeScript", a: 18.2, b: 24.6 },
    { id: "js", label: "JavaScript", a: 17.9, b: 12.4 },
  ]}
  defaultHighlightId="ts"
/>`}
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[640px] scale-[1.12]"
      optionsDefaultOpen={false}
      onReset={reset}
      controls={
        <ShellSegmented
          label="Filter"
          value={filter}
          onChange={setFilter}
          options={[
            { label: "All", value: "all" },
            { label: "Rising", value: "up" },
            { label: "Falling", value: "down" },
          ]}
        />
      }
    >
      {isPreview ? (
        <div className="w-[600px]">
          <SlopeChart items={ITEMS} labels={YEARS} defaultHighlightId="rs" height={420} ariaLabel="Share of new projects by language" />
        </div>
      ) : (
        <DemoColumn width={640}>
          <SlopeChart items={ITEMS} labels={YEARS} filter={filter} defaultHighlightId="ts" height={420} ariaLabel="Share of new projects by language" />
        </DemoColumn>
      )}
    </SimpleComponentDemoPage>
  );
}
