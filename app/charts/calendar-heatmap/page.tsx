"use client";

import { useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { CalendarHeatmap, type CalendarDatum } from "@/components/bjork-ui/charts/calendar-heatmap";
import { mulberry32 } from "@/components/bjork-ui/_core/random";
import { formatNumber } from "@/components/bjork-ui/charts/_kit/scale";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { ControlRow, DemoColumn, OptionGroup } from "../_demo/controls";

const item = getGalleryItem("calendar-heatmap");

const DAY = 86400000;
const END = Date.UTC(2026, 8, 30); // a fixed year, Oct 1 2025 to Sep 30 2026, so every render matches
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const inRange = (t: number, a: string, b: string) => t >= Date.parse(a) && t <= Date.parse(b);

// Poisson draw (Knuth) for small rates; deterministic given the seeded source.
function poisson(rnd: () => number, lambda: number): number {
  if (lambda <= 0) return 0;
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rnd();
  } while (p > l);
  return k - 1;
}

type DatasetId = "deploys" | "orders" | "incidents";

// Illustrative product-team activity. Weekdays carry the work, the holiday freeze goes quiet, and the
// May launch crunch runs through weekends.
function makeDataset(id: DatasetId): CalendarDatum[] {
  const rnd = mulberry32(id === "deploys" ? 11 : id === "orders" ? 23 : 37);
  const out: CalendarDatum[] = [];
  for (let k = 364; k >= 0; k--) {
    const t = END - k * DAY;
    const dow = new Date(t).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const freeze = inRange(t, "2025-12-19", "2026-01-04");
    const crunch = inRange(t, "2026-05-04", "2026-05-22");
    const growth = 1 + (364 - k) / 900;
    let v = 0;
    if (id === "deploys") {
      const rate = weekend ? 0.25 : dow === 5 ? 2.2 : [0, 5.5, 6.5, 6, 5.2][dow] ?? 5;
      v = poisson(rnd, freeze ? 0.08 : crunch ? rate * 1.8 + (weekend ? 3 : 0) : rate * growth);
      if (t === Date.parse("2025-12-29")) v = 1; // the one hotfix of the freeze
    } else if (id === "orders") {
      const base = (weekend ? 260 : 190) * growth;
      const bf = inRange(t, "2025-11-28", "2025-12-01") ? 3.2 : inRange(t, "2025-12-02", "2025-12-18") ? 1.35 : 1;
      const summer = inRange(t, "2026-07-01", "2026-08-20") ? 0.82 : 1;
      const launch = inRange(t, "2026-05-19", "2026-05-31") ? 1.6 : 1;
      v = Math.round(base * bf * summer * launch * (0.85 + rnd() * 0.3));
      if (inRange(t, "2026-03-11", "2026-03-11")) v = 0; // checkout outage
    } else {
      const rate = (weekend ? 0.12 : 0.4) * (crunch || inRange(t, "2026-05-23", "2026-06-05") ? 3 : freeze ? 0.2 : 1);
      v = poisson(rnd, rate);
    }
    out.push({ date: iso(t), value: v });
  }
  return out;
}

const DATASETS: Record<DatasetId, { data: CalendarDatum[]; unit: { one: string; other: string }; label: string }> = {
  deploys: { data: makeDataset("deploys"), unit: { one: "deploy", other: "deploys" }, label: "Production deploys per day" },
  orders: { data: makeDataset("orders"), unit: { one: "order", other: "orders" }, label: "Orders per day" },
  incidents: { data: makeDataset("incidents"), unit: { one: "incident", other: "incidents" }, label: "Incidents per day" },
};

const whole = (v: number) => formatNumber(v, 0);

export default function Page() {
  const isPreview = usePreviewMode();
  const [dataset, setDataset] = useState<DatasetId>("deploys");
  const [weekStart, setWeekStart] = useState<"monday" | "sunday">("monday");
  const [scale, setScale] = useState<"quantile" | "linear">("quantile");
  const ds = DATASETS[dataset];

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A year of daily activity, one square per day, weeks as columns. Colour steps come from quantiles of the active days, so one record day doesn't wash out the rest, and empty days stay a quiet grey. The line above counts the total, active days and streaks. Hover or arrow through the days for the date and the week's total; on a narrow screen the grid scrolls inside itself and opens on the latest week."
      dependencies={["framer-motion"]}
      usageCode={`import { CalendarHeatmap } from "@/components/bjork-ui/charts/calendar-heatmap";

<CalendarHeatmap
  data={[
    { date: "2026-09-28", value: 6 },
    { date: "2026-09-29", value: 4 },
    { date: "2026-09-30", value: 7 },
  ]}
  unit={{ one: "deploy", other: "deploys" }}
  weekStart="monday"
  onSelect={(date) => console.log(date)}
/>`}
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[720px] scale-[1.12]"
    >
      {isPreview ? (
        <div className="w-[720px]">
          <CalendarHeatmap data={DATASETS.deploys.data} unit={DATASETS.deploys.unit} formatValue={whole} activeDate="2026-05-13" maxCell={14} ariaLabel={DATASETS.deploys.label} />
        </div>
      ) : (
        <DemoColumn width={820}>
          <CalendarHeatmap data={ds.data} unit={ds.unit} formatValue={whole} weekStart={weekStart} scale={scale} ariaLabel={ds.label} />
          <ControlRow>
            <OptionGroup
              label="Dataset"
              value={dataset}
              onChange={setDataset}
              options={[
                { label: "Deploys", value: "deploys" },
                { label: "Orders", value: "orders" },
                { label: "Incidents", value: "incidents" },
              ]}
            />
            <OptionGroup
              label="Week starts"
              value={weekStart}
              onChange={setWeekStart}
              options={[
                { label: "Mon", value: "monday" },
                { label: "Sun", value: "sunday" },
              ]}
            />
            <OptionGroup
              label="Steps"
              value={scale}
              onChange={setScale}
              options={[
                { label: "Quantile", value: "quantile" },
                { label: "Linear", value: "linear" },
              ]}
            />
          </ControlRow>
        </DemoColumn>
      )}
    </SimpleComponentDemoPage>
  );
}
