"use client";

import { ArrowRight } from "lucide-react";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import {
  BjorkBadge,
  BjorkButton,
  BjorkCard,
  BjorkCardContent,
  BjorkCardDescription,
  BjorkCardFooter,
  BjorkCardHeader,
  BjorkCardTitle,
} from "@/components/bjork-ui/primitives";
import { getGalleryItem } from "@/lib/bjork-gallery";
import {
  PrimitiveDocsSection,
  PrimitivePreviewExamples,
  type PrimitivePreviewExample,
  PrimitivePropTable,
} from "../_components/primitive-docs";
import { getPrimitiveMeta } from "../_components/primitive-meta";

const usageCode = `import { BjorkCard, BjorkCardHeader, BjorkCardTitle } from "@/components/bjork-ui/primitives";

export function Demo() {
  return (
    <BjorkCard>
      <BjorkCardHeader>
        <BjorkCardTitle>Archive pulse</BjorkCardTitle>
        <BjorkBadge variant="accent">Live</BjorkBadge>
      </BjorkCardHeader>
      <BjorkCardContent>42 copied components this week.</BjorkCardContent>
    </BjorkCard>
  );
}`;

const cardExamples = [
  {
    label: "Basic shell",
    description: "Use the base card when the surface only needs one compact container and soft inset light.",
    preview: (
      <BjorkCard className="w-full max-w-[280px]">
        <BjorkCardHeader>
          <BjorkCardTitle>Archive pulse</BjorkCardTitle>
        </BjorkCardHeader>
        <BjorkCardContent>
          42 copied components this week.
        </BjorkCardContent>
      </BjorkCard>
    ),
    previewClassName: "min-h-[220px]",
    code: `<BjorkCard>
  <BjorkCardHeader>
    <BjorkCardTitle>Archive pulse</BjorkCardTitle>
  </BjorkCardHeader>
  <BjorkCardContent>
    42 copied components this week.
  </BjorkCardContent>
</BjorkCard>`,
  },
  {
    label: "Elevated card",
    description: "Use elevated when a card should sit above nearby surfaces without changing the structure.",
    preview: (
      <BjorkCard variant="elevated" padding="lg" className="w-full max-w-[280px]">
        <BjorkCardHeader>
          <div className="space-y-2">
            <BjorkCardTitle>Archive pulse</BjorkCardTitle>
            <BjorkCardDescription>
              Weekly component activity.
            </BjorkCardDescription>
          </div>
          <BjorkBadge variant="accent">Live</BjorkBadge>
        </BjorkCardHeader>
      </BjorkCard>
    ),
    previewClassName: "min-h-[220px]",
    code: `<BjorkCard variant="elevated" padding="lg">
  <BjorkCardHeader>
    <div>
      <BjorkCardTitle>Archive pulse</BjorkCardTitle>
      <BjorkCardDescription>
        Weekly component activity.
      </BjorkCardDescription>
    </div>
    <BjorkBadge variant="accent">Live</BjorkBadge>
  </BjorkCardHeader>
</BjorkCard>`,
  },
  {
    label: "Quiet card",
    description: "Use quiet when repeated cards need separation without heavy shadows.",
    preview: (
      <BjorkCard variant="quiet" padding="sm" className="w-full max-w-[280px]">
        <BjorkCardHeader>
          <BjorkCardTitle>Draft set</BjorkCardTitle>
          <BjorkBadge variant="muted">Idle</BjorkBadge>
        </BjorkCardHeader>
        <BjorkCardContent className="mt-4 text-sm">
          Low-emphasis card treatment for dense stacks.
        </BjorkCardContent>
      </BjorkCard>
    ),
    previewClassName: "min-h-[220px]",
    code: `<BjorkCard variant="quiet" padding="sm">
  <BjorkCardHeader>
    <BjorkCardTitle>Draft set</BjorkCardTitle>
    <BjorkBadge variant="muted">Idle</BjorkBadge>
  </BjorkCardHeader>
  <BjorkCardContent>
    Low-emphasis card treatment for dense stacks.
  </BjorkCardContent>
</BjorkCard>`,
  },
  {
    label: "Interactive card",
    description: "Use for gallery-style cards. Add role and tabIndex when the whole card acts like a button.",
    preview: (
      <BjorkCard
        variant="interactive"
        padding="sm"
        role="button"
        tabIndex={0}
        className="w-full max-w-[280px]"
      >
        <div className="relative min-h-[116px] overflow-hidden rounded-2xl border border-[color:var(--bjork-border-muted)] bg-[var(--bjork-panel)] shadow-[var(--bjork-shadow-inset)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,var(--bjork-surface-hover)_0%,var(--bjork-panel)_48%,var(--bjork-bg)_100%)]" />
          <div className="absolute inset-x-5 bottom-5 space-y-2">
            <div className="h-2 w-2/3 rounded-full bg-[color:var(--bjork-text-faint)]" />
            <div className="h-2 w-1/2 rounded-full bg-[color:var(--bjork-text-faint)] opacity-60" />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 px-2 pt-2">
          <p className="truncate font-medium tracking-[-0.02em] text-[color:var(--bjork-text)]">
            Gallery card
          </p>
          <span className="text-sm font-medium text-[color:var(--bjork-text-soft)]">bjork</span>
        </div>
      </BjorkCard>
    ),
    previewClassName: "min-h-[260px]",
    code: `<BjorkCard
  variant="interactive"
  padding="sm"
  role="button"
  tabIndex={0}
>
  <PreviewImage />
  <BjorkCardFooter>Open component</BjorkCardFooter>
</BjorkCard>`,
  },
  {
    label: "Header anatomy",
    description: "Header, title, description, content, and footer are separate so dense product cards stay aligned.",
    preview: (
      <BjorkCard variant="elevated" padding="lg" className="w-full max-w-[300px]">
        <BjorkCardHeader>
          <div className="space-y-2">
            <BjorkCardTitle>Archive pulse</BjorkCardTitle>
            <BjorkCardDescription>
              Weekly component activity.
            </BjorkCardDescription>
          </div>
          <BjorkBadge variant="accent">Live</BjorkBadge>
        </BjorkCardHeader>
        <BjorkCardContent>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["42", "Copies"],
              ["18", "Saves"],
              ["7.4k", "Views"],
            ].map(([value, label]) => (
              <div key={label} className="rounded-[13px] bg-[var(--bjork-field-inset)] p-2 shadow-[var(--bjork-shadow-inset)]">
                <div className="font-mono text-base tabular-nums text-[color:var(--bjork-text)]">{value}</div>
                <div className="text-[11px] text-[color:var(--bjork-text-soft)]">{label}</div>
              </div>
            ))}
          </div>
        </BjorkCardContent>
        <BjorkCardFooter>
          <BjorkButton size="sm" variant="outline">
            View report
            <ArrowRight aria-hidden="true" />
          </BjorkButton>
        </BjorkCardFooter>
      </BjorkCard>
    ),
    previewClassName: "min-h-[320px]",
    code: `<BjorkCardHeader>
  <div>
    <BjorkCardTitle>Archive pulse</BjorkCardTitle>
    <BjorkCardDescription>
      Weekly component activity.
    </BjorkCardDescription>
  </div>
  <BjorkBadge variant="accent">Live</BjorkBadge>
</BjorkCardHeader>`,
  },
] satisfies readonly PrimitivePreviewExample[];

function CardDocs() {
  return (
    <>
      <PrimitiveDocsSection title="Props">
        <PrimitivePropTable
          rows={[
            {
              name: "variant",
              value: "surface | elevated | quiet | interactive",
              description: "Controls depth and hover behavior. Interactive adds pointer treatment and motion.",
            },
            {
              name: "padding",
              value: "none | sm | md | lg",
              description: "Keeps repeated cards aligned without custom wrapper spacing.",
            },
            {
              name: "role",
              value: "HTML role",
              description: "Set role='button' when the full card is clickable so motion and accessibility agree.",
            },
            {
              name: "slots",
              value: "Header | Title | Description | Content | Footer",
              description: "Use the slots to keep typography, gaps, and action placement consistent.",
            },
          ]}
        />
      </PrimitiveDocsSection>
    </>
  );
}

export default function Page() {
  const item = getGalleryItem("primitive-card");
  const meta = getPrimitiveMeta("card");

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
      details={<CardDocs />}
      previewLayout="list"
    >
      <PrimitivePreviewExamples examples={cardExamples} />
    </SimpleComponentDemoPage>
  );
}
