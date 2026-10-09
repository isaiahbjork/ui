"use client";

import {
  MarketingCtaFooter,
  MARKETING_CTA_FOOTER_SAMPLE,
} from "@/components/bjork-ui/blocks/marketing-cta-footer";
import { MarketingBlockDemo } from "@/components/marketing-block-demo";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export default function MarketingCtaFooterDemo() {
  return (
    <MarketingBlockDemo
      slug="marketing-cta-footer"
      description="The end of a landing page in one block: a closing call to action with an install command you can copy, then the footer with link columns, a newsletter form that validates and confirms, a live status pill, legal links and the brand name drawn large across the bottom edge."
      usageCode={`import {
  MarketingCtaFooter,
  MARKETING_CTA_FOOTER_SAMPLE,
} from "@/components/bjork-ui/blocks/marketing-cta-footer";

<MarketingCtaFooter
  {...MARKETING_CTA_FOOTER_SAMPLE}
  cta={{
    title: "Your next incident is already in a trace.",
    primary: { label: "Start tracing free", href: "/signup" },
    command: "npm install @tracewell/sdk",
  }}
  newsletter={{
    label: "Field notes",
    onSubscribe: async (email) => {
      const res = await fetch("/api/subscribe", { method: "POST", body: JSON.stringify({ email }) });
      if (!res.ok) throw new Error("That did not go through. Try again.");
    },
  }}
/>`}
      note="The newsletter form validates before calling `onSubscribe`; throw an Error from it to show your own message. Errors and the success state are announced to screen readers, and the copy button confirms through a live region. Set `wordmark` to false to drop the oversized brand name."
      previewOffset={30}
      render={({ isPreview }) => (
        <MarketingCtaFooter
          {...MARKETING_CTA_FOOTER_SAMPLE}
          animate={!isPreview}
          newsletter={{ ...MARKETING_CTA_FOOTER_SAMPLE.newsletter!, onSubscribe: () => wait(700) }}
        />
      )}
    />
  );
}
