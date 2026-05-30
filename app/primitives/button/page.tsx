"use client";

import type { SVGProps } from "react";
import { Download, Plus, Settings2 } from "lucide-react";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/isaiahbjork/primitives";
import { getGalleryItem } from "@/lib/bjork-gallery";
import {
  PrimitiveDocsSection,
  PrimitivePreviewExamples,
  type PrimitivePreviewExample,
  PrimitivePropTable,
} from "../_components/primitive-docs";
import { getPrimitiveMeta } from "../_components/primitive-meta";

const usageCode = `import { BjorkButton } from "@/components/isaiahbjork/primitives";

export function Demo() {
  return (
    <BjorkButton variant="accent" size="md">
      Publish
    </BjorkButton>
  );
}`;

const buttonExamples = [
  {
    label: "Default action",
    description: "Use for normal committed actions. It carries the same inset dark surface as the gallery controls.",
    preview: (
      <BjorkButton>
        <Plus aria-hidden="true" />
        New board
      </BjorkButton>
    ),
    code: `<BjorkButton>
  <Plus aria-hidden="true" />
  New board
</BjorkButton>`,
  },
  {
    label: "Secondary action",
    description: "Use when the action should still feel solid, but not louder than the primary button.",
    preview: <BjorkButton variant="secondary">Review queue</BjorkButton>,
    code: `<BjorkButton variant="secondary">
  Review queue
</BjorkButton>`,
  },
  {
    label: "Outline action",
    description: "Use for low-risk navigation or utility actions that need a visible boundary.",
    preview: (
      <BjorkButton variant="outline" size="lg">
        <Download aria-hidden="true" />
        Export
      </BjorkButton>
    ),
    code: `<BjorkButton variant="outline" size="lg">
  <Download aria-hidden="true" />
  Export
</BjorkButton>`,
  },
  {
    label: "Accent action",
    description: "Use once per surface for the main final action. This carries the layered orange surface, inset edge, and rounded Bjork control shape.",
    preview: (
      <BjorkButton variant="accent">
        <CrystalMark aria-hidden="true" />
        Playground
      </BjorkButton>
    ),
    code: `<BjorkButton variant="accent">
  <CrystalMark aria-hidden="true" />
  Playground
</BjorkButton>`,
  },
  {
    label: "Raised action",
    description: "Use as the paired secondary action when the control should keep the multi-border shell without taking the orange accent.",
    preview: (
      <BjorkButton variant="raised">
        <DocsMark aria-hidden="true" />
        Documentation
      </BjorkButton>
    ),
    code: `<BjorkButton variant="raised">
  <DocsMark aria-hidden="true" />
  Documentation
</BjorkButton>`,
  },
  {
    label: "Ghost action",
    description: "Use for dismissal and secondary navigation when a visible shell would add noise.",
    preview: <BjorkButton variant="ghost">Dismiss</BjorkButton>,
    code: `<BjorkButton variant="ghost">
  Dismiss
</BjorkButton>`,
  },
  {
    label: "Quiet action",
    description: "Use for compact utility controls that should stay behind the main action stack.",
    preview: <BjorkButton variant="quiet">Medium</BjorkButton>,
    code: `<BjorkButton variant="quiet">
  Medium
</BjorkButton>`,
  },
  {
    label: "Small action",
    description: "Use small buttons in dense rows, tables, and supporting controls.",
    preview: <BjorkButton size="sm">Small</BjorkButton>,
    code: `<BjorkButton size="sm">
  Small
</BjorkButton>`,
  },
  {
    label: "Large action",
    description: "Use large buttons when the control needs more weight without switching to accent.",
    preview: (
      <BjorkButton size="lg" variant="outline">
        <Download aria-hidden="true" />
        Export
      </BjorkButton>
    ),
    code: `<BjorkButton size="lg" variant="outline">
  <Download aria-hidden="true" />
  Export
</BjorkButton>`,
  },
  {
    label: "Icon action",
    description: "Use with an accessible label when the icon is the only visible content.",
    preview: (
      <BjorkButton size="icon" variant="secondary" aria-label="Open settings">
        <Settings2 aria-hidden="true" />
      </BjorkButton>
    ),
    code: `<BjorkButton
  size="icon"
  variant="secondary"
  aria-label="Open settings"
>
  <Settings2 aria-hidden="true" />
</BjorkButton>`,
  },
  {
    label: "Disabled action",
    description: "Use disabled for unavailable work while preserving the button footprint.",
    preview: <BjorkButton disabled>Sync unavailable</BjorkButton>,
    code: `<BjorkButton disabled>
  Sync unavailable
</BjorkButton>`,
  },
] satisfies readonly PrimitivePreviewExample[];

