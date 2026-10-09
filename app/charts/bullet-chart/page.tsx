"use client";

import { useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BulletChart, type BulletRow, type BulletScale } from "@/components/bjork-ui/charts/bullet-chart";
import { formatCompact, formatNumber, formatPercent } from "@/components/bjork-ui/charts/_kit/scale";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { ControlRow, DemoColumn, OptionGroup } from "../_demo/controls";

const item = getGalleryItem("bullet-chart");

// The sign goes before the currency: −$0.2M, never $−0.2M.
const money = (v: number) => `${v < 0 ? "−" : ""}$${formatCompact(Math.abs(v), 2)}`;
const count = (v: number) => formatNumber(v, 0);
const pct = (v: number) => formatPercent(v, 0);
const pct1 = (v: number) => formatPercent(v, 1);
const ms = (v: number) => `${formatNumber(v, 0)} ms`;

type Period = "mid" | "end";

// Q3 KPIs for a B2B SaaS team. Mid-quarter is week 7 of 13: the running totals carry a projection
// to quarter end, the rates are as of today.
const KPIS: Record<Period, BulletRow[]> = {
  mid: [
    { id: "revenue", label: "Revenue", sublabel: "Bookings vs plan", value: 2_310_000, projected: 4_610_000, target: 4_800_000, ranges: [3_600_000, 4_320_000, 5_400_000], format: money },
    { id: "logos", label: "New logos", sublabel: "Closed won", value: 71, projected: 132, target: 120, ranges: [84, 108, 150], format: count },
    { id: "nrr", label: "Net revenue retention", sublabel: "Trailing 12 months", value: 1.03, target: 1.1, ranges: [1, 1.06, 1.2], format: pct },
    { id: "margin", label: "Gross margin", sublabel: "Subscription", value: 0.752, target: 0.78, ranges: [0.68, 0.74, 0.9], format: pct1 },
    { id: "latency", label: "p95 API latency", sublabel: "Lower is better", value: 268, target: 250, ranges: [250, 350, 500], better: "lower", format: ms },
    { id: "churn", label: "Logo churn", sublabel: "Monthly, lower is better", value: 0.018, target: 0.02, ranges: [0.02, 0.03, 0.045], better: "lower", format: pct1 },
  ],
  end: [
    { id: "revenue", label: "Revenue", sublabel: "Bookings vs plan", value: 4_660_000, target: 4_800_000, ranges: [3_600_000, 4_320_000, 5_400_000], format: money },
    { id: "logos", label: "New logos", sublabel: "Closed won", value: 138, target: 120, ranges: [84, 108, 150], format: count },
    { id: "nrr", label: "Net revenue retention", sublabel: "Trailing 12 months", value: 1.07, target: 1.1, ranges: [1, 1.06, 1.2], format: pct },
    { id: "margin", label: "Gross margin", sublabel: "Subscription", value: 0.783, target: 0.78, ranges: [0.68, 0.74, 0.9], format: pct1 },
    { id: "latency", label: "p95 API latency", sublabel: "Lower is better", value: 214, target: 250, ranges: [250, 350, 500], better: "lower", format: ms },
    { id: "churn", label: "Logo churn", sublabel: "Monthly, lower is better", value: 0.024, target: 0.02, ranges: [0.02, 0.03, 0.045], better: "lower", format: pct1 },
  ],
};

export default function Page() {
  const isPreview = usePreviewMode();
  const [period, setPeriod] = useState<Period>("mid");
  const [scale, setScale] = useState<BulletScale>("row");

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Quarter KPIs against their targets, one compact row each. The accent bar is the actual value from zero, the dark tick is the target, and the grey bands behind it mark poor, fair and good, with the strongest grey for poor. Mid-quarter totals carry a hatched projection to quarter end, and their status follows the projection. Latency and churn are lower-is-better, so their bands and status flip. The right column gives the value, the attainment, and a status shape that doesn't rely on colour."
      dependencies={["framer-motion"]}
      usageCode={`import { BulletChart } from "@/components/bjork-ui/charts/bullet-chart";

<BulletChart
  ariaLabel="Q3 KPIs"
  rows={[
    {
      id: "revenue",
      label: "Revenue",
      sublabel: "Bookings vs plan",
      value: 2310000,
      projected: 4610000,
      target: 4800000,
      ranges: [3600000, 4320000, 5400000],
    },
    {
      id: "latency",
      label: "p95 API latency",
      value: 268,
      target: 250,
      ranges: [250, 350, 500],
      better: "lower",
      format: (v) => \`\${v} ms\`,
    },
  ]}
/>`}
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[720px] scale-[1.12]"
    >
      {isPreview ? (
        <div className="w-[700px]">
          <BulletChart rows={KPIS.mid} activeId="latency" ariaLabel="Q3 KPIs, week 7 of 13" />
        </div>
      ) : (
        <DemoColumn width={760}>
          <BulletChart rows={KPIS[period]} scale={scale} ariaLabel={period === "mid" ? "Q3 KPIs, week 7 of 13" : "Q3 KPIs, quarter end"} />
          <ControlRow>
            <OptionGroup
              label="Period"
              value={period}
              onChange={setPeriod}
              options={[
                { label: "Mid-quarter", value: "mid" },
                { label: "Quarter end", value: "end" },
              ]}
            />
            <OptionGroup
              label="Scale"
              value={scale}
              onChange={setScale}
              options={[
                { label: "Per row", value: "row" },
                { label: "% of target", value: "target" },
              ]}
            />
          </ControlRow>
        </DemoColumn>
      )}
    </SimpleComponentDemoPage>
  );
}
