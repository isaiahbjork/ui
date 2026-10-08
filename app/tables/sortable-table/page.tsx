"use client";

import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { SORTABLE_TABLE_SAMPLE_ROWS, SortableTable } from "@/components/bjork-ui/tables/sortable-table";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("sortable-table");

const previewSelection = [SORTABLE_TABLE_SAMPLE_ROWS[1].id, SORTABLE_TABLE_SAMPLE_ROWS[3].id];

export default function SortableTableDemo() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const tableTheme = previewTheme === "light" || previewTheme === "dark" ? previewTheme : "auto";

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A typed data table for dashboards. Search across visible columns, sort by one column or shift-click for several, hide columns, select rows and page through results, all from the keyboard."
      usageCode={`import { SortableTable, type SortableColumn } from "@/components/bjork-ui/tables/sortable-table";

type Sku = { id: string; name: string; stock: number; price: number; restocked: string };

const columns: SortableColumn<Sku>[] = [
  { key: "name", header: "Item", width: 220, hideable: false },
  { key: "stock", header: "On hand", format: "number", width: 110 },
  { key: "price", header: "Price", format: "currency", width: 110 },
  { key: "restocked", header: "Restocked", format: "date", width: 140 },
];

<SortableTable<Sku>
  columns={columns}
  rows={skus}
  title="Inventory"
  itemLabel="items"
  defaultSort={[{ key: "stock", direction: "asc" }]}
  onSelectionChange={(ids) => console.log(ids)}
  loading={isLoading}
/>`}
      previewScaleClassName="w-[1100px] scale-[0.8]"
      previewLayout={isPreview ? "single" : "list"}
    >
      <SortableTable
        theme={tableTheme}
        enableAnimations={!isPreview}
        defaultPageSize={isPreview ? 8 : 10}
        defaultSort={[{ key: "createdAt", direction: "desc" }]}
        defaultSelectedIds={isPreview ? previewSelection : undefined}
      />
    </SimpleComponentDemoPage>
  );
}
