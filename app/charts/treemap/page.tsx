"use client";

import { useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage, ShellSegmented } from "@/components/bjork-ui/component-demo-shell";
import { Treemap, type TreeNode } from "@/components/bjork-ui/charts/treemap";
import { mulberry32 } from "@/components/bjork-ui/_core/random";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { DemoColumn } from "../_demo/controls";

const item = getGalleryItem("treemap");

// A made-up portfolio: sectors and holdings with seeded weights and daily change.
const SECTORS: [string, string[]][] = [
  ["Technology", ["Northwind Systems", "Helix Compute", "Quanta Cloud", "Arc Devices", "Lumen Software", "Vector AI"]],
  ["Healthcare", ["Meridian Bio", "Cobalt Health", "Pulse Labs", "Atlas Pharma"]],
  ["Financials", ["Harbor Bank", "Keystone Pay", "Summit Capital", "Ledgerline"]],
  ["Energy", ["Solace Power", "Tidewater Oil", "Crest Renewables"]],
  ["Consumer", ["Juniper Goods", "Orchard Foods", "Kite Apparel", "Basil Home"]],
  ["Industrials", ["Forge Works", "Railhead", "Granite Build"]],
];

function buildPortfolio(seed: number): TreeNode {
  const rnd = mulberry32(seed);
  return {
    id: "root",
    label: "Portfolio",
    children: SECTORS.map(([sector, names], si) => ({
      id: sector.toLowerCase(),
      label: sector,
      children: names.map((name, i) => ({
        id: `${si}-${i}`,
        label: name,
        value: Math.round((0.2 + rnd() * rnd() * 3) * (si === 0 ? 2.2 : 1) * 1_000_000),
        change: (rnd() - 0.46) * 0.06 + (si === 3 ? -0.012 : si === 0 ? 0.008 : 0),
      })),
    })),
  };
}

const DATA = buildPortfolio(44);

export default function Page() {
  const isPreview = usePreviewMode();
  const [colorBy, setColorBy] = useState<"change" | "value">("change");

  const reset = () => {
    setColorBy("change");
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Squarified tiles, sized by value and coloured by change: accent for gains and blue for losses, both stronger with size of move and fading to the background at zero. Click a sector or press Enter to zoom in, and every tile glides to its new place; Escape and the breadcrumbs zoom back out. Labels only appear where they fit, and a tile too small for its number keeps a minus bar when it fell."
      dependencies={["framer-motion"]}
      usageCode={`import { Treemap } from "@/components/bjork-ui/charts/treemap";

<Treemap
  data={{
    id: "root",
    label: "Portfolio",
    children: [
      { id: "tech", label: "Technology", children: [{ id: "nw", label: "Northwind", value: 4_200_000, change: 0.018 }] },
    ],
  }}
/>`}
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[760px] scale-[1.08]"
      optionsDefaultOpen={false}
      onReset={reset}
      controls={
        <ShellSegmented
          label="Colour"
          value={colorBy}
          onChange={setColorBy}
          options={[
            { label: "Change", value: "change" },
            { label: "Value", value: "value" },
          ]}
        />
      }
    >
      {isPreview ? (
        <div className="w-[720px]">
          <Treemap data={DATA} height={420} activeId="0-4" ariaLabel="Portfolio by sector" />
        </div>
      ) : (
        <DemoColumn width={860}>
          <Treemap data={DATA} colorBy={colorBy} height={440} ariaLabel="Portfolio by sector" />
        </DemoColumn>
      )}
    </SimpleComponentDemoPage>
  );
}
