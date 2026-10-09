"use client";

import {
  MarketingTestimonialsWall,
  MARKETING_TESTIMONIALS_SAMPLE,
} from "@/components/bjork-ui/blocks/marketing-testimonials-wall";
import { MarketingBlockDemo } from "@/components/marketing-block-demo";

export default function MarketingTestimonialsWallDemo() {
  return (
    <MarketingBlockDemo
      slug="marketing-testimonials-wall"
      description="A wall of customer quotes with the numbers that back them up. On wide screens the columns drift upward at slightly different speeds and stop the moment a pointer or focus lands on them; quotes with a metric get a headline figure. On phones it becomes a still list with a Show all control."
      usageCode={`import {
  MarketingTestimonialsWall,
  type Testimonial,
} from "@/components/bjork-ui/blocks/marketing-testimonials-wall";

const testimonials: Testimonial[] = [
  {
    id: "maya",
    quote: "The alert fires on the third retry and the trace shows which tool returned garbage.",
    name: "Maya Okafor",
    role: "Head of Support Engineering",
    company: "Northbay Outfitters",
    metric: { value: "41%", label: "fewer failed runs" },
  },
  // ...
];

<MarketingTestimonialsWall
  eyebrow="Customers"
  title="Teams ship agents with fewer surprises."
  stats={[{ value: "1,800", label: "teams tracing in production" }]}
  testimonials={testimonials}
  motion="drift" // or "static" for a still masonry wall
/>`}
      note="Drifting content carries a visible pause button, pauses on hover and keyboard focus, and turns into the static wall under reduced motion. The duplicate copy that closes the loop is hidden from screen readers and made inert, so every quote is read once."
      previewOffset={40}
      render={({ isPreview }) => (
        <MarketingTestimonialsWall {...MARKETING_TESTIMONIALS_SAMPLE} motion={isPreview ? "static" : "drift"} />
      )}
    />
  );
}
