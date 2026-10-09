"use client";

import {
  MarketingFeatureBento,
  MARKETING_BENTO_SAMPLE,
} from "@/components/bjork-ui/blocks/marketing-feature-bento";
import { MarketingBlockDemo } from "@/components/marketing-block-demo";

export default function MarketingFeatureBentoDemo() {
  return (
    <MarketingBlockDemo
      slug="marketing-feature-bento"
      description="A feature section on a bento grid where every card explains itself. The illustrations are built from your content, not images: a trace waterfall with the slow span called out, a replay scrubber, a stack of alerts, a cost histogram, an install snippet, keyboard shortcuts and a masked log line. Six columns on desktop, two on tablets, one on phones."
      usageCode={`import {
  MarketingFeatureBento,
  type BentoFeature,
} from "@/components/bjork-ui/blocks/marketing-feature-bento";

const features: BentoFeature[] = [
  {
    id: "traces",
    size: "lg",
    title: "Live traces, span by span",
    description: "Every model call and tool lands on one timeline.",
    visual: {
      type: "waterfall",
      total: 10,
      spans: [
        { label: "lookup_order", start: 0, duration: 1.2 },
        { label: "issue_refund", start: 1.2, duration: 4.6, slow: true },
      ],
    },
  },
  {
    id: "install",
    title: "Two lines to install",
    description: "Wraps the SDK you already use.",
    visual: { type: "code", filename: "agent.ts", lines: ['trace.init({ project: "support" });'] },
  },
];

<MarketingFeatureBento
  eyebrow="Platform"
  title="Everything between the prompt and the answer."
  features={features}
/>`}
      note="Sizes sit on a six-column grid: sm is a third, md a half, lg two thirds. Keep each row adding up to six. Illustrations are decorative and hidden from screen readers; the card title and description carry the meaning. Pass `href` on a feature to make the whole card a link."
      previewOffset={60}
      render={({ isPreview }) => <MarketingFeatureBento {...MARKETING_BENTO_SAMPLE} animate={!isPreview} />}
    />
  );
}
