"use client"

import { useState } from "react"
import { AnimatedDownload } from "@/components/isaiahbjork/buttons/animated-download";
import { ComponentDemoShell } from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/isaiahbjork/primitives";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { Download, MousePointer2, RotateCcw } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

export default function Home() {
  const isPreview = usePreviewMode()
  const item = getGalleryItem("animated-download")
  const [isDownloading, setIsDownloading] = useState(false)
  const shouldReduceMotion = useReducedMotion()

  const startDownload = () => {
    setIsDownloading(true)
  }

  const handleAnimationComplete = () => {
    setIsDownloading(false)
  }

  const resetDownload = () => {
    setIsDownloading(false)
  }

  const itemVariants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3, ease: "easeOut" }
    }
  }

  const demo = (
    <motion.div
      className="flex w-full max-w-4xl flex-col items-center justify-center"
      variants={itemVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={itemVariants}>
        <AnimatedDownload
          className="max-w-full h-auto"
          isAnimating={isDownloading}
          onAnimationComplete={handleAnimationComplete}
        />
      </motion.div>
    </motion.div>
  )

  if (!item) return null

  if (isPreview) {
    return (
      <div
        data-preview-mode="true"
        style={{ colorScheme: "dark" }}
        className="flex min-h-screen items-center justify-center overflow-hidden bg-[#111] text-[#ededed]"
      >
        <div className="w-[920px] scale-[0.78]">{demo}</div>
      </div>
    )
  }

  return (
    <ComponentDemoShell
      item={item}
      description="A download progress component with scrambled status text, file counts, remaining time, and an interruptible trigger. The demo keeps the animation state outside the visual component so it can be wired to real transfer events."
      dependencies={["framer-motion", "lucide-react", "clsx"]}
      usageCode={`import { AnimatedDownload } from "@/components/isaiahbjork/buttons/animated-download";

export function Demo() {
  return (
    <AnimatedDownload
      isAnimating={isDownloading}
      onAnimationComplete={() => setIsDownloading(false)}
    />
  );
}`}
      interactionRows={[
        {
          icon: <MousePointer2 className="size-5" />,
          label: "Controls driven",
          value: "The download is started from the shell controls, keeping the preview focused on the component state.",
        },
        {
          icon: <Download className="size-5" />,
          label: "External state",
          value: "The visual component receives isAnimating and reports completion back to the route.",
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
            <motion.span
              key={isDownloading ? "downloading" : "idle"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              {isDownloading ? "Downloading..." : "Start download"}
            </motion.span>
          </BjorkButton>

          <BjorkButton
            type="button"
            onClick={resetDownload}
            disabled={!isDownloading}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <RotateCcw className="size-3.5" />
            Reset
          </BjorkButton>
        </div>
      }
      previewInnerClassName="p-6"
    >
      <div className="flex h-full w-full items-center justify-center p-6">
        <div className="w-[920px] scale-[0.78]">{demo}</div>
      </div>
    </ComponentDemoShell>
  );
}
