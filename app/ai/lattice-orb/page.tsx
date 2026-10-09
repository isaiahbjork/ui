"use client";

import { useState } from "react";
import { ShellActions, ShellSegmented, SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { LatticeOrb, type LatticeOrbHit, type OrbState } from "@/components/bjork-ui/ai/lattice-orb";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("lattice-orb");

const STATES: { value: OrbState; label: string }[] = [
  { value: "idle", label: "Idle" },
  { value: "searching", label: "Searching" },
  { value: "connecting", label: "Connecting" },
  { value: "composing", label: "Composing" },
  { value: "error", label: "Error" },
];

// Four fixed hits, so the preview pose is the same on every run.
const PREVIEW_HITS: LatticeOrbHit[] = [
  { lat: 0.35, lon: 0.6 },
  { lat: -0.2, lon: 2.1 },
  { lat: 0.1, lon: 3.4 },
  { lat: -0.4, lon: 5.0 },
];

// Hit n is placed by its index, so repeated "Add hit" presses never repeat a position.
function hitForIndex(n: number): LatticeOrbHit {
  return { lat: Math.sin(n * 1.7) * 0.7, lon: (n * 2.399963) % (Math.PI * 2) };
}

const SMALL_ORBS: { value: OrbState; label: string }[] = [
  { value: "connecting", label: "Connecting" },
  { value: "composing", label: "Composing" },
  { value: "error", label: "Error" },
];

export default function Page() {
  const isPreview = usePreviewMode();
  const [state, setState] = useState<OrbState>("searching");
  const [hits, setHits] = useState<LatticeOrbHit[]>([]);

  const demo = isPreview ? (
    <LatticeOrb state="searching" hits={PREVIEW_HITS} size={320} time={1.4} />
  ) : (
    <div className="flex w-[min(420px,calc(100vw-56px))] flex-col items-center gap-7">
      <LatticeOrb state={state} hits={hits} size={320} />

      <div className="flex items-start justify-center gap-6">
        {SMALL_ORBS.map((option) => (
          <LatticeOrb key={option.value} state={option.value} size={72} label={option.label} showCaption={false} />
        ))}
      </div>
    </div>
  );

  return (
    <SimpleComponentDemoPage
      item={item}
      description="One dot lattice that shows what an agent is doing. The dots keep their identity as the state changes."
      usageCode={`<LatticeOrb
  state="searching"
  hits={[{ lat: 0.35, lon: 0.6 }, { lat: -0.2, lon: 2.1 }]}
  size={240}
/>

// Posed, with no loop
<LatticeOrb state="connecting" time={1.4} />`}
      previewScaleClassName="w-[340px]"
      previewCaptureScaleClassName="w-[760px] scale-[1.2]"
      onReset={() => {
        setState("searching");
        setHits([]);
      }}
      controls={
        <>
          <ShellSegmented
            label="State"
            value={state}
            options={STATES}
            onChange={(value) => setState(value as OrbState)}
          />
          <ShellActions>
            <BjorkButton variant="secondary" size="sm" onClick={() => setHits((prev) => [...prev, hitForIndex(prev.length)])}>
              Add hit
            </BjorkButton>
            <BjorkButton variant="ghost" size="sm" disabled={hits.length === 0} onClick={() => setHits([])}>
              Clear hits
            </BjorkButton>
          </ShellActions>
        </>
      }
    >
      {demo}
    </SimpleComponentDemoPage>
  );
}
