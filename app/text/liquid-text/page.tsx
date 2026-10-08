"use client";

import { useState } from "react";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { BjorkButton, BjorkButtonGroup } from "@/components/bjork-ui/primitives";
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
    >
      <div className="flex w-[min(860px,calc(100vw-72px))] flex-col items-center gap-6">
        {!isPreview ? (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <BjorkButtonGroup aria-label="Word">
              {words.map((value) => (
                <BjorkButton
                  key={value}
                  size="sm"
                  variant={word === value ? "secondary" : "ghost"}
                  aria-pressed={word === value}
                  onClick={() => setWord(value)}
                >
                  {value}
                </BjorkButton>
              ))}
            </BjorkButtonGroup>
            <BjorkButtonGroup aria-label="Viscosity">
              {viscosities.map((v) => (
                <BjorkButton
                  key={v.label}
                  size="sm"
                  variant={viscosity === v.value ? "secondary" : "ghost"}
                  aria-pressed={viscosity === v.value}
                  onClick={() => setViscosity(v.value)}
                >
                  {v.label}
                </BjorkButton>
              ))}
            </BjorkButtonGroup>
            <BjorkButtonGroup aria-label="Trail length">
              {trails.map((value) => (
                <BjorkButton
                  key={value}
                  size="sm"
                  variant={trail === value ? "secondary" : "ghost"}
                  aria-pressed={trail === value}
                  onClick={() => setTrail(value)}
                >
                  {value} blobs
                </BjorkButton>
              ))}
            </BjorkButtonGroup>
          </div>
        ) : null}
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
