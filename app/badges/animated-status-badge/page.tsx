"use client";

import { useState } from "react"
import { AnimatedStatusBadge } from "@/components/bjork-ui/badges/animated-status-badge"
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell"
import { getGalleryItem } from "@/lib/bjork-gallery"
import { BjorkButton, BjorkCard, BjorkCardContent, BjorkCardDescription, BjorkCardHeader, BjorkCardTitle } from "@/components/bjork-ui/primitives"

export default function Page() {
  const item = getGalleryItem("animated-status-badge")
  const [triggerAnimation1, setTriggerAnimation1] = useState(false)
  const [triggerAnimation2, setTriggerAnimation2] = useState(false)

  const handleStartAnimation1 = () => {
    setTriggerAnimation1(true)
  }

  const handleStartAnimation2 = () => {
    setTriggerAnimation2(true)
  }

  const handleAnimationComplete1 = () => {
    // Reset the trigger after completed badge shows for a bit
    setTimeout(() => setTriggerAnimation1(false), 2000)
  }

  const handleAnimationComplete2 = () => {
    // Reset the trigger after completed badge shows for a bit
    setTimeout(() => setTriggerAnimation2(false), 2000)
  }

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A reusable completion badge that animates behind a foreground card. Use it for queued jobs, generation states, publish flows, or any process that needs a visible running-to-complete confirmation."
      dependencies={["framer-motion", "lucide-react", "clsx"]}
      usageCode={`import { AnimatedStatusBadge } from "@/components/bjork-ui/badges/animated-status-badge";

export function Demo() {
  return (
    <div className="relative">
      <AnimatedStatusBadge trigger={isRunning} onAnimationComplete={onDone} />
      <div className="relative z-10">Card content</div>
    </div>
  );
}`}
      previewScaleClassName="w-[820px] scale-[0.82]"
    >
      <div className="w-full max-w-4xl">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
          {/* First Card */}
          <div className="relative">
            <AnimatedStatusBadge 
              trigger={triggerAnimation1} 
              onAnimationComplete={handleAnimationComplete1}
            />
            <BjorkCard variant="elevated" className="relative z-10 min-h-[190px] w-full rounded-[20px]">
              <BjorkCardHeader>
                <BjorkCardTitle>Project Alpha</BjorkCardTitle>
              </BjorkCardHeader>
              <BjorkCardContent className="mt-4 space-y-4">
                <BjorkCardDescription>This is a sample card to demonstrate the animated status badge appearing behind the card.</BjorkCardDescription>
                <BjorkButton variant="accent" onClick={handleStartAnimation1} disabled={triggerAnimation1}>
                  Start Process 1
                </BjorkButton>
              </BjorkCardContent>
            </BjorkCard>
          </div>

          {/* Second Card */}
          <div className="relative">
            <AnimatedStatusBadge 
              trigger={triggerAnimation2} 
              onAnimationComplete={handleAnimationComplete2}
            />
            <BjorkCard variant="elevated" className="relative z-10 min-h-[190px] w-full rounded-[20px]">
              <BjorkCardHeader>
                <BjorkCardTitle>Project Beta</BjorkCardTitle>
              </BjorkCardHeader>
              <BjorkCardContent className="mt-4 space-y-4">
                <BjorkCardDescription>Another card showing how the badge can be reused across different components while staying behind the card.</BjorkCardDescription>
                <BjorkButton onClick={handleStartAnimation2} disabled={triggerAnimation2} variant="outline">
                  Start Process 2
                </BjorkButton>
              </BjorkCardContent>
            </BjorkCard>
          </div>
        </div>
      </div>
    </SimpleComponentDemoPage>
  );
}
