"use client";

import { useState } from "react";
import {
  ShellSegmented,
  ShellSwitch,
  SimpleComponentDemoPage,
} from "@/components/bjork-ui/component-demo-shell";
import { AdaptivePrecisionSlider } from "@/components/bjork-ui/controls/adaptive-precision-slider";
import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("adaptive-precision-slider");

const DEFAULT_FALLOFF = 48;
const DEFAULT_SHOW_GAIN = true;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Two decimals on the 0.01 grid, three once the fine step (0.001) lands between hundredths.
function fineDecimals(v: number) {
  return Number.isInteger(Math.round(v * 1e6) / 1e4) ? 2 : 3;
}

function formatEv(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(fineDecimals(v))} EV`;
}

function formatMeters(v: number) {
  return `${v.toFixed(fineDecimals(v))} m`;
}

// 25 frames a second. Values sit on a 0.04s grid, so frames are whole numbers.
function formatTimecode(v: number) {
  const whole = Math.floor(v);
  const frames = Math.round((v - whole) * 25) % 25;
  return `${pad(Math.floor(whole / 60))}:${pad(whole % 60)}.${pad(frames)}`;
}

export default function Page() {
  const isPreview = usePreviewMode();
  const attractParam = usePreviewSearchParam("attract") === "1";
  const [falloff, setFalloff] = useState(DEFAULT_FALLOFF);
  const [showGain, setShowGain] = useState(DEFAULT_SHOW_GAIN);

  const reset = () => {
    setFalloff(DEFAULT_FALLOFF);
    setShowGain(DEFAULT_SHOW_GAIN);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Drift away from the track to fine-tune. Precision comes from the body, not from a modifier key."
      usageCode={`<AdaptivePrecisionSlider
  label="Exposure"
  defaultValue={0}
  min={-2}
  max={2}
  step={0.01}
  format={(v) => \`\${v >= 0 ? "+" : ""}\${v.toFixed(2)} EV\`}
  precisionFalloff={48}
  onValueChange={(v) => setExposure(v)}
/>`}
      previewScaleClassName="w-[340px]"
      previewCaptureScaleClassName="w-[640px] scale-[1.2]"
      optionsDefaultOpen={false}
      onReset={reset}
      controls={
        <>
          <ShellSegmented
            label="Falloff"
            value={falloff}
            options={[24, 48, 96].map((px) => ({ value: px, label: `${px}px` }))}
            onChange={setFalloff}
          />
          <ShellSwitch label="Gain chip" checked={showGain} onCheckedChange={setShowGain} />
        </>
      }
    >
      <div className="flex w-[min(520px,calc(100vw-56px))] min-w-0 flex-col gap-[28px]">
        <AdaptivePrecisionSlider
          label="Exposure"
          value={isPreview ? 0.35 : undefined}
          defaultValue={0}
          debugGain={isPreview ? 0.25 : undefined}
          min={-2}
          max={2}
          step={0.01}
          format={formatEv}
          precisionFalloff={falloff}
          showGain={showGain}
          attract={attractParam}
        />
        <AdaptivePrecisionSlider
          label="Focus distance"
          defaultValue={2.4}
          min={0.3}
          max={10}
          step={0.01}
          format={formatMeters}
          precisionFalloff={falloff}
          showGain={showGain}
        />
        <AdaptivePrecisionSlider
          label="Timecode"
          defaultValue={0}
          min={0}
          max={600}
          step={0.04}
          format={formatTimecode}
          precisionFalloff={falloff}
          showGain={showGain}
        />
        <p className="px-[12px] text-[12px] text-[color:var(--bjork-text-soft,rgba(237,237,237,0.36))]">
          Drag, then drift away from the track to fine-tune.
        </p>
      </div>
    </SimpleComponentDemoPage>
  );
}
