"use client";

import type { AgentStep } from "@/components/bjork-ui/ai/agent-trace";
import {
  MarketingHeroProduct,
  MARKETING_HERO_SAMPLE,
} from "@/components/bjork-ui/blocks/marketing-hero-product";
import { MarketingBlockDemo } from "@/components/marketing-block-demo";

// A frozen trace for the gallery screenshot, so the captured frame never changes.
const POSE = 1_700_000_000_000;
const POSED_STEPS: AgentStep[] = [
  { id: "parse", kind: "think", label: "Read refund request", status: "done", durationMs: 600 },
  { id: "lookup", kind: "tool", label: "Look up order #4471", status: "done", durationMs: 1400 },
  { id: "policy", kind: "search", label: 'Search policy: "damaged on arrival"', status: "done", durationMs: 1900 },
  { id: "refund", kind: "tool", label: "Issue partial refund", status: "done", durationMs: 5200 },
  { id: "reply", kind: "think", label: "Draft reply to customer", status: "active", startedAt: POSE - 1300 },
  { id: "send", kind: "tool", label: "Send reply", status: "pending" },
];

export default function MarketingHeroProductDemo() {
  return (
    <MarketingBlockDemo
      slug="marketing-hero-product"
      description="A landing-page hero with a product shot that is actually alive. The header, announcement, headline and calls to action sit over an app window playing a real agent trace, with recent runs and health metrics around it. It reads its own width, so it works full-bleed or inside a column, and folds to a single column on phones."
      usageCode={`import {
  MarketingHeroProduct,
  MARKETING_HERO_SAMPLE,
} from "@/components/bjork-ui/blocks/marketing-hero-product";

export default function Home() {
  return (
    <MarketingHeroProduct
      {...MARKETING_HERO_SAMPLE}
      title="See every step your agents take."
      primaryCta={{ label: "Start tracing free", href: "/signup" }}
      // Swap the built-in window for your own screenshot:
      // media={<img src="/product.png" alt="The Tracewell run view" />}
    />
  );
}`}
      note="Copy is all props. Leave out `nav` (or pass an empty array) to drop the header when your site already has one, and set `headingLevel` to h2 when the hero is not the first heading on the page. Under reduced motion the window and text fade in without moving."
      previewOffset={170}
      render={({ isPreview }) => (
        <MarketingHeroProduct
          {...MARKETING_HERO_SAMPLE}
          animate={!isPreview}
          shot={
            isPreview
              ? { ...MARKETING_HERO_SAMPLE.shot!, steps: POSED_STEPS, now: POSE }
              : MARKETING_HERO_SAMPLE.shot
          }
        />
      )}
    />
  );
}
