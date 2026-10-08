"use client";

import { useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { SankeyFlow, type SankeyLink, type SankeyNode } from "@/components/bjork-ui/charts/sankey-flow";
import { formatCompact } from "@/components/bjork-ui/charts/_kit/scale";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { ControlRow, DemoColumn, ToggleButton } from "../_demo/controls";

const item = getGalleryItem("sankey-flow");

// Illustrative signup funnel: source, then plan, then outcome.
const NODES: SankeyNode[] = [
  { id: "search", label: "Search" },
  { id: "social", label: "Social" },
  { id: "referral", label: "Referral" },
  { id: "direct", label: "Direct" },
  { id: "free", label: "Free trial" },
  { id: "pro", label: "Pro trial" },
  { id: "team", label: "Team demo" },
  { id: "paid", label: "Paid" },
  { id: "churned", label: "Churned" },
  { id: "active", label: "Still trialling" },
];
const LINKS: SankeyLink[] = [
  { source: "search", target: "free", value: 4200 },
  { source: "search", target: "pro", value: 1600 },
  { source: "search", target: "team", value: 300 },
  { source: "social", target: "free", value: 2900 },
  { source: "social", target: "pro", value: 500 },
  { source: "referral", target: "pro", value: 1300 },
  { source: "referral", target: "team", value: 700 },
  { source: "direct", target: "free", value: 900 },
  { source: "direct", target: "team", value: 600 },
  { source: "free", target: "paid", value: 1100 },
  { source: "free", target: "churned", value: 5200 },
  { source: "free", target: "active", value: 1700 },
  { source: "pro", target: "paid", value: 1900 },
  { source: "pro", target: "churned", value: 1100 },
  { source: "pro", target: "active", value: 400 },
  { source: "team", target: "paid", value: 1100 },
  { source: "team", target: "churned", value: 300 },
  { source: "team", target: "active", value: 200 },
];
const people = (v: number) => formatCompact(v, 1);

export default function Page() {
  const isPreview = usePreviewMode();
  const [flow, setFlow] = useState(false);

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Flows between stages, sized by volume and laid out to keep ribbons from crossing. Hover a node or a ribbon and its whole path, upstream and down, lights in the accent while everything else steps back. Turn on flow for marching dashes that pause offscreen and under reduced motion."
      dependencies={["framer-motion"]}
      usageCode={`import { SankeyFlow } from "@/components/bjork-ui/charts/sankey-flow";

<SankeyFlow
  nodes={[{ id: "search", label: "Search" }, { id: "paid", label: "Paid" }]}
  links={[{ source: "search", target: "paid", value: 1200 }]}
  flow
/>`}
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[760px] scale-[1.08]"
    >
      {isPreview ? (
        <div className="w-[720px]">
          <SankeyFlow nodes={NODES} links={LINKS} defaultHighlightId="pro" formatValue={people} height={400} ariaLabel="Signup funnel" />
        </div>
      ) : (
        <DemoColumn width={860}>
          <SankeyFlow nodes={NODES} links={LINKS} flow={flow} defaultHighlightId="pro" formatValue={people} height={420} ariaLabel="Signup funnel" />
          <ControlRow>
            <ToggleButton pressed={flow} onClick={() => setFlow((v) => !v)}>
              Flow
            </ToggleButton>
          </ControlRow>
        </DemoColumn>
      )}
    </SimpleComponentDemoPage>
  );
}