function ButtonDocs() {
  return (
    <>
      <PrimitiveDocsSection title="Props">
        <PrimitivePropTable
          rows={[
            {
              name: "variant",
              value: "default | secondary | outline | ghost | quiet | accent | raised",
              description: "Controls the surface weight. Accent and raised use the layered border and gradient treatment.",
            },
            {
              name: "size",
              value: "sm | md | lg | icon",
              description: "Matches the compact 45px control height by default.",
            },
            {
              name: "disabled",
              value: "boolean",
              description: "Removes pointer interaction and drops opacity without changing the layout footprint.",
            },
            {
              name: "haptics",
              value: "boolean",
              description: "Enables the WebHaptics tap pulse. Defaults on; pass haptics={false} to silence a button.",
            },
            {
              name: "hapticPattern",
              value: "light | medium | selection | custom pattern",
              description: "Changes the WebHaptics preset or pattern used on pointer down. Defaults to light.",
            },
            {
              name: "children",
              value: "ReactNode",
              description: "Accepts text, lucide icons, or both. Icons are normalized to the primitive sizing token.",
            },
          ]}
        />
      </PrimitiveDocsSection>
    </>
  );
}

function CrystalMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="currentColor"
      preserveAspectRatio="xMidYMid meet"
      {...props}
    >
      <path d="M29.9761,15.7832l-2-9a.9992.9992,0,0,0-.4214-.6152l-6-4A1.0008,1.0008,0,0,0,21,2H11a1.0008,1.0008,0,0,0-.5547.168l-6,4a.9992.9992,0,0,0-.4214.6152l-2,9a1.0019,1.0019,0,0,0,.0181.5039l3,10a1,1,0,0,0,.6709.6709l10,3,.0051.0005a.9789.9789,0,0,0,.564,0l.0051-.0005,10-3a1,1,0,0,0,.6709-.6709l3-10A1.0019,1.0019,0,0,0,29.9761,15.7832Zm-19.05.833L7.0168,8.7974l7.2815,2.6479ZM16,12.4971,19.5889,18H12.4111ZM19.3818,20,16,26.7637,12.6182,20Zm-1.68-8.5547,7.2815-2.6479-3.91,7.8188ZM18.19,9.14l3.0961-4.747,3.5152,2.3432ZM16,8.8364,12.8459,4h6.3082Zm-2.19.3032L7.1992,6.7358l3.5152-2.3432Zm-4.8439,8.03-4.802-1.8007L5.3652,9.9668ZM14.07,27.377,7.5679,25.4263l3.1284-4.7969Zm7.2334-6.7476,3.1284,4.7969L17.93,27.377ZM26.6348,9.9668l1.2006,5.4019-4.802,1.8007ZM4.5374,17.6445l4.5944,1.7227L6.3391,23.65ZM25.6609,23.65l-2.7927-4.2827,4.5944-1.7227Z" />
    </svg>
  );
}

function DocsMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="currentColor"
      preserveAspectRatio="xMidYMid meet"
      {...props}
    >
      <path d="M19 10H26V12H19z" />
      <path d="M19 15H26V17H19z" />
      <path d="M19 20H26V22H19z" />
      <path d="M6 10H13V12H6z" />
      <path d="M6 15H13V17H6z" />
      <path d="M6 20H13V22H6z" />
      <path d="M28,5H4A2.002,2.002,0,0,0,2,7V25a2.002,2.002,0,0,0,2,2H28a2.002,2.002,0,0,0,2-2V7A2.002,2.002,0,0,0,28,5ZM4,7H15V25H4ZM17,25V7H28V25Z" />
    </svg>
  );
}

export default function Page() {
  const item = getGalleryItem("primitive-button");
  const meta = getPrimitiveMeta("button");

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
      details={<ButtonDocs />}
      previewLayout="list"
    >
      <PrimitivePreviewExamples examples={buttonExamples} />
    </SimpleComponentDemoPage>
  );
}
