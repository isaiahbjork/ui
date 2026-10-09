"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ShellActions,
  ShellRange,
  ShellSwitch,
  SimpleComponentDemoPage,
} from "@/components/bjork-ui/component-demo-shell";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { TornEdgeReveal, type TornEdge } from "@/components/bjork-ui/galleries/torn-edge-reveal";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("torn-edge-reveal");

const EDGE_TOGGLES: { edge: TornEdge; label: string }[] = [
  { edge: "top", label: "Top" },
  { edge: "right", label: "Right" },
  { edge: "bottom", label: "Bottom" },
  { edge: "left", label: "Left" },
];

const DEFAULT_SEED = "bjork";
const DEFAULT_DEPTH = 0.6;
const DEFAULT_HERO_EDGES: TornEdge[] = ["bottom"];

function newSeedKey() {
  return Math.random().toString(36).slice(2, 8);
}

function Pieces({
  preview,
  seedKey,
  depth,
  heroEdges,
}: {
  preview: boolean;
  seedKey: string;
  depth: number;
  heroEdges: TornEdge[];
}) {
  // The preview pose is static: no reveal and fixed seeds, so the capture is deterministic.
  const reveal = preview ? "none" : "tear";
  const seed = (name: string) => (preview ? name : `${seedKey}-${name}`);

  return (
    <div className="flex w-[min(860px,calc(100vw-56px))] max-w-full flex-col items-center gap-10 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-5">
      <TornEdgeReveal
        seed={seed("ember")}
        edges={heroEdges}
        tearDepth={depth}
        reveal={reveal}
        className="w-full max-w-[200px] sm:w-[200px] sm:shrink-0"
      >
        <div className="relative aspect-[4/5] w-full">
          <Image src="/images/plates/plate-03.webp" alt="" fill priority sizes="200px" className="object-cover" />
        </div>
      </TornEdgeReveal>

      <TornEdgeReveal
        seed={seed("paper")}
        edges={["top", "right"]}
        tearDepth={depth}
        reveal={reveal}
        className="w-full max-w-[220px] sm:w-[220px] sm:shrink-0"
      >
        <div className="relative aspect-[4/3] w-full">
          <Image src="/images/plates/plate-05.webp" alt="" fill priority sizes="220px" className="object-cover" />
        </div>
      </TornEdgeReveal>

      <TornEdgeReveal
        seed={seed("field")}
        edges={["left"]}
        tearDepth={depth}
        reveal={reveal}
        className="w-full max-w-[220px] sm:w-[220px] sm:shrink-0"
      >
        <div className="flex min-h-[240px] flex-col justify-between bg-[color:var(--bjork-surface,#121212)] p-6">
          <p className="font-bjork-display text-[28px] leading-[1.1] text-[color:var(--bjork-text,#ededed)]">
            Field notes
          </p>
          <p className="mt-6 whitespace-nowrap font-mono text-[12px] text-[color:var(--bjork-text-muted,rgba(237,237,237,0.52))]">
            08.10.26 · plate study
          </p>
        </div>
      </TornEdgeReveal>
    </div>
  );
}

export default function Page() {
  const isPreview = usePreviewMode();
  const [seedKey, setSeedKey] = useState(DEFAULT_SEED);
  const [depth, setDepth] = useState(DEFAULT_DEPTH);
  const [heroEdges, setHeroEdges] = useState<TornEdge[]>(DEFAULT_HERO_EDGES);

  const toggleHeroEdge = (edge: TornEdge, on: boolean) =>
    setHeroEdges((current) =>
      on ? [...current.filter((e) => e !== edge), edge] : current.filter((e) => e !== edge),
    );

  const reset = () => {
    setSeedKey(DEFAULT_SEED);
    setDepth(DEFAULT_DEPTH);
    setHeroEdges(DEFAULT_HERO_EDGES);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Any image or card gets a hand-torn paper edge, generated from a seed. The tear rips in once and holds."
      usageCode={`import { TornEdgeReveal } from "@/components/bjork-ui/galleries/torn-edge-reveal";

<TornEdgeReveal seed="ember" edges={["bottom"]} tearDepth={0.6} reveal="tear">
  <div className="relative aspect-[4/5] w-full">
    <Image src="/plate.webp" alt="" fill className="object-cover" />
  </div>
</TornEdgeReveal>`}
      previewScaleClassName="w-[360px]"
      previewCaptureScaleClassName="w-[860px]"
      optionsDefaultOpen={false}
      onReset={reset}
      controls={
        <>
          <ShellActions>
            <BjorkButton variant="secondary" size="sm" onClick={() => setSeedKey(newSeedKey())}>
              Re-roll seed
            </BjorkButton>
          </ShellActions>
          <ShellRange
            label="Depth"
            value={depth}
            min={0.2}
            max={1}
            step={0.05}
            displayValue={depth.toFixed(2)}
            onChange={setDepth}
          />
          {EDGE_TOGGLES.map(({ edge, label }) => (
            <ShellSwitch
              key={edge}
              label={`${label} edge`}
              checked={heroEdges.includes(edge)}
              onCheckedChange={(on) => toggleHeroEdge(edge, on)}
            />
          ))}
        </>
      }
    >
      <div className="flex w-[min(860px,calc(100vw-56px))] max-w-full flex-col items-center gap-8">
        <Pieces preview={isPreview} seedKey={seedKey} depth={depth} heroEdges={heroEdges} />
      </div>
    </SimpleComponentDemoPage>
  );
}
