"use client";

import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { ShortcutsTable } from "@/components/bjork-ui/tables/shortcuts-table";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("shortcuts-table");

export default function ShortcutsTableDemo() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const tableTheme = previewTheme === "light" || previewTheme === "dark" ? previewTheme : "auto";

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A keyboard shortcut reference. It picks Mac or Windows and Linux keys from the browser, lets the reader switch, and filters as you type by action or by key name, lighting up the matching keycaps. Press / to jump to search."
      usageCode={`import { ShortcutsTable, type ShortcutGroup } from "@/components/bjork-ui/tables/shortcuts-table";

const groups: ShortcutGroup[] = [
  {
    id: "general",
    label: "General",
    shortcuts: [
      { action: "Command palette", keys: { mac: [["Cmd", "K"]], other: [["Ctrl", "K"]] } },
      // A sequence: press Cmd+K, release, then press Z.
      { action: "Focus mode", keys: { mac: [["Cmd", "K"], ["Z"]], other: [["Ctrl", "K"], ["Z"]] } },
    ],
  },
];

<ShortcutsTable
  title="Keyboard shortcuts"
  groups={groups}
  platform="auto"
  onPlatformChange={(platform) => console.log(platform)}
/>`}
      previewScaleClassName="w-[760px] scale-[0.9]"
      previewCaptureScaleClassName="w-[800px] scale-[0.86]"
      previewInnerClassName="bg-[#f7f5ef] dark:bg-[#111]"
    >
      <ShortcutsTable
        theme={tableTheme}
        enableAnimations={!isPreview}
        platform={isPreview ? "mac" : "auto"}
        defaultQuery={isPreview ? "cmd k" : ""}
        maxHeight={isPreview ? 363 : 520}
      />
    </SimpleComponentDemoPage>
  );
}
