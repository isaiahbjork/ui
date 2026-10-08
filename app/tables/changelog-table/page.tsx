"use client";

import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { ChangelogTable } from "@/components/bjork-ui/tables/changelog-table";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("changelog-table");

export default function ChangelogTableDemo() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const tableTheme = previewTheme === "light" || previewTheme === "dark" ? previewTheme : "auto";

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A release history table for developer tools. Filter by change type, search across versions and notes, and expand any release to read every change. Arrow keys move between releases."
      usageCode={`import {
  ChangelogTable,
  type ChangelogRelease,
} from "@/components/bjork-ui/tables/changelog-table";

const releases: ChangelogRelease[] = [
  {
    version: "3.2.0",
    date: "2026-09-30",
    summary: "Branch previews for sync rules",
    href: "/changelog/3-2-0",
    changes: [
      { type: "feature", text: "\`driftline preview\` spins up a replica per branch." },
      { type: "improvement", text: "Cold start is 38% faster." },
    ],
  },
];

<ChangelogTable
  releases={releases}
  productName="Driftline"
  defaultExpanded={["3.2.0"]}
  groupByMinor={false}
/>`}
      previewScaleClassName="w-[1000px] scale-[0.82]"
      previewLayout={isPreview ? "single" : "list"}
    >
      <ChangelogTable
        theme={tableTheme}
        enableAnimations={!isPreview}
        defaultExpanded={["3.2.0"]}
        maxHeight={isPreview ? 470 : 560}
      />
    </SimpleComponentDemoPage>
  );
}
