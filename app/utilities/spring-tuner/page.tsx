"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { SpringTuner, type SpringTransition } from "@/components/bjork-ui/utilities/spring-tuner";
import { springs } from "@/components/bjork-ui/_core/motion";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("spring-tuner");

// Card flip driven by the tuned transition. It renders in the tuner's preview lane through `children`.
function FlipDemo() {
  const [flipped, setFlipped] = useState(false);
  return (
    <SpringTuner defaultValue={springs.standard} showCode={false}>
      {(transition: SpringTransition) => (
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          aria-pressed={flipped}
          className="block h-12 w-full [perspective:600px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent,#ec5c13)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bjork-surface,#121212)]"
        >
          <motion.span
            animate={{ rotateX: flipped ? 180 : 0 }}
            transition={transition}
            className="relative block size-full [transform-style:preserve-3d]"
          >
            <span className="absolute inset-0 flex items-center justify-center rounded-[10px] border border-[color:var(--bjork-border,#232323)] bg-[color:var(--bjork-surface-active,#202020)] font-mono text-[12px] [backface-visibility:hidden]">
              Front
            </span>
            <span className="absolute inset-0 flex items-center justify-center rounded-[10px] border border-[color:var(--bjork-accent,#ec5c13)] bg-[color:var(--bjork-accent-soft,rgba(236,92,19,0.12))] font-mono text-[12px] text-[color:var(--bjork-accent-badge-foreground,#fff2ea)] [backface-visibility:hidden] [transform:rotateX(180deg)]">
              Back
            </span>
          </motion.span>
        </button>
      )}
    </SpringTuner>
  );
}

export default function Page() {
  const isPreview = usePreviewMode();

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Tune a spring by grabbing its overshoot, see it run, and copy the exact config."
      usageCode={`<SpringTuner
  defaultValue={{ stiffness: 400, damping: 25, mass: 1 }}
  defaultGhosts={[
    { stiffness: 300, damping: 30, mass: 0.8 },
    { stiffness: 200, damping: 25, mass: 1.2 },
  ]}
  onCopy={(code) => console.log(code)}
/>

// Drive your own motion with the tuned config
<SpringTuner>
  {(transition) => (
    <motion.div animate={{ x: open ? 120 : 0 }} transition={transition} />
  )}
</SpringTuner>`}
      details={<FlipDemo />}
      previewScaleClassName="w-[340px]"
      previewCaptureScaleClassName="w-[760px] scale-[1.3]"
      optionsDefaultOpen={false}
    >
      {isPreview ? (
        <SpringTuner value={springs.snappy} defaultGhosts={[springs.standard, springs.press, springs.soft]} />
      ) : (
        <div className="w-[min(560px,calc(100vw-56px))] min-w-0">
          <SpringTuner
            className="w-full"
            defaultValue={springs.snappy}
            defaultGhosts={[springs.standard, springs.soft]}
            attract={false}
          />
        </div>
      )}
    </SimpleComponentDemoPage>
  );
}
