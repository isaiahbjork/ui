"use client";

import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { INVOICE_SAMPLE_LINES, InvoiceTable } from "@/components/bjork-ui/tables/invoice-table";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("invoice-table");

const previewLines = [INVOICE_SAMPLE_LINES[0], INVOICE_SAMPLE_LINES[1], INVOICE_SAMPLE_LINES[4]];

export default function InvoiceTableDemo() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const tableTheme = previewTheme === "light" || previewTheme === "dark" ? previewTheme : "auto";

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Invoice line items with editable quantity, price, discount and tax. Totals are computed in integer minor units, so cents never drift, and the layout prints cleanly."
      usageCode={`import { InvoiceTable, type InvoiceLine } from "@/components/bjork-ui/tables/invoice-table";

const [lines, setLines] = useState<InvoiceLine[]>([
  {
    id: "ln-1",
    description: "Brand identity system",
    sku: "HR-ID-01",
    quantity: 1,
    unitPrice: 480_000, // minor units
    discount: 10, // percent
    taxRate: 8.25, // percent
  },
]);

<InvoiceTable
  lines={lines}
  onChange={(next, totals) => {
    setLines(next);
    console.log(totals.total);
  }}
  currency="USD"
  locale="en-US"
  editable
/>`}
      previewScaleClassName="w-[920px] scale-[0.7]"
      previewLayout={isPreview ? "single" : "list"}
    >
      <InvoiceTable
        theme={tableTheme}
        enableAnimations={!isPreview}
        defaultLines={isPreview ? previewLines : undefined}
        onChange={(_, totals) => console.log("Invoice total (minor units)", totals.total)}
      />
    </SimpleComponentDemoPage>
  );
}
