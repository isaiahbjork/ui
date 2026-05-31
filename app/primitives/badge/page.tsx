"use client";

import { Check, Clock, Sparkles } from "lucide-react";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BjorkBadge } from "@/components/bjork-ui/primitives";
import { getGalleryItem } from "@/lib/bjork-gallery";
import {
  PrimitiveDocsSection,
  PrimitivePreviewExamples,
  type PrimitivePreviewExample,
  PrimitivePropTable,
} from "../_components/primitive-docs";
import { getPrimitiveMeta } from "../_components/primitive-meta";

const usageCode = `import { BjorkBadge } from "@/components/bjork-ui/primitives";

export function Demo() {
  return <BjorkBadge variant="accent">Ready</BjorkBadge>;
}`;

const badgeExamples = [
  {
    label: "Default status",
    description: "Use for high-contrast status where the label needs to be read immediately.",
    preview: (
      <BjorkBadge>
        <Check aria-hidden="true" />
        Published
      </BjorkBadge>
    ),
    code: `<BjorkBadge>
  <Check aria-hidden="true" />
  Published
</BjorkBadge>`,
  },
  {
    label: "Muted status",
    description: "Use for passive state labels that should sit behind primary controls.",
    preview: (
      <BjorkBadge variant="muted">
        <Clock aria-hidden="true" />
        Waiting
      </BjorkBadge>
    ),
    code: `<BjorkBadge variant="muted">
  <Clock aria-hidden="true" />
  Waiting
</BjorkBadge>`,
  },
  {
    label: "Accent status",
    description: "Use sparingly for a fresh or active state. It shares the softened orange treatment.",
    preview: (
      <BjorkBadge variant="accent" size="md">
        <Sparkles aria-hidden="true" />
        New
      </BjorkBadge>
    ),
    code: `<BjorkBadge variant="accent" size="md">
  <Sparkles aria-hidden="true" />
  New
</BjorkBadge>`,
  },
  {
    label: "Secondary status",
    description: "Use for solid metadata that should be quieter than the default white badge.",
    preview: <BjorkBadge variant="secondary">Queued</BjorkBadge>,
    code: `<BjorkBadge variant="secondary">
  Queued
</BjorkBadge>`,
  },
  {
    label: "Outline status",
    description: "Use for draft and neutral states that need a boundary without a filled surface.",
    preview: <BjorkBadge variant="outline">Draft</BjorkBadge>,
    code: `<BjorkBadge variant="outline">
  Draft
</BjorkBadge>`,
  },
  {
    label: "Small badge",
    description: "Use small badges inside table cells and dense rows.",
    preview: <BjorkBadge size="sm" variant="outline">Small</BjorkBadge>,
    code: `<BjorkBadge size="sm" variant="outline">
  Small
</BjorkBadge>`,
  },
  {
    label: "Medium badge",
    description: "Use medium as the default size for card headers and filter labels.",
    preview: <BjorkBadge size="md" variant="accent">Medium</BjorkBadge>,
    code: `<BjorkBadge size="md" variant="accent">
  Medium
</BjorkBadge>`,
  },
  {
    label: "Large badge",
    description: "Use large for status rows that need stronger scan weight.",
    preview: <BjorkBadge size="lg" variant="secondary">Large</BjorkBadge>,
    code: `<BjorkBadge size="lg" variant="secondary">
  Large
</BjorkBadge>`,
  },
] satisfies readonly PrimitivePreviewExample[];

function BadgeDocs() {
  return (
    <>
      <PrimitiveDocsSection title="Props">
        <PrimitivePropTable
          rows={[
            {
              name: "variant",
              value: "default | secondary | outline | muted | accent",
              description: "Controls emphasis from loud status to quiet metadata.",
            },
            {
              name: "size",
              value: "sm | md | lg",
              description: "Keeps status labels aligned across tables, cards, and compact controls.",
            },
            {
              name: "children",
              value: "ReactNode",
              description: "Accepts a label or icon plus label. Icons are normalized to the badge size.",
            },
          ]}
        />
      </PrimitiveDocsSection>
    </>
  );
}

export default function Page() {
  const item = getGalleryItem("primitive-badge");
  const meta = getPrimitiveMeta("badge");

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
      details={<BadgeDocs />}
      previewLayout="list"
    >
      <PrimitivePreviewExamples examples={badgeExamples} />
    </SimpleComponentDemoPage>
  );
}
