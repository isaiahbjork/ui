"use client";

import { useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage, ShellSegmented } from "@/components/bjork-ui/component-demo-shell";
import { CohortRetention, type RetentionCohort } from "@/components/bjork-ui/charts/cohort-retention";
import { mulberry32 } from "@/components/bjork-ui/_core/random";
import { gaussian } from "@/components/bjork-ui/charts/_kit/scale";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { DemoColumn } from "../_demo/controls";

const item = getGalleryItem("cohort-retention");

const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

interface Curve {
  first: number;
  floor: number;
  tau: number;
}

// Twelve cohorts, the newest with the fewest periods. Cohorts from `change` on signed up after the
// new onboarding shipped and keep more users from the first period on.
function makeCohorts(seed: number, cadence: "month" | "week", before: Curve, after: Curve): RetentionCohort[] {
  const rnd = mulberry32(seed);
  const n = 12;
  const change = 6;
  return Array.from({ length: n }, (_, i) => {
    const start = cadence === "month" ? Date.UTC(2025, 9 + i, 1) : Date.UTC(2026, 5, 29) + i * 7 * 86400000;
    const label = cadence === "month" ? monthFmt.format(start) : dayFmt.format(start);
    // Steady growth, plus the launch month pulling in a bigger, slightly less committed cohort.
    const launch = i === change ? 1.38 : 1;
    const base = cadence === "month" ? 1650 : 410;
    const size = Math.round(base * 1.05 ** i * launch * (1 + gaussian(rnd) * 0.05));
    const curve = i >= change ? after : before;
    const values: number[] = [size];
    let prev = 1;
    for (let p = 1; p < n - i; p++) {
      const ideal = curve.floor + (curve.first - curve.floor) * Math.exp(-(p - 1) / curve.tau) - (i === change ? 0.02 : 0);
      const rate = Math.min(prev + 0.004, ideal + gaussian(rnd) * 0.012);
      prev = rate;
      values.push(Math.round(size * Math.max(0, rate)));
    }
    return { id: `${cadence}-${i}`, label, size, values };
  });
}

const DATA = {
  monthly: makeCohorts(41, "month", { first: 0.38, floor: 0.16, tau: 3 }, { first: 0.47, floor: 0.23, tau: 3.6 }),
  weekly: makeCohorts(73, "week", { first: 0.51, floor: 0.21, tau: 2.4 }, { first: 0.6, floor: 0.27, tau: 2.8 }),
};

const PERIODS = {
  monthly: { title: "Months since signup", format: (p: number, style: "short" | "long") => (style === "long" ? `Month ${p}` : `M${p}`) },
  weekly: { title: "Weeks since signup", format: (p: number, style: "short" | "long") => (style === "long" ? `Week ${p}` : `W${p}`) },
};

export default function Page() {
  const isPreview = usePreviewMode();
  const [display, setDisplay] = useState<"percent" | "count">("percent");
  const [cadence, setCadence] = useState<"monthly" | "weekly">("monthly");
  function reset() {
    setDisplay("percent");
    setCadence("monthly");
  }

  const per = PERIODS[cadence];

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A retention triangle for signup cohorts. Each row is a cohort with its size, each column a period since signup, and each cell the share still active. The colour scale runs from zero to the best retention after signup, so the 100% of period zero doesn't flatten everything else. The bottom row averages the cohorts that reached each period, weighted by size, and the tooltip shows how far a cell sits above or below it. Here the onboarding change from April shows up as a brighter lower half."
      dependencies={["framer-motion"]}
      usageCode={`import { CohortRetention } from "@/components/bjork-ui/charts/cohort-retention";

<CohortRetention
  cohorts={[
    { id: "jan", label: "Jan 2026", size: 1840, values: [1840, 702, 561, 488] },
    { id: "feb", label: "Feb 2026", size: 1925, values: [1925, 760, 603] },
    { id: "mar", label: "Mar 2026", size: 2010, values: [2010, 905] },
  ]}
  periodTitle="Months since signup"
  formatPeriod={(p, style) => (style === "long" ? \`Month \${p}\` : \`M\${p}\`)}
  display="percent"
/>`}
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[700px]"
      onReset={reset}
      optionsDefaultOpen={false}
      controls={
        <>
          <ShellSegmented
            label="Cells"
            value={display}
            onChange={setDisplay}
            options={[
              { label: "Percent", value: "percent" },
              { label: "Users", value: "count" },
            ]}
          />
          <ShellSegmented
            label="Cohorts"
            value={cadence}
            onChange={setCadence}
            options={[
              { label: "Monthly", value: "monthly" },
              { label: "Weekly", value: "weekly" },
            ]}
          />
        </>
      }
    >
      {isPreview ? (
        <div className="w-[700px]">
          <CohortRetention
            cohorts={DATA.monthly}
            periodTitle={PERIODS.monthly.title}
            formatPeriod={PERIODS.monthly.format}
            activeCell={[8, 3]}
            rowHeight={26}
            ariaLabel="Monthly signup cohort retention"
          />
        </div>
      ) : (
        <DemoColumn width={780}>
          <CohortRetention
            cohorts={DATA[cadence]}
            periodTitle={per.title}
            formatPeriod={per.format}
            display={display}
            ariaLabel={cadence === "monthly" ? "Monthly signup cohort retention" : "Weekly signup cohort retention"}
          />
        </DemoColumn>
      )}
    </SimpleComponentDemoPage>
  );
}
