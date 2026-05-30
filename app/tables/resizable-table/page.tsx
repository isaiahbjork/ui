"use client";

import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import {
  ResizableTable,
} from "@/components/isaiahbjork/tables/resizable-table";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("resizable-table");

export default function ResizableTableDemo() {
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
      <ResizableTable title="Employee" onEmployeeSelect={handleEmployeeSelect} onColumnResize={handleColumnResize} />
    </SimpleComponentDemoPage>
  );
}
