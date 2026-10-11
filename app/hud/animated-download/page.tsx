"use client"

import { useState } from "react"
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { AnimatedDownload } from "@/components/bjork-ui/hud/animated-download";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/bjork-ui/primitives";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { Download, MousePointer2, RotateCcw } from "lucide-react";

export default function Home() {
  const isPreview = usePreviewMode();
  const item = getGalleryItem("animated-download")
  const [isDownloading, setIsDownloading] = useState(false)
  // Bumping the key remounts the card, which returns it to the ready state.
  const [runKey, setRunKey] = useState(0)

  const startDownload = () => {
    setIsDownloading(true)
  }

  const resetDownload = () => {
    setIsDownloading(false)
    setRunKey((value) => value + 1)
  }

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A download card with a file name, size, speed and time left in mono, an ember progress line with a percentage, and a check once the transfer is saved. The page owns the run state, so the card can be wired to real transfer events."
      dependencies={["framer-motion", "lucide-react", "clsx"]}
      usageCode={`import { AnimatedDownload } from "@/components/bjork-ui/hud/animated-download";

export function Demo() {
  return (
    <AnimatedDownload
      fileName="bjork-ui-registry.zip"
      fileSizeMb={48.6}
      isAnimating={isDownloading}
      onAnimationComplete={() => setIsDownloading(false)}
    />
  );
}`}
      interactionRows={[
        {
          icon: <MousePointer2 className="size-5" />,
          label: "Controls driven",
          value: "The download is started from the options panel, keeping the preview focused on the component state.",
        },
        {
          icon: <Download className="size-5" />,
          label: "External state",
          value: "The card receives isAnimating and reports completion back to the route, then holds its saved state.",
        },
      ]}
      onReset={resetDownload}
      controls={
        <div className="grid gap-2">
          <BjorkButton
            type="button"
            onClick={startDownload}
            disabled={isDownloading}
            variant="accent"
            size="sm"
            className="w-full"
          >
            <Download className="size-4" />
            {isDownloading ? "Downloading..." : "Start download"}
          </BjorkButton>

          <BjorkButton
            type="button"
            onClick={resetDownload}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <RotateCcw className="size-3.5" />
            Reset
          </BjorkButton>
        </div>
      }
      previewScaleClassName="w-[760px] scale-[0.84]"
      previewCaptureScaleClassName="w-[900px] scale-100"
    >
      {/* The card is 360px wide; zoom (not a transform) enlarges it in layout so nothing clips it. */}
      <div className="flex w-full items-center justify-center">
        <div style={{ zoom: 1.5 }}>
          <AnimatedDownload
            key={runKey}
            isAnimating={isDownloading}
            previewProgress={isPreview ? 0.64 : undefined}
            onAnimationComplete={() => setIsDownloading(false)}
          />
        </div>
      </div>
    </SimpleComponentDemoPage>
  );
}
