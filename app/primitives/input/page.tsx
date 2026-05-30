"use client";

import { Search } from "lucide-react";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BjorkInput } from "@/components/isaiahbjork/primitives";
import { getGalleryItem } from "@/lib/bjork-gallery";
import {
  PrimitiveDocsSection,
  PrimitivePreviewExamples,
  type PrimitivePreviewExample,
  PrimitivePropTable,
} from "../_components/primitive-docs";
import { getPrimitiveMeta } from "../_components/primitive-meta";

const usageCode = `import { BjorkInput } from "@/components/isaiahbjork/primitives";

export function Demo() {
  return (
    <BjorkInput
      aria-label="Project name"
      placeholder="Name"
    />
  );
}`;

const inputExamples = [
  {
    label: "Standalone field",
    description: "Use for normal form fields. The default shadow matches the home-card controls but stays compact.",
    preview: (
      <BjorkInput
        aria-label="Project name"
        placeholder="Aurora archive"
      />
    ),
    previewClassName: "items-center",
    code: `<BjorkInput
  aria-label="Project name"
  placeholder="Aurora archive"
/>`,
  },
  {
    label: "Search shell",
    description: "Wrap the ghost variant when the icon and input need to behave like the bottom search dock.",
    preview: (
      <label className="flex h-[45px] w-full min-w-0 items-center gap-2 rounded-[13px] bg-[var(--bjork-surface)] px-4 py-2 text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-surface)] backdrop-blur-md">
        <Search className="size-4 shrink-0 text-[color:var(--bjork-text-muted)]" />
        <BjorkInput
          variant="ghost"
          placeholder="Search components"
          aria-label="Search components"
          className="h-auto rounded-none bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </label>
    ),
    previewClassName: "items-center",
    code: `<label className="flex h-[45px] items-center gap-2 rounded-[13px] bg-[var(--bjork-surface)] px-4 shadow-[var(--bjork-shadow-surface)]">
  <Search aria-hidden="true" className="size-4 text-[color:var(--bjork-text-muted)]" />
  <BjorkInput
    variant="ghost"
    aria-label="Search components"
    placeholder="Search components"
  />
</label>`,
  },
  {
    label: "Inset field",
    description: "Use for fields nested inside dense cards where the darker interior should read as recessed.",
    preview: (
      <BjorkInput
        variant="inset"
        inputSize="sm"
        aria-label="Filter"
        placeholder="Filter"
      />
    ),
    previewClassName: "items-center",
    code: `<BjorkInput
  variant="inset"
  inputSize="sm"
  placeholder="Filter"
/>`,
  },
  {
    label: "Quiet field",
    description: "Use where the field should keep the form row calm but still show a visible surface.",
    preview: (
      <BjorkInput
        variant="quiet"
        aria-label="Collection"
        placeholder="Collection"
      />
    ),
    previewClassName: "items-center",
    code: `<BjorkInput
  variant="quiet"
  aria-label="Collection"
  placeholder="Collection"
/>`,
  },
  {
    label: "Error state",
    description: "Use with aria-invalid and visible helper text. The orange shadow is intentionally subtle.",
    preview: (
      <div className="grid w-full gap-2">
        <BjorkInput
          variant="error"
          aria-invalid="true"
          aria-describedby="slug-error-preview"
          defaultValue="weekly/drop"
        />
        <span id="slug-error-preview" className="text-xs text-[#ec5c13]">
          Use letters, numbers, and hyphens only.
        </span>
      </div>
    ),
    previewClassName: "items-center",
    code: `<BjorkInput
  variant="error"
  aria-invalid="true"
  aria-describedby="slug-error"
  defaultValue="weekly/drop"
/>`,
  },
  {
    label: "Disabled field",
    description: "Use for locked values when the surrounding layout still needs the field footprint.",
    preview: (
      <BjorkInput
        disabled
        aria-label="Locked slug"
        value="archive-pulse"
        readOnly
      />
    ),
    previewClassName: "items-center",
    code: `<BjorkInput
  disabled
  aria-label="Locked slug"
  value="archive-pulse"
  readOnly
/>`,
  },
] satisfies readonly PrimitivePreviewExample[];

function InputDocs() {
  return (
    <>
      <PrimitiveDocsSection title="Props">
        <PrimitivePropTable
          rows={[
            {
              name: "variant",
              value: "default | quiet | inset | ghost | error",
              description: "Controls the field surface. Ghost is meant for composed search shells, not standalone forms.",
            },
            {
              name: "inputSize",
              value: "sm | md | lg",
              description: "Uses the same 45px default control height as the home page dock.",
            },
            {
              name: "aria-invalid",
              value: "boolean",
              description: "Pair with the error variant and helper text for accessible validation states.",
            },
            {
              name: "type",
              value: "input type",
              description: "Defaults to text and forwards the normal input type prop for email, password, search, and more.",
            },
          ]}
        />
      </PrimitiveDocsSection>
    </>
  );
}

export default function Page() {
  const item = getGalleryItem("primitive-input");
  const meta = getPrimitiveMeta("input");

  return (
    <SimpleComponentDemoPage
      item={item}
      description={meta?.description}
      dependencies={meta ? [...meta.dependencies] : []}
      interactionRows={
        meta
          ? [
              {
                label: meta.interactionType,
                value: meta.interactionDescription,
              },
            ]
          : undefined
      }
      usageCode={usageCode}
      details={<InputDocs />}
      previewLayout="list"
    >
      <PrimitivePreviewExamples examples={inputExamples} />
    </SimpleComponentDemoPage>
  );
}
