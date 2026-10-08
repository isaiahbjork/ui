"use client";

import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { FileTreeTable, type FileNode } from "@/components/bjork-ui/tables/file-tree-table";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("file-tree-table");

export default function FileTreeTableDemo() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const tableTheme = previewTheme === "light" || previewTheme === "dark" ? previewTheme : "auto";

  const handleOpen = (node: FileNode) => {
    console.log("Opened", node.id);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A file browser built on the ARIA treegrid pattern. Arrow keys walk and fold the tree, typing jumps by name, folders roll up their size, and sorting keeps folders on top."
      usageCode={`import { FileTreeTable, type FileNode } from "@/components/bjork-ui/tables/file-tree-table";

const nodes: FileNode[] = [
  {
    id: "src",
    name: "src",
    children: [
      { id: "src/app.tsx", name: "app.tsx", size: 4208, modified: "2026-10-04T12:00:00Z" },
      { id: "src/styles.css", name: "styles.css", size: 1840, modified: "2026-09-28T09:30:00Z" },
    ],
  },
  { id: "package.json", name: "package.json", size: 2874, modified: "2026-10-05T18:10:00Z" },
];

<FileTreeTable
  nodes={nodes}
  title="my-app"
  defaultExpanded={["src"]}
  onOpen={(node) => openInEditor(node.id)}
  onSelectionChange={(ids) => setSelected(ids)}
/>`}
      previewScaleClassName="w-[420px] scale-[1]"
      previewCaptureScaleClassName="w-[880px] scale-[0.76]"
      previewInnerClassName="bg-[#f7f5ef] dark:bg-[#111]"
    >
      <FileTreeTable
        // The card is a size container, so it needs a definite width inside the shrink-to-fit stage.
        className={isPreview ? "w-[880px]" : "w-[420px] lg:w-[880px] lg:max-w-full"}
        theme={tableTheme}
        enableAnimations={!isPreview}
        defaultFocusedId="app/dashboard/projects/[slug]/page.tsx"
        defaultSelected={["app/dashboard/projects/[slug]/page.tsx"]}
        maxHeight={isPreview ? 420 : 460}
        onOpen={handleOpen}
      />
    </SimpleComponentDemoPage>
  );
}
