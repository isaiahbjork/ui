"use client";

import { motion } from "framer-motion"
import { HudButton } from "@/components/bjork-ui/hud/hud-button"
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell"
import { getGalleryItem } from "@/lib/bjork-gallery"

export default function Page() {
  const item = getGalleryItem("hud-button")
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      }
    }
  }

  const itemVariants = {
    hidden: { 
      opacity: 0, 
      y: 20,
      scale: 0.95,
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 400,
        damping: 25,
      }
    }
  }

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A set of HUD-style action buttons with diagonal and hexagonal treatments. The component exposes style, variant, size, and click handlers for control panels or sci-fi interface work."
      dependencies={["framer-motion", "lucide-react", "clsx"]}
      usageCode={`import { HudButton } from "@/components/bjork-ui/hud/hud-button";

export function Demo() {
  return (
    <HudButton style="style2" variant="primary" size="default">
      Initialize
    </HudButton>
  );
}`}
      previewScaleClassName="w-[840px] scale-[0.84]"
    >
      <motion.div 
        className="w-full max-w-4xl space-y-10"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >

        <motion.div variants={itemVariants} className="space-y-6">
          <h2 className="text-center text-sm font-medium uppercase tracking-[0.14em] text-muted-foreground">Diagonal design</h2>
          <div className="flex flex-wrap gap-6 justify-center">
            <HudButton 
              style="style1" 
              variant="primary"
              onClick={() => console.log("Primary clicked!")}
            >
              Primary Button
            </HudButton>
            <HudButton 
              style="style1" 
              variant="secondary"
              onClick={() => console.log("Secondary clicked!")}
            >
              Secondary Button
            </HudButton>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="space-y-6">
          <h2 className="text-center text-sm font-medium uppercase tracking-[0.14em] text-muted-foreground">Hexagonal design</h2>
          
          <div className="space-y-4">
            <div className="flex flex-wrap gap-6 justify-center">
              <HudButton 
                style="style2" 
                variant="primary" 
                size="small"
                onClick={() => console.log("Small primary clicked!")}
              >
                Small
              </HudButton>
              <HudButton 
                style="style2" 
                variant="primary" 
                size="default"
                onClick={() => console.log("Default primary clicked!")}
              >
                Default
              </HudButton>
              <HudButton 
                style="style2" 
                variant="primary" 
                size="large"
                onClick={() => console.log("Large primary clicked!")}
              >
                Large Button
              </HudButton>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-6 justify-center">
              <HudButton 
                style="style2" 
                variant="secondary" 
                size="small"
                onClick={() => console.log("Small secondary clicked!")}
              >
                Small
              </HudButton>
              <HudButton 
                style="style2" 
                variant="secondary" 
                size="default"
                onClick={() => console.log("Default secondary clicked!")}
              >
                Default
              </HudButton>
              <HudButton 
                style="style2" 
                variant="secondary" 
                size="large"
                onClick={() => console.log("Large secondary clicked!")}
              >
                Large Button
              </HudButton>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </SimpleComponentDemoPage>
  );
}
