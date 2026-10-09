"use client";

import { useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { Beeswarm, createSwarmItems, type SwarmBand } from "@/components/bjork-ui/charts/beeswarm";
import { formatCompact } from "@/components/bjork-ui/charts/_kit/scale";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { ControlRow, DemoColumn, OptionGroup } from "../_demo/controls";

const item = getGalleryItem("beeswarm");
const EDGE = createSwarmItems(31, "edge");
const DEALS = createSwarmItems(32, "deals");
const EDGE_BANDS: SwarmBand[] = [
  { to: 0, label: "No edge", style: "hatch" },
  { from: 2, label: "Edge ≥ 2%", style: "accent" },
];
const EDGE_DOMAIN: [number, number] = [-4, 8];
const formatEdge = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`;
const formatDeal = (v: number) => `$${formatCompact(v, 0)}`;

export default function Page() {
  const isPreview = usePreviewMode();
  const [kind, setKind] = useState<"edge" | "deals">("edge");
  const [scale, setScale] = useState<"linear" | "log">("log");

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Every observation as its own dot, packed beside its neighbours so none overlap and the shape of the data shows through. Dots rain in by value and settle. Bands mark regions to discount or the verdict region, and hover finds the nearest dot, not just the one under the pointer."
      dependencies={["framer-motion"]}
      usageCode={`import { Beeswarm } from "@/components/bjork-ui/charts/beeswarm";

<Beeswarm
  items={bets.map((b) => ({ id: b.id, value: b.edge, label: b.name }))}
  bands={[
    { to: 0, label: "No edge", style: "hatch" },
    { from: 2, label: "Edge ≥ 2%", style: "accent" },
  ]}
  formatValue={(v) => \`\${v.toFixed(1)}%\`}
/>`}
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[780px] scale-[1.08]"
    >
      {isPreview ? (
        <div className="w-[740px]">
          <Beeswarm items={EDGE} domain={EDGE_DOMAIN} bands={EDGE_BANDS} highlightId="b17" radius={5} formatValue={formatEdge} height={360} ariaLabel="Edge of placed bets" />
        </div>
      ) : (
        <DemoColumn width={820}>
          {kind === "edge" ? (
            <Beeswarm key="edge" items={EDGE} domain={EDGE_DOMAIN} bands={EDGE_BANDS} highlightId="b17" formatValue={formatEdge} height={320} ariaLabel="Edge of placed bets" />
          ) : (
            <Beeswarm key="deals" items={DEALS} scale={scale} formatValue={formatDeal} height={320} ariaLabel="Deal size" />
          )}
          <ControlRow>
            <OptionGroup
              label="Dataset"
              value={kind}
              onChange={setKind}
              options={[
                { label: "Bet edge", value: "edge" },
                { label: "Deal size", value: "deals" },
              ]}
            />
            {kind === "deals" && (
              <OptionGroup
                label="Scale"
                value={scale}
                onChange={setScale}
                options={[
                  { label: "Log", value: "log" },
                  { label: "Linear", value: "linear" },
                ]}
              />
            )}
          </ControlRow>
        </DemoColumn>
      )}
    </SimpleComponentDemoPage>
  );
}
