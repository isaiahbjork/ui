"use client";

import { useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage, ShellSegmented, ShellSwitch } from "@/components/bjork-ui/component-demo-shell";
import { GroupedBarChart, type BarCategory, type BarMode, type BarOrientation, type BarSeries } from "@/components/bjork-ui/charts/grouped-bar-chart";
import { formatCompact } from "@/components/bjork-ui/charts/_kit/scale";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { DemoColumn } from "../_demo/controls";

const item = getGalleryItem("grouped-bar-chart");
// The sign goes before the currency: −$42K, never $−42K.
const money = (v: number) => `${v < 0 ? "−" : ""}$${formatCompact(Math.abs(v), 1)}`;

type DatasetKey = "revenue" | "arr";

const QUARTERS: BarCategory[] = ["Q1 ’25", "Q2 ’25", "Q3 ’25", "Q4 ’25", "Q1 ’26", "Q2 ’26"].map((label, i) => ({ id: `q${i}`, label }));
const MONTHS: BarCategory[] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"].map((label) => ({ id: label.toLowerCase(), label }));

const DATASETS: Record<DatasetKey, { label: string; ariaLabel: string; categories: BarCategory[]; series: BarSeries[]; negative: boolean }> = {
  revenue: {
    label: "Revenue by region",
    ariaLabel: "Quarterly revenue by region",
    categories: QUARTERS,
    negative: false,
    series: [
      { id: "na", label: "North America", values: [1_840_000, 1_970_000, 2_120_000, 2_410_000, 2_380_000, 2_560_000] },
      { id: "emea", label: "EMEA", values: [1_120_000, 1_180_000, 1_260_000, 1_470_000, 1_430_000, 1_580_000] },
      { id: "apac", label: "Asia Pacific", values: [620_000, 710_000, 780_000, 940_000, 1_020_000, 1_160_000] },
      { id: "latam", label: "Latin America", values: [210_000, 240_000, 260_000, 310_000, 330_000, 370_000] },
    ],
  },
  arr: {
    label: "Net-new ARR",
    ariaLabel: "Net-new ARR by month, 2026",
    categories: MONTHS,
    negative: true,
    series: [
      { id: "new", label: "New", values: [182_000, 164_000, 201_000, 226_000, 198_000, 243_000, 231_000, 268_000] },
      { id: "expansion", label: "Expansion", values: [74_000, 81_000, 69_000, 92_000, 105_000, 98_000, 117_000, 124_000] },
      { id: "contraction", label: "Contraction", values: [-38_000, -42_000, -35_000, -51_000, -47_000, -44_000, -56_000, -49_000] },
      { id: "churn", label: "Churn", values: [-96_000, -88_000, -142_000, -104_000, -171_000, -118_000, -99_000, -93_000] },
    ],
  },
};

export default function Page() {
  const isPreview = usePreviewMode();
  const [dataset, setDataset] = useState<DatasetKey>("revenue");
  const [mode, setMode] = useState<BarMode>("grouped");
  const [orientation, setOrientation] = useState<BarOrientation>("auto");
  const [showValues, setShowValues] = useState(false);
  const ds = DATASETS[dataset];

  const pickDataset = (key: DatasetKey) => {
    setDataset(key);
    // Percent mode is for non-negative data only.
    if (DATASETS[key].negative && mode === "percent") setMode("stacked");
  };

  const reset = () => {
    setDataset("revenue");
    setMode("grouped");
    setOrientation("auto");
    setShowValues(false);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Categories against up to six series, grouped side by side, stacked, or stacked to 100%. Switching modes morphs the bars in two steps so you can follow each one, negatives hang below an emphasised zero line, and the legend toggles series without ever hiding the last. On narrow screens it turns horizontal by itself so labels never collide."
      dependencies={["framer-motion"]}
      usageCode={`import { GroupedBarChart } from "@/components/bjork-ui/charts/grouped-bar-chart";

<GroupedBarChart
  categories={[
    { id: "q1", label: "Q1" },
    { id: "q2", label: "Q2" },
  ]}
  series={[
    { id: "na", label: "North America", values: [1840000, 1970000] },
    { id: "emea", label: "EMEA", values: [1120000, 1180000] },
  ]}
  mode="grouped"
  orientation="auto"
  formatValue={(v) => \`\${v < 0 ? "−" : ""}$\${(Math.abs(v) / 1e6).toFixed(1)}M\`}
/>`}
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[720px] scale-[1.12]"
      optionsDefaultOpen={false}
      onReset={reset}
      controls={
        <>
          <ShellSegmented
            label="Dataset"
            value={dataset}
            onChange={pickDataset}
            options={[
              { label: "Revenue", value: "revenue" },
              { label: "Net-new ARR", value: "arr" },
            ]}
          />
          <ShellSegmented
            label="Mode"
            value={mode}
            onChange={setMode}
            options={[
              { label: "Grouped", value: "grouped" as const },
              { label: "Stacked", value: "stacked" as const },
              ...(ds.negative ? [] : [{ label: "Percent", value: "percent" as const }]),
            ]}
          />
          <ShellSegmented
            label="Axis"
            value={orientation}
            onChange={setOrientation}
            options={[
              { label: "Auto", value: "auto" },
              { label: "Vertical", value: "vertical" },
              { label: "Horizontal", value: "horizontal" },
            ]}
          />
          <ShellSwitch label="Values" checked={showValues} onCheckedChange={setShowValues} />
        </>
      }
    >
      {isPreview ? (
        <div className="w-[680px]">
          <GroupedBarChart
            categories={DATASETS.revenue.categories}
            series={DATASETS.revenue.series}
            mode="grouped"
            orientation="vertical"
            formatValue={money}
            active={{ category: "q3", series: "emea" }}
            height={380}
            ariaLabel={DATASETS.revenue.ariaLabel}
          />
        </div>
      ) : (
        <DemoColumn width={760}>
          <GroupedBarChart
            key={dataset}
            categories={ds.categories}
            series={ds.series}
            mode={mode}
            orientation={orientation}
            showValues={showValues}
            formatValue={money}
            height={380}
            ariaLabel={ds.ariaLabel}
          />
        </DemoColumn>
      )}
    </SimpleComponentDemoPage>
  );
}
