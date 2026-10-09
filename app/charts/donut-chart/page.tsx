"use client";

import { useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { DonutChart, type DonutSlice } from "@/components/bjork-ui/charts/donut-chart";
import { formatCompact } from "@/components/bjork-ui/charts/_kit/scale";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { ControlRow, DemoColumn, OptionGroup, ToggleButton } from "../_demo/controls";

const item = getGalleryItem("donut-chart");
const money = (v: number) => `$${formatCompact(v, 1)}`;
const count = (v: number) => formatCompact(v, 1);

// Monthly recurring revenue by plan, this month against last.
const REVENUE: DonutSlice[] = [
  { id: "starter", label: "Starter", value: 18420, previous: 17960 },
  { id: "team", label: "Team", value: 42610, previous: 38240 },
  { id: "business", label: "Business", value: 61280, previous: 57930 },
  { id: "enterprise", label: "Enterprise", value: 88940, previous: 86100 },
  { id: "addons", label: "Add-ons", value: 9730, previous: 7480 },
];

// Sessions by source over 30 days. Nine sources, so the smallest four fold into Other.
const TRAFFIC: DonutSlice[] = [
  { id: "organic", label: "Organic search", value: 48210, previous: 45380 },
  { id: "direct", label: "Direct", value: 31480, previous: 32020 },
  { id: "paid", label: "Paid search", value: 18960, previous: 14270 },
  { id: "referral", label: "Referral", value: 12340, previous: 11890 },
  { id: "email", label: "Email", value: 9870, previous: 10450 },
  { id: "social", label: "Social", value: 7650, previous: 6120 },
  { id: "partners", label: "Partners", value: 4210, previous: 3980 },
  { id: "display", label: "Display", value: 2980, previous: 3410 },
  { id: "affiliates", label: "Affiliates", value: 1640, previous: 1190 },
];

const strip = (rows: DonutSlice[]): DonutSlice[] => rows.map((r) => ({ id: r.id, label: r.label, value: r.value }));
const REVENUE_NOW = strip(REVENUE);
const TRAFFIC_NOW = strip(TRAFFIC);

export default function Page() {
  const isPreview = usePreviewMode();
  const [dataset, setDataset] = useState<"revenue" | "traffic">("revenue");
  const [sort, setSort] = useState<"value" | "data">("value");
  const [compare, setCompare] = useState(true);
  const revenue = dataset === "revenue";
  const data = revenue ? (compare ? REVENUE : REVENUE_NOW) : compare ? TRAFFIC : TRAFFIC_NOW;

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Part-to-whole for a handful of parts. Slices run clockwise from 12 o'clock, largest first, with 2px gaps that keep their width from the hole to the rim. Past six parts the smallest fold into a grey Other slice, and colour stays with each part's place in the data, so re-sorting never repaints it. The legend beside the ring is a small table of value, share and change against last period, and the centre shows the total until a slice or row is hovered or focused."
      dependencies={["framer-motion"]}
      usageCode={`import { DonutChart } from "@/components/bjork-ui/charts/donut-chart";

<DonutChart
  data={[
    { id: "starter", label: "Starter", value: 18420, previous: 17960 },
    { id: "team", label: "Team", value: 42610, previous: 38240 },
    { id: "business", label: "Business", value: 61280, previous: 57930 },
    { id: "enterprise", label: "Enterprise", value: 88940, previous: 86100 },
  ]}
  legendTitle="Plan"
  previousLabel="vs Sep"
  centerLabel="MRR"
  formatValue={(v) => \`$\${(v / 1000).toFixed(1)}K\`}
  ariaLabel="Revenue by plan"
/>`}
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[720px] scale-[1.12]"
    >
      {isPreview ? (
        <div className="w-[700px]">
          <DonutChart data={REVENUE} legendTitle="Plan" previousLabel="vs Sep" centerLabel="MRR" formatValue={money} activeId="business" height={280} ariaLabel="Revenue by plan" />
        </div>
      ) : (
        <DemoColumn width={760}>
          <DonutChart
            data={data}
            sort={sort}
            legendTitle={revenue ? "Plan" : "Source"}
            previousLabel={revenue ? "vs Sep" : "vs prior"}
            centerLabel={revenue ? "MRR" : "Sessions"}
            formatValue={revenue ? money : count}
            height={260}
            ariaLabel={revenue ? "Revenue by plan" : "Sessions by source, last 30 days"}
          />
          <ControlRow>
            <OptionGroup
              label="Dataset"
              value={dataset}
              onChange={setDataset}
              options={[
                { label: "Revenue by plan", value: "revenue" },
                { label: "Traffic by source", value: "traffic" },
              ]}
            />
            <OptionGroup
              label="Order"
              value={sort}
              onChange={setSort}
              options={[
                { label: "Largest first", value: "value" },
                { label: "Data order", value: "data" },
              ]}
            />
            <ToggleButton pressed={compare} onClick={() => setCompare((v) => !v)}>
              Comparison
            </ToggleButton>
          </ControlRow>
        </DemoColumn>
      )}
    </SimpleComponentDemoPage>
  );
}
