"use client";

import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { TransactionsTable } from "@/components/bjork-ui/tables/transactions-table";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("transactions-table");

export default function TransactionsTableDemo() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const tableTheme = previewTheme === "light" || previewTheme === "dark" ? previewTheme : "auto";

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Order history grouped by day. Filter by status with live counts, open a row to see its line items, and pick an order to inspect it. Amounts are formatted from minor units, refunds read negative."
      usageCode={`import { TransactionsTable, type Transaction } from "@/components/bjork-ui/tables/transactions-table";

const transactions: Transaction[] = [
  {
    id: "txn_9f2c41",
    orderId: "#KS-2418",
    createdAt: "2026-10-08T17:52:00Z",
    customer: { name: "Mara Lindqvist", email: "mara.l@fernpost.io" },
    amount: 12850, // minor units, negative for refunds
    currency: "USD",
    status: "paid",
    method: { kind: "credit", last4: "4419" },
    items: [{ name: "Ash glaze mug, 12 oz", quantity: 2, unitAmount: 3400 }],
  },
];

<TransactionsTable
  transactions={transactions}
  timeZone="America/Chicago"
  onTransactionSelect={(tx) => router.push(\`/orders/\${tx.id}\`)}
/>`}
      previewScaleClassName="w-[980px] scale-[0.8]"
      previewLayout={isPreview ? "single" : "list"}
    >
      <TransactionsTable
        theme={tableTheme}
        enableAnimations={!isPreview}
        defaultExpandedIds={["txn_9f2c41"]}
        maxBodyHeight={isPreview ? 400 : 560}
        onTransactionSelect={(tx) => console.log("Selected transaction", tx.id)}
      />
    </SimpleComponentDemoPage>
  );
}
