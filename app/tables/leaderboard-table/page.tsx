"use client";

import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { LeaderboardTable, type LeaderboardPeriod } from "@/components/bjork-ui/tables/leaderboard-table";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("leaderboard-table");

export default function LeaderboardTableDemo() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const tableTheme = previewTheme === "light" || previewTheme === "dark" ? previewTheme : "auto";

  const handlePeriodChange = (period: LeaderboardPeriod) => {
    console.log("Period:", period);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A ranked leaderboard with rank movement, score against the leader and win streaks. Rows glide to their new places when the period changes, and your own row stays pinned to the bottom while it is scrolled out of view."
      usageCode={`import {
  LeaderboardTable,
  type LeaderboardEntry,
} from "@/components/bjork-ui/tables/leaderboard-table";

const entries: LeaderboardEntry[] = [
  { id: "p01", handle: "quietfox", team: "Harbor · EU West", score: 18420,
    previousRank: 1, winRate: 0.76, streak: 3 },
  { id: "p14", handle: "driftwood", team: "Harbor · NA West", score: 11480,
    previousRank: 14, winRate: 0.55, streak: 2 },
];

<LeaderboardTable
  entries={entries}
  currentUserId="p14"
  defaultPeriod="month"
  onPeriodChange={(period) => refetch(period)}
/>`}
      previewScaleClassName="w-[880px] scale-[0.84]"
      previewLayout={isPreview ? "single" : "list"}
    >
      <LeaderboardTable
        onPeriodChange={handlePeriodChange}
        theme={tableTheme}
        enableAnimations={!isPreview}
        maxHeight={isPreview ? 420 : 520}
      />
    </SimpleComponentDemoPage>
  );
}
