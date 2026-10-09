"use client";

import { useState } from "react";
import { SimpleComponentDemoPage, ShellSegmented, ShellSwitch } from "@/components/bjork-ui/component-demo-shell";
import {
  PlaneType,
  type PlaneTypePointerSource,
  type PlaneTypeVariant,
} from "@/components/bjork-ui/text/plane-type";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("plane-type");

const HERO = ["MOTION", "IS A", "MATERIAL"];
const SECOND = ["DEPTH IS", "HIERARCHY"];

export default function Page() {
  const isPreview = usePreviewMode();
  const [variant, setVariant] = useState<PlaneTypeVariant>("mixed");
  const [depth, setDepth] = useState("48");
  const [tilt, setTilt] = useState("8");
  const [knockout, setKnockout] = useState(false);
  const [pointerSource, setPointerSource] = useState<PlaneTypePointerSource>("self");

  const reset = () => {
    setVariant("mixed");
    setDepth("48");
    setTilt("8");
    setKnockout(false);
    setPointerSource("self");
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Display type set as overlapping planes in space. Lines slide past each other as you move."
      usageCode={`<PlaneType
  lines={["MOTION", "IS A", "MATERIAL"]}
  variant="mixed"
  skew={1.2}
/>

<PlaneType
  lines={["DEPTH IS", "HIERARCHY"]}
  align="center"
  knockout
  pointerSource="window"
/>`}
      previewScaleClassName="w-[360px]"
      previewCaptureScaleClassName="w-[560px] scale-[1.3]"
      optionsDefaultOpen={false}
      onReset={reset}
      controls={
        <>
          <ShellSegmented
            label="Depth"
            value={depth}
            options={[
              { value: "24", label: "24" },
              { value: "48", label: "48" },
              { value: "96", label: "96" },
            ]}
            onChange={setDepth}
          />
          <ShellSegmented
            label="Tilt"
            value={tilt}
            options={[
              { value: "4", label: "4" },
              { value: "8", label: "8" },
              { value: "14", label: "14" },
            ]}
            onChange={setTilt}
          />
          <ShellSegmented
            label="Variant"
            value={variant}
            options={[
              { value: "solid", label: "Solid" },
              { value: "mixed", label: "Mixed" },
              { value: "outline", label: "Outline" },
            ]}
            onChange={(value) => setVariant(value as PlaneTypeVariant)}
          />
          <ShellSegmented
            label="Pointer"
            value={pointerSource}
            options={[
              { value: "self", label: "Self" },
              { value: "window", label: "Window" },
              { value: "scroll", label: "Scroll" },
              { value: "none", label: "None" },
            ]}
            onChange={(value) => setPointerSource(value as PlaneTypePointerSource)}
          />
          <ShellSwitch label="Knockout" checked={knockout} onCheckedChange={setKnockout} />
        </>
      }
    >
      {isPreview ? (
        <PlaneType
          lines={HERO}
          variant="mixed"
          skew={1.2}
          pointerSource="none"
          pose={{ x: 0.45, y: -0.3 }}
        />
      ) : (
        <div className="flex w-[min(820px,calc(100vw-56px))] min-w-0 flex-col gap-10">
          <PlaneType
            lines={HERO}
            variant={variant}
            depth={Number(depth)}
            tilt={Number(tilt)}
            skew={1.2}
            knockout={knockout}
            pointerSource={pointerSource}
          />
          <PlaneType lines={SECOND} align="center" knockout size="clamp(40px, 7vw, 104px)" pointerSource={pointerSource} />
        </div>
      )}
    </SimpleComponentDemoPage>
  );
}
