"use client";

import { useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { DumbbellChart, type DumbbellRow, type DumbbellSort } from "@/components/bjork-ui/charts/dumbbell-chart";
import { formatCompact, formatSigned } from "@/components/bjork-ui/charts/_kit/scale";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { ControlRow, DemoColumn, OptionGroup } from "../_demo/controls";

const item = getGalleryItem("dumbbell-chart");

// Illustrative median base salary by role. Not real compensation data.
const ROWS: DumbbellRow[] = [
  { id: "ml", label: "ML engineer", a: 148000, b: 196000 },
  { id: "sre", label: "Site reliability", a: 136000, b: 162000 },
  { id: "fe", label: "Frontend", a: 118000, b: 131000 },
  { id: "be", label: "Backend", a: 128000, b: 149000 },
  { id: "design", label: "Product design", a: 112000, b: 128000 },
  { id: "pm", label: "Product manager", a: 134000, b: 151000 },
  { id: "data", label: "Data analyst", a: 92000, b: 99000 },
  { id: "qa", label: "QA engineer", a: 96000, b: 94000 },
  { id: "sec", label: "Security", a: 138000, b: 171000 },
];
const money = (v: number) => `$${formatCompact(v, 0)}`;
const gap = (g: number) => formatSigned(g, (n) => `$${formatCompact(n, 0)}`);

export default function Page() {
  const isPreview = usePreviewMode();
  const [sort, setSort] = useState<DumbbellSort>("gap");

  return (
    <SimpleComponentDemoPage
      item={item}
      description="The gap between two values for every row: a hollow ring for where it started and an accent dot for where it ended. Re-sort by gap, start, end or name and each row glides to its new rank instead of jumping. S cycles the sort from the keyboard."
      dependencies={["framer-motion"]}
      usageCode={`import { DumbbellChart } from "@/components/bjork-ui/charts/dumbbell-chart";

<DumbbellChart
  labels={["2020", "2025"]}
  rows={[
    { id: "ml", label: "ML engineer", a: 148000, b: 196000 },
    { id: "qa", label: "QA engineer", a: 96000, b: 94000 },
  ]}
  defaultSort="gap"
/>`}
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[700px] scale-[1.12]"
    >
      {isPreview ? (
        <div className="w-[660px]">
          <DumbbellChart rows={ROWS} labels={["2020", "2025"]} formatValue={money} formatGap={gap} rowHeight={36} activeId="sec" ariaLabel="Median salary by role" />
        </div>
      ) : (
        <DemoColumn width={720}>
          <DumbbellChart rows={ROWS} labels={["2020", "2025"]} sort={sort} onSortChange={setSort} formatValue={money} formatGap={gap} rowHeight={34} ariaLabel="Median salary by role" />
          <ControlRow>
            <OptionGroup
              label="Sort"
              value={sort}
              onChange={setSort}
              options={[
                { label: "Gap", value: "gap" },
                { label: "2025", value: "b" },
                { label: "2020", value: "a" },
                { label: "Name", value: "label" },
              ]}
            />
          </ControlRow>
        </DemoColumn>
      )}
    </SimpleComponentDemoPage>
  );
}
