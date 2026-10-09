"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { SimpleComponentDemoPage, ShellActions, ShellSegmented, ShellSwitch } from "@/components/bjork-ui/component-demo-shell";
import { LiveLine, createRandomWalk, type LivePoint } from "@/components/bjork-ui/charts/live-line";
import { mulberry32 } from "@/components/bjork-ui/_core/random";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("live-line");

// Synthetic, deterministic timeline. Timestamps are ms on a fixed origin, so previews repeat exactly.
const T0 = 1_700_000_000_000;
const SAMPLE_MS = 250;
const MAX_SAMPLES = 1500; // 6 minutes at 4Hz

function sampleSpike(rnd: () => number, v: number): number {
  return rnd() < 0.012 ? v + 70 : v;
}

function seedHistory(seed: number, end: number, spanMs: number): LivePoint[] {
  const walk = createRandomWalk(seed, { base: 180, volatility: 4, hz: 4 });
  const rnd = mulberry32(seed + 17);
  const out: LivePoint[] = [];
  for (let t = end - spanMs; t <= end; t += SAMPLE_MS) {
    out.push({ t, v: sampleSpike(rnd, walk.next(t).v) });
  }
  return out;
}

const PREVIEW_HISTORY = seedHistory(3, T0, 60000);

const THRESHOLD = { value: 250, label: "SLO 250ms" };
const formatDemoValue = (v: number) => `${Math.round(v)} ms`;

// The stream lives in its own component, so the 4Hz updates re-render only the chart, not the page shell.
function LiveDemo({
  isPreview,
  windowMs,
  easing,
  paused,
  onPausedChange,
  onRegisterControls,
}: {
  isPreview: boolean;
  windowMs: number;
  easing: number;
  paused: boolean;
  onPausedChange: (paused: boolean) => void;
  onRegisterControls: (controls: { injectSpike: () => void }) => void;
}) {
  const [live, setLive] = useState<LivePoint[]>(PREVIEW_HISTORY);
  const nextT = useRef(T0);

  // Live stream at 4Hz. Pure timestamps on the synthetic clock, so nothing here reads Date.now().
  useEffect(() => {
    if (isPreview) return;
    const walk = createRandomWalk(3, { base: 180, volatility: 4, hz: 4 });
    const rnd = mulberry32(20);
    const id = setInterval(() => {
      nextT.current += SAMPLE_MS;
      const t = nextT.current;
      const v = sampleSpike(rnd, walk.next(t).v);
      setLive((prev) => [...prev, { t, v }].slice(-MAX_SAMPLES));
    }, SAMPLE_MS);
    return () => clearInterval(id);
  }, [isPreview]);

  useEffect(() => {
    onRegisterControls({
      injectSpike: () => {
        nextT.current += SAMPLE_MS;
        const t = nextT.current;
        setLive((prev) => [...prev, { t, v: (prev[prev.length - 1]?.v ?? 180) + 140 }].slice(-MAX_SAMPLES));
      },
    });
  }, [onRegisterControls]);

  return (
    <LiveLine
      data={isPreview ? PREVIEW_HISTORY : live}
      window={windowMs}
      easing={easing}
      paused={isPreview ? true : paused}
      showPauseButton={!isPreview}
      onPausedChange={onPausedChange}
      threshold={THRESHOLD}
      formatValue={formatDemoValue}
      scrub
      ariaLabel="p95 latency"
    />
  );
}

export default function Page() {
  const isPreview = usePreviewMode();
  const [windowMs, setWindowMs] = useState(60000);
  const [easing, setEasing] = useState(0.08);
  const [paused, setPaused] = useState(false);
  const spikeRef = useRef<() => void>(() => {});
  const registerControls = useCallback((c: { injectSpike: () => void }) => {
    spikeRef.current = c.injectSpike;
  }, []);

  const reset = () => {
    setWindowMs(60000);
    setEasing(0.08);
    setPaused(false);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A streaming line chart that stays calm. Values glide in on a damped head, the y range never clips a spike and contracts slowly, and the newest value is always labelled."
      dependencies={["framer-motion", "lucide-react"]}
      usageCode={`import { LiveLine } from "@/components/bjork-ui/charts/live-line";

export function Demo({ points }: { points: { t: number; v: number }[] }) {
  return (
    <LiveLine
      data={points}
      threshold={{ value: 250, label: "SLO 250ms" }}
      formatValue={(v) => \`\${Math.round(v)} ms\`}
      scrub
    />
  );
}`}
      // The shell scales demos to fit their base width on phones. A 360px base keeps the chart at full size there.
      previewScaleClassName="w-[360px]"
      previewCaptureScaleClassName="w-[760px] scale-[1.1]"
      optionsDefaultOpen={false}
      onReset={reset}
      controls={
        <>
          <ShellSegmented
            label="Window"
            value={windowMs}
            onChange={setWindowMs}
            options={[
              { label: "30s", value: 30000 },
              { label: "60s", value: 60000 },
              { label: "5m", value: 300000 },
            ]}
          />
          <ShellSegmented
            label="Easing"
            value={easing}
            onChange={setEasing}
            options={[0.04, 0.08, 0.2].map((value) => ({ label: value.toFixed(2), value }))}
          />
          <ShellSwitch label="Pause" checked={paused} onCheckedChange={setPaused} />
          <ShellActions>
            <BjorkButton size="sm" variant="secondary" onClick={() => spikeRef.current()}>
              Inject spike
            </BjorkButton>
          </ShellActions>
        </>
      }
    >
      <div className="flex w-full min-w-0 flex-col gap-5">
        <LiveDemo
          isPreview={isPreview}
          windowMs={windowMs}
          easing={easing}
          paused={paused}
          onPausedChange={setPaused}
          onRegisterControls={registerControls}
        />
      </div>
    </SimpleComponentDemoPage>
  );
}
