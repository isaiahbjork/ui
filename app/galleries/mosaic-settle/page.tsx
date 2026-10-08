"use client";

import { useRef, useState } from "react";
import { ShellSegmented, SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { MosaicSettle } from "@/components/bjork-ui/galleries/mosaic-settle";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("mosaic-settle");

// Demo plates generated for the library (Wave 0), never borrowed art.
const PLATES = [
  "/images/plates/plate-01.webp",
  "/images/plates/plate-02.webp",
  "/images/plates/plate-03.webp",
  "/images/plates/plate-04.webp",
  "/images/plates/plate-05.webp",
  "/images/plates/plate-06.webp",
];
const PLATE_ALTS = ["Dusk dune plate", "Concrete plate", "Ember plate", "Tide plate", "Paper plate", "Signal plate"];

type PaletteName = "ember" | "ocean" | "mono";
type MechanicName = "organic" | "sweep";

export default function Page() {
  const isPreview = usePreviewMode();
  const attract = usePreviewSearchParam("attract") === "1";
  const [pending, setPending] = useState(false);
  const [palette, setPalette] = useState<PaletteName>("ember");
  const [mechanic, setMechanic] = useState<MechanicName>("organic");
  const [plate, setPlate] = useState("01");
  const [log, setLog] = useState("No callbacks yet");
  const replayTimer = useRef(0);

  const plateIndex = Math.max(0, Number(plate) - 1);

  const replay = () => {
    setPending(true);
    window.clearTimeout(replayTimer.current);
    replayTimer.current = window.setTimeout(() => setPending(false), 1400);
  };

  const details = (
    <div className="flex flex-col gap-3">
      <ShellSegmented
        label="Palette"
        value={palette}
        options={[
          { value: "ember", label: "Ember" },
          { value: "ocean", label: "Ocean" },
          { value: "mono", label: "Mono" },
        ]}
        onChange={(v) => setPalette(v as PaletteName)}
      />
      <ShellSegmented
        label="Mechanic"
        value={mechanic}
        options={[
          { value: "organic", label: "Organic" },
          { value: "sweep", label: "Sweep" },
        ]}
        onChange={(v) => setMechanic(v as MechanicName)}
      />
      <ShellSegmented
        label="Plate"
        value={plate}
        options={PLATES.map((_, i) => ({ value: String(i + 1).padStart(2, "0"), label: String(i + 1).padStart(2, "0") }))}
        onChange={setPlate}
      />
      <div className="flex items-center justify-between gap-3">
        {/* tabIndex is explicit so server and client render the same attribute under reduced motion (shared BjorkButton issue). */}
        <BjorkButton variant="outline" size="sm" tabIndex={0} onClick={replay}>
          Replay
        </BjorkButton>
        <span className="font-mono text-[12px] text-[color:var(--bjork-text-muted)]">{log}</span>
      </div>
    </div>
  );

  return (
    <SimpleComponentDemoPage
      item={item}
      description="An image frame that owns its loading state. A churning mosaic resolves cell by cell into the photo, then gets out of the way."
      usageCode={`<MosaicSettle
  src="/images/plates/plate-01.webp"
  alt="Dusk dune plate"
  caption="Plate 01"
  pending={loading}
  palette="ember"
  mechanic="sweep"
  onSettled={() => console.log("settled")}
  onError={() => console.log("failed")}
/>`}
      details={details}
      previewScaleClassName="w-[420px]"
      previewCaptureScaleClassName="w-[560px]"
    >
      {isPreview ? (
        <MosaicSettle src={PLATES[0]} alt={PLATE_ALTS[0]} pending={false} palette="ember" />
      ) : (
        <div className="w-[min(560px,calc(100vw-56px))] min-w-0">
          <MosaicSettle
            src={PLATES[plateIndex]}
            srcList={PLATES}
            alt={PLATE_ALTS[plateIndex]}
            caption={`Plate ${plate}`}
            pending={pending}
            palette={palette}
            mechanic={mechanic}
            attract={attract}
            onSettled={() => setLog("onSettled fired")}
            onError={() => setLog("onError fired")}
          />
        </div>
      )}
    </SimpleComponentDemoPage>
  );
}
