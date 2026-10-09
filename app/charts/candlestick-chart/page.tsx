"use client";

import { useEffect, useMemo, useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { CandlestickChart, createCandles, type Candle } from "@/components/bjork-ui/charts/candlestick-chart";
import { mulberry32 } from "@/components/bjork-ui/_core/random";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { ControlRow, DemoColumn, OptionGroup, ToggleButton } from "../_demo/controls";

const item = getGalleryItem("candlestick-chart");
const HISTORY = createCandles(11, 160, { base: 142 });
const PREVIEW_VISIBLE: [number, number] = [96, 160];

function useLiveCandles(enabled: boolean) {
  const [rows, setRows] = useState<Candle[]>(HISTORY);
  useEffect(() => {
    if (!enabled) return;
    const rnd = mulberry32(5);
    let tick = 0;
    // Four updates per candle: the last candle forms, then a new one opens.
    const id = setInterval(() => {
      tick++;
      setRows((prev) => {
        const last = prev[prev.length - 1];
        const move = (rnd() - 0.48) * last.c * 0.006;
        if (tick % 4 === 0) {
          const o = last.c;
          const c = o + move;
          return [...prev, { t: last.t + 86400000, o, h: Math.max(o, c), l: Math.min(o, c), c, v: Math.round(400000 + rnd() * 900000) }].slice(-400);
        }
        const c = last.c + move;
        const next = { ...last, c, h: Math.max(last.h, c), l: Math.min(last.l, c), v: (last.v ?? 0) + Math.round(rnd() * 120000) };
        return [...prev.slice(0, -1), next];
      });
    }, 250);
    return () => clearInterval(id);
  }, [enabled]);
  return rows;
}

export default function Page() {
  const isPreview = usePreviewMode();
  const [live, setLive] = useState(false);
  const [palette, setPalette] = useState<"ink" | "semantic">("ink");
  const [resetKey, setResetKey] = useState(0);
  const rows = useLiveCandles(live && !isPreview);
  const formatPrice = useMemo(() => (v: number) => v.toFixed(2), []);

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Daily candles with volume, a crosshair that snaps to each candle, and zoom that eases into place. Pinch or ctrl-scroll to zoom, drag to pan, and use the arrow keys to step through candles. The last close stays labelled in the price gutter, and the y range never clips a wick."
      dependencies={["framer-motion"]}
      usageCode={`import { CandlestickChart } from "@/components/bjork-ui/charts/candlestick-chart";

export function Demo({ candles }: { candles: { t: number; o: number; h: number; l: number; c: number; v?: number }[] }) {
  return <CandlestickChart data={candles} formatPrice={(v) => v.toFixed(2)} />;
}`}
      previewScaleClassName="w-[320px]"
      previewCaptureScaleClassName="w-[800px] scale-[1.06]"
    >
      {isPreview ? (
        <div className="w-[760px]">
          <CandlestickChart data={HISTORY} visible={PREVIEW_VISIBLE} cursor={138} height={400} formatPrice={formatPrice} ariaLabel="ACME daily" />
        </div>
      ) : (
        <DemoColumn width={880}>
          <CandlestickChart key={resetKey} data={rows} palette={palette} height={380} formatPrice={formatPrice} ariaLabel="ACME daily" />
          <ControlRow>
            <OptionGroup
              label="Palette"
              value={palette}
              onChange={setPalette}
              options={[
                { label: "Ink", value: "ink" },
                { label: "Semantic", value: "semantic" },
              ]}
            />
            <ToggleButton pressed={live} onClick={() => setLive((v) => !v)}>
              {live ? "Stop live" : "Go live"}
            </ToggleButton>
            <ToggleButton onClick={() => setResetKey((k) => k + 1)}>Reset zoom</ToggleButton>
          </ControlRow>
        </DemoColumn>
      )}
    </SimpleComponentDemoPage>
  );
}
