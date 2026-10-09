"use client";

import { useState } from "react";
import { SimpleComponentDemoPage, ShellSegmented } from "@/components/bjork-ui/component-demo-shell";
import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { LiquidText } from "@/components/bjork-ui/text/liquid-text";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("liquid-text");

const words = ["Liquid", "Mercury", "Viscous"] as const;
const viscosities = [
  { label: "runny", value: 0.15 },
  { label: "syrup", value: 0.55 },
  { label: "tar", value: 0.9 },
] as const;
const trails = [4, 8, 10] as const;

export default function LiquidTextDemo() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const tone = previewTheme === "light" || previewTheme === "dark" ? previewTheme : undefined;

  const [word, setWord] = useState<(typeof words)[number]>("Liquid");
  const [viscosity, setViscosity] = useState<number>(0.55);
  const [trail, setTrail] = useState<number>(8);

  const reset = () => {
    setWord("Liquid");
    setViscosity(0.55);
    setTrail(8);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Type as a viscous surface. Drag across a letter and a sprung trail of blobs pulls a bead of ink off it; let go and surface tension snaps it back into the stroke. Rendered from a signed distance field in a raw WebGL2 shader."
      usageCode={`import { LiquidText } from "@/components/bjork-ui/text/liquid-text";

<LiquidText
  text="Liquid"
  viscosity={0.55}   // 0 runny, 1 thick
  trailLength={8}    // 2 to 10 sprung blobs
  blobRadius={32}    // CSS px, defaults to 15% of the font size
  fontWeight={700}
  tone="dark"
/>`}
      previewScaleClassName="w-[360px]"
      previewCaptureScaleClassName="w-[860px] scale-[1]"
      optionsDefaultOpen={false}
      onReset={reset}
      controls={
        <>
          <ShellSegmented
            label="Word"
            value={word}
            options={words.map((value) => ({ value, label: value }))}
            onChange={setWord}
          />
          <ShellSegmented
            label="Viscous"
            value={viscosity}
            options={viscosities.map((v) => ({ value: v.value, label: v.label }))}
            onChange={setViscosity}
          />
          <ShellSegmented
            label="Trail"
            value={trail}
            options={trails.map((value) => ({ value, label: `${value} blobs` }))}
            onChange={setTrail}
          />
        </>
      }
    >
      <div className="flex w-[min(860px,calc(100vw-72px))] flex-col items-center gap-6">
        <LiquidText
          text={isPreview ? "Liquid" : word}
          viscosity={viscosity}
          trailLength={trail}
          tone={tone}
          frozen={isPreview}
        />
      </div>
    </SimpleComponentDemoPage>
  );
}
