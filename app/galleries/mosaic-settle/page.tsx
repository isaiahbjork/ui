"use client";

import { useEffect, useRef, useState } from "react";
import { ShellSegmented, SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { MosaicSettle } from "@/components/bjork-ui/galleries/mosaic-settle";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("mosaic-settle");

// Demo plates generated for the library (Wave 0), never borrowed art.
const PLATES = [
  { src: "/images/plates/plate-01.webp", alt: "Dusk dune plate" },
  { src: "/images/plates/plate-02.webp", alt: "Concrete plate" },
  { src: "/images/plates/plate-03.webp", alt: "Ember plate" },
  { src: "/images/plates/plate-04.webp", alt: "Tide plate" },
];
const SRC_LIST = PLATES.map((plate) => plate.src);
// Preview pose: 1 and 2 settled, 3 frozen mid-settle, 4 a static churn frame.
const PREVIEW_PROGRESS: (number | undefined)[] = [undefined, undefined, 0.55, 0];
const PENDING_MS = 1800;
const STAGGER_MS = 150;

type PaletteName = "ember" | "ocean" | "mono";
type MechanicName = "organic" | "sweep";

export default function Page() {
  const isPreview = usePreviewMode();
  const attract = usePreviewSearchParam("attract") === "1";
  const [pending, setPending] = useState([false, false, false, false]);
  const [palette, setPalette] = useState<PaletteName>("ember");
  const [mechanic, setMechanic] = useState<MechanicName>("organic");
  const [cellSize, setCellSize] = useState("14");
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  // All four go pending for 1.8s, then settle 150ms apart.
  const regenerate = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    setPending([true, true, true, true]);
    timers.current = PLATES.map((_, i) =>
      window.setTimeout(() => {
        setPending((prev) => prev.map((value, j) => (j === i ? false : value)));
      }, PENDING_MS + i * STAGGER_MS),
    );
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
        label="Cell size"
        value={cellSize}
        options={[
          { value: "8", label: "8" },
          { value: "14", label: "14" },
          { value: "24", label: "24" },
        ]}
        onChange={setCellSize}
      />
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
/>`}
      details={details}
      // The grid already sizes itself to the viewport, so the phone fit must not shrink it again.
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[920px] scale-[0.8]"
    >
      <div className="flex w-[min(640px,calc(100vw-56px))] min-w-0 flex-col items-center gap-5">
        <div className="grid w-full grid-cols-2 gap-3">
          {PLATES.map((plate, i) => (
            <MosaicSettle
              key={plate.src}
              src={plate.src}
              alt={plate.alt}
              caption={`Plate 0${i + 1}`}
              pending={isPreview ? false : pending[i]}
              progress={isPreview ? PREVIEW_PROGRESS[i] : undefined}
              palette={palette}
              mechanic={mechanic}
              cellSize={Number(cellSize)}
              srcList={i === 0 ? SRC_LIST : undefined}
              attract={attract && i === 0}
            />
          ))}
        </div>
        {!isPreview ? (
          <BjorkButton variant="outline" size="sm" onClick={regenerate}>
            Regenerate
          </BjorkButton>
        ) : null}
      </div>
    </SimpleComponentDemoPage>
  );
}
