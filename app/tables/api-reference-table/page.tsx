"use client";

import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { ApiReferenceTable } from "@/components/bjork-ui/tables/api-reference-table";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("api-reference-table");

export default function ApiReferenceTableDemo() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const tableTheme = previewTheme === "light" || previewTheme === "dark" ? previewTheme : "auto";

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A parameter reference for API docs. Path, query and body params sit in tabs, nested object fields expand in place with an indent guide, union types wrap as chips, and every name carries a copyable deep link."
      usageCode={`import { ApiReferenceTable, type ApiSection } from "@/components/bjork-ui/tables/api-reference-table";

const sections: ApiSection[] = [
  {
    id: "body",
    label: "Body",
    params: [
      { name: "amount", type: "integer", required: true, description: "Amount in the smallest currency unit." },
      {
        name: "destination",
        type: "object",
        required: true,
        description: "Where the funds land.",
        children: [
          { name: "type", type: '"bank_account" | "debit_card"', required: true, description: "Kind of destination." },
        ],
      },
      { name: "source_balance", type: "string", deprecated: "Use \`source_type\` instead.", description: "Balance to draw from." },
    ],
  },
];

<ApiReferenceTable
  title="Create a payout"
  method="POST"
  path="/v2/accounts/{account_id}/payouts"
  sections={sections}
  defaultExpanded={["destination"]}
  onCopyAnchor={(anchor) => console.log(anchor)}
/>`}
      previewScaleClassName="w-[860px] scale-[0.98]"
      previewCaptureScaleClassName="w-[880px] scale-[0.92]"
      previewInnerClassName="bg-[#f7f5ef] dark:bg-[#111]"
    >
      <ApiReferenceTable
        theme={tableTheme}
        enableAnimations={!isPreview}
        defaultExpanded={["destination"]}
        maxHeight={isPreview ? 335 : 560}
      />
    </SimpleComponentDemoPage>
  );
}
