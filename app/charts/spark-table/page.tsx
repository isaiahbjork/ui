"use client";

import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { SparkTable, createMetricSeries, type SparkRow } from "@/components/bjork-ui/charts/spark-table";
import { formatCompact } from "@/components/bjork-ui/charts/_kit/scale";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { DemoColumn } from "../_demo/controls";

const item = getGalleryItem("spark-table");
const DAYS = 90;
const money = (v: number) => `$${formatCompact(v, 1)}`;

const ROWS: SparkRow[] = [
  { id: "mrr", label: "MRR", sublabel: "recurring", data: createMetricSeries(1, DAYS, { base: 182000, trend: 0.22, weekly: 0.004, noise: 0.006 }), format: money },
  { id: "active", label: "Active users", sublabel: "daily", data: createMetricSeries(2, DAYS, { base: 12800, trend: 0.12, weekly: 0.09, noise: 0.025 }) },
  { id: "conv", label: "Conversion", sublabel: "trial to paid", data: createMetricSeries(3, DAYS, { base: 0.064, trend: 0.08, weekly: 0.02, noise: 0.04 }), format: (v) => `${(v * 100).toFixed(1)}%` },
  { id: "churn", label: "Churn", sublabel: "monthly", data: createMetricSeries(4, DAYS, { base: 0.031, trend: -0.18, weekly: 0.01, noise: 0.03 }), format: (v) => `${(v * 100).toFixed(2)}%`, goodDirection: "down" },
  { id: "p95", label: "p95 latency", sublabel: "API", data: createMetricSeries(5, DAYS, { base: 182, trend: 0.06, weekly: 0.05, noise: 0.05 }), format: (v) => `${Math.round(v)} ms`, goodDirection: "down" },
  { id: "nps", label: "NPS", sublabel: "rolling 30d", data: createMetricSeries(6, DAYS, { base: 41, trend: 0.1, weekly: 0.01, noise: 0.02 }), format: (v) => v.toFixed(0) },
];

export default function Page() {
  const isPreview = usePreviewMode();

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A metrics table where every row carries its own sparkline and every sparkline shares one crosshair. Scrub any row and the whole table rewinds to that day, with each value counting to it. Up and down select the row drawn in the accent."
      dependencies={["framer-motion"]}
      usageCode={`import { SparkTable } from "@/components/bjork-ui/charts/spark-table";

<SparkTable
  periodLabel="Last 90 days"
  rows={[
    { id: "mrr", label: "MRR", data: mrr, format: (v) => \`$\${(v / 1000).toFixed(1)}K\` },
    { id: "churn", label: "Churn", data: churn, goodDirection: "down" },
  ]}
/>`}
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[760px] scale-[1.1]"
    >
      {isPreview ? (
        <div className="w-[700px]">
          <SparkTable rows={ROWS} periodLabel="Last 90 days" index={63} defaultSelectedId="mrr" ariaLabel="Business metrics" />
        </div>
      ) : (
        <DemoColumn width={760}>
          <SparkTable rows={ROWS} periodLabel="Last 90 days" ariaLabel="Business metrics" />
        </DemoColumn>
      )}
    </SimpleComponentDemoPage>
  );
}
