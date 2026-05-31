"use client";

import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import {
  ResizableTable,
} from "@/components/bjork-ui/tables/resizable-table";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("resizable-table");

export default function ResizableTableDemo() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const tableTheme = previewTheme === "light" || previewTheme === "dark" ? previewTheme : "auto";

  const handleEmployeeSelect = (employeeId: string) => {
    console.log(`Selected employee:`, employeeId);
  };

  const handleColumnResize = (columnKey: string, newWidth: number) => {
    console.log(`Column ${columnKey} resized to ${newWidth}px`);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A resizable employee table with draggable column widths, row selection, and dense dashboard formatting."
      previewScaleClassName="w-[980px] scale-[0.68]"
      previewInnerClassName="bg-[#f7f5ef] dark:bg-[#111]"
    >
      <ResizableTable
        title="Employee"
        onEmployeeSelect={handleEmployeeSelect}
        onColumnResize={handleColumnResize}
        theme={tableTheme}
        enableAnimations={!isPreview}
      />
    </SimpleComponentDemoPage>
  );
}
