"use client";

import { AppDashboardShell } from "@/components/bjork-ui/blocks/app-dashboard-shell";
import { AppBlockFrame } from "../app-block-frame";

export default function AppDashboardShellDemo() {
  return (
    <AppBlockFrame
      slug="app-dashboard-shell"
      description="An application dashboard you can paste in whole: a sidebar that collapses to an icon rail and becomes a drawer on narrow containers, a header with search, a KPI row with sparklines, a revenue chart with keyboard stepping and a table view, a channel breakdown and a sortable, filterable orders table. It sizes to its container, not the window."
      usageCode={`import {
  AppDashboardShell,
  sampleDashboardSeries,
  type DashboardOrder,
} from "@/components/bjork-ui/blocks/app-dashboard-shell";

const orders: DashboardOrder[] = [
  {
    id: "HL-48213",
    customer: "Maren Okafor",
    email: "maren@fieldnote.studio",
    status: "paid",
    channel: "Direct",
    date: "2026-10-08",
    amount: 24_800, // minor units
  },
];

export function Dashboard() {
  return (
    <div className="h-dvh">
      <AppDashboardShell
        workspace={{ name: "Halcyon", plan: "Scale plan" }}
        user={{ name: "Rhea Castillo", email: "rhea@halcyon.app" }}
        orders={orders}
        getSeries={sampleDashboardSeries} // (range) => { points, kpis, channels }
        onNavigate={(id) => console.log("navigate", id)}
        onRangeChange={(range) => console.log("range", range)}
      />
    </div>
  );
}`}
    >
      {({ isPreview, theme }) => <AppDashboardShell theme={theme} disableAnimation={isPreview} />}
    </AppBlockFrame>
  );
}
