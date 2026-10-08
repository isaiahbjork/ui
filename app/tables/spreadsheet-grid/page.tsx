"use client";

import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { SpreadsheetGrid, type SpreadsheetCells } from "@/components/bjork-ui/tables/spreadsheet-grid";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("spreadsheet-grid");

export default function SpreadsheetGridDemo() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const tableTheme = previewTheme === "light" || previewTheme === "dark" ? previewTheme : "auto";

  const handleChange = (_cells: SpreadsheetCells, changes: { address: string; value: string }[]) => {
    console.log("Changed", changes);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A spreadsheet built on the ARIA grid pattern. Arrow keys move the active cell, typing edits in place, Shift extends a range, ranges copy and paste as tab-separated text, and formulas like =SUM(B2:B8) recalculate as you go."
      usageCode={`import {
  SpreadsheetGrid,
  type SpreadsheetCells,
  type SpreadsheetColumn,
} from "@/components/bjork-ui/tables/spreadsheet-grid";

const columns: SpreadsheetColumn[] = [
  { type: "text", width: 160 },
  { type: "currency", width: 110 },
  { type: "percent", width: 90 },
];

const [cells, setCells] = useState<SpreadsheetCells>({
  A1: "Item", B1: "Cost", C1: "Share",
  A2: "Hosting", B2: "4200", C2: "=B2/B4",
  A3: "Design", B3: "6800", C3: "=B3/B4",
  A4: "Total", B4: "=SUM(B2:B3)", C4: "=C2+C3",
});

<SpreadsheetGrid
  title="Launch budget"
  columns={columns}
  rowCount={12}
  totalRows={[4]}
  cells={cells}
  onChange={(next) => setCells(next)}
/>`}
      previewScaleClassName="w-[420px] scale-[1]"
      previewCaptureScaleClassName="w-[1040px] scale-[0.78]"
      previewInnerClassName="bg-[#f7f5ef] dark:bg-[#111]"
    >
      <SpreadsheetGrid
        // The scroll region has no intrinsic width, so the card needs a definite one inside the shrink-to-fit stage.
        className={isPreview ? "w-[1040px]" : "w-[420px] lg:w-[1040px] lg:max-w-full"}
        theme={tableTheme}
        enableAnimations={!isPreview}
        defaultActiveCell="B9"
        maxHeight={isPreview ? 420 : 520}
        onChange={handleChange}
      />
    </SimpleComponentDemoPage>
  );
}
