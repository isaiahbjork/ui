"use client";

import { useState } from "react";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { BjorkButton, BjorkButtonGroup } from "@/components/bjork-ui/primitives";
import { GlyphMorph } from "@/components/bjork-ui/text/glyph-morph";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("glyph-morph");

const wordSets = [
  { label: "shape", words: ["Shape", "Shift", "Form", "Flow"] },
  { label: "craft", words: ["Design", "Develop", "Deploy"] },
  { label: "states", words: ["solid", "liquid", "vapour"] },
  { label: "short", words: ["ink", "melt", "drip", "set"] },
] as const;

const speeds = [
  { label: "slow", interval: 2200, duration: 2400 },
  { label: "normal", interval: 1600, duration: 1500 },
  { label: "fast", interval: 900, duration: 900 },
] as const;

const weights = [
  { label: "regular", value: 420 },
  { label: "semibold", value: 640 },
  { label: "black", value: 860 },
] as const;

export default function GlyphMorphDemo() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const tone = previewTheme === "light" || previewTheme === "dark" ? previewTheme : undefined;
  // ?progress=0.3 freezes the morph on one frame, handy for inspecting in-betweens.
  const progressParam = usePreviewSearchParam("progress");
  const frozen = progressParam !== null && progressParam !== "" ? Number(progressParam) : isPreview ? 0.45 : undefined;
  const setRaw = usePreviewSearchParam("set");
  const setParam = setRaw ? Number(setRaw) : -1;

  const [setIndex, setSetIndex] = useState(0);
  const [speed, setSpeed] = useState<(typeof speeds)[number]["label"]>("normal");
  const [weight, setWeight] = useState<number>(640);
  const activeSpeed = speeds.find((s) => s.label === speed) ?? speeds[1];
  const words = wordSets[Number.isInteger(setParam) && wordSets[setParam] ? setParam : isPreview ? 0 : setIndex].words;

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Words that melt into each other by shape instead of crossfading. Each word becomes a signed distance field; a WebGL2 shader sweeps one field into the next with a little gravity, flow noise and surface tension, and only the travelling edge catches an orange rim."
      usageCode={`import { GlyphMorph } from "@/components/bjork-ui/text/glyph-morph";

<GlyphMorph
  words={["Shape", "Shift", "Form", "Flow"]}
  interval={1600}        // hold per word, ms
  duration={1500}        // morph length, ms
  easing="inOutCubic"
  stagger={0.4}          // 0 all at once, 1 slow sweep
  tension={0.6}          // mid-morph thickening
  fontWeight={640}
  tone="dark"
  ariaLabel="Studio values"
/>`}
      previewScaleClassName="w-[360px]"
      previewCaptureScaleClassName="w-[860px] scale-[1]"
    >
      <div className="flex w-[min(880px,calc(100vw-72px))] flex-col items-center gap-6">
        {!isPreview ? (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <BjorkButtonGroup aria-label="Word set">
              {wordSets.map((set, i) => (
                <BjorkButton
                  key={set.label}
                  size="sm"
                  variant={setIndex === i ? "secondary" : "ghost"}
                  aria-pressed={setIndex === i}
                  onClick={() => setSetIndex(i)}
                >
                  {set.label}
                </BjorkButton>
              ))}
            </BjorkButtonGroup>
            <BjorkButtonGroup aria-label="Speed">
              {speeds.map((s) => (
                <BjorkButton
                  key={s.label}
                  size="sm"
                  variant={speed === s.label ? "secondary" : "ghost"}
                  aria-pressed={speed === s.label}
                  onClick={() => setSpeed(s.label)}
                >
                  {s.label}
                </BjorkButton>
              ))}
            </BjorkButtonGroup>
            <BjorkButtonGroup aria-label="Weight">
              {weights.map((w) => (
                <BjorkButton
                  key={w.label}
                  size="sm"
                  variant={weight === w.value ? "secondary" : "ghost"}
                  aria-pressed={weight === w.value}
                  onClick={() => setWeight(w.value)}
                >
                  {w.label}
                </BjorkButton>
              ))}
            </BjorkButtonGroup>
          </div>
        ) : null}
        <GlyphMorph
          words={[...words]}
          interval={activeSpeed.interval}
          duration={activeSpeed.duration}
          fontWeight={isPreview ? 640 : weight}
          tone={tone}
          progress={frozen !== undefined && Number.isFinite(frozen) ? frozen : undefined}
          ariaLabel="Morphing word"
        />
      </div>
    </SimpleComponentDemoPage>
  );
}
