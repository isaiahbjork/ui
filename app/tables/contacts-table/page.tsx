"use client";

import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import {
  ContactsTable,
} from "@/components/bjork-ui/tables/contacts-table";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("contacts-table");

export default function ContactsTableDemo() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const tableTheme = previewTheme === "light" || previewTheme === "dark" ? previewTheme : "auto";

  const handleContactSelect = (contactId: string) => {
    console.log(`Selected contact:`, contactId);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A contact table for people directories with row selection and compact profile metadata."
      previewScaleClassName="w-[960px] scale-[0.68]"
      previewInnerClassName="bg-[#f7f5ef] dark:bg-[#111]"
    >
      <ContactsTable
        title="Person"
        onContactSelect={handleContactSelect}
        theme={tableTheme}
        enableAnimations={!isPreview}
      />
    </SimpleComponentDemoPage>
  );
}
