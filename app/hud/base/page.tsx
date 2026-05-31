"use client";

import { useEffect, useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { motion } from "framer-motion";
import { Crosshair, Radar, ToggleLeft } from "lucide-react";
import { ComponentDemoShell, ShellSegmented } from "@/components/bjork-ui/component-demo-shell";
import { HudFrame } from "@/components/bjork-ui/hud/hud-frame";
import { TargetingUI } from "@/components/bjork-ui/hud/targeting-ui";
import { Status } from "@/components/bjork-ui/hud/status";
import { HudButton } from "@/components/bjork-ui/hud/hud-button";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("hud-frame");

export default function Page() {
  const isPreview = usePreviewMode();
  const [mounted, setMounted] = useState(false);
  const [showTargeting, setShowTargeting] = useState(true);
  const [targetingKey, setTargetingKey] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const svgAnimation = {
    hidden: { opacity: 0, scale: 0.95 },
    show: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.8,
        ease: [0.22, 1, 0.36, 1],
      },
    },
    hide: {
      opacity: 0,
      scale: 0.95,
      transition: {
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1],
      },
    },
  };

  const toggleTargeting = () => {
    if (showTargeting) {
      // If currently showing, just hide it
      setShowTargeting(false);
    } else {
      // If currently hidden, increment key to force remount and restart animations
      setTargetingKey(prev => prev + 1);
      setShowTargeting(true);
    }
  };

  const demo = (
    <div className="h-[620px] w-full overflow-hidden rounded-[18px] bg-transparent">
      <HudFrame backgroundVideo="/videos/drone.mp4" fixedFrame={false}>
      
        <div className="flex h-full w-full flex-col relative overflow-hidden">
          {/* HUD Button at top right corner */}
          <motion.div
            className="absolute top-6 right-6 z-20"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.8 }}
          >
            <HudButton
              variant="secondary"
              size="small"
              onClick={toggleTargeting}
              delay={0.2}
            >
              {showTargeting ? "DISABLE HUD" : "ENABLE HUD"}
            </HudButton>
          </motion.div>

          {mounted && (
            <>
              {/* Only render TargetingUI when showTargeting is true */}
              {showTargeting && (
                <motion.div
                  className="absolute inset-0 flex items-center justify-center z-0"
                  initial="hidden"
                  animate="show"
                  variants={svgAnimation}
                  key={targetingKey} // Force remount to restart animations
                >
                  <TargetingUI className="w-1/2 h-full" />
                </motion.div>
              )}
              
              {/* Active Systems SVG at bottom left */}
              <motion.div
                className="absolute bottom-2 left-5 z-10"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1, duration: 0.8 }}
              >
                <Status
                  className="w-64"
                  customColors={{
                    gradientStart: "#4ade80",
                    gradientEnd: "#15803d",
                    stroke: "#4ade80",
                    text: "text-green-300",
                  }}
                />
              </motion.div>
            </>
          )}
        </div>
        
      </HudFrame>
    </div>
  );

  if (isPreview) {
    return (
      <div className="flex min-h-screen items-center justify-center overflow-hidden bg-background">
        <div className="w-[920px] scale-[0.5]">{demo}</div>
      </div>
    );
  }

  if (!item) return null;

  return (
    <ComponentDemoShell
      item={item}
      onReset={() => {
        setTargetingKey((value) => value + 1);
        setShowTargeting(true);
      }}
      showOptionsReset={false}
      description="A cinematic HUD frame system with clipped edge geometry, optional video background, targeting overlay, status readout, and a control button for toggling the active system layer."
      dependencies={["framer-motion", "clsx"]}
      interactionRows={[
        {
          icon: <Crosshair className="size-5" />,
          label: "Targeting overlay",
          value: "The center SVG layer can be restarted without remounting the frame shell.",
        },
        {
          icon: <Radar className="size-5" />,
          label: "Frame geometry",
          value: "CSS clip-path polygons create the chamfered HUD boundary and notches.",
        },
        {
          icon: <ToggleLeft className="size-5" />,
          label: "System toggle",
          value: "The HUD button enables and disables the active targeting layer.",
        },
      ]}
      cliCommand="npx shadcn add @bjork-ui/hud-frame"
      usageCode={`import { HudFrame } from "@/components/bjork-ui/hud/hud-frame";

export function Demo() {
  return (
    <HudFrame backgroundVideo="/videos/drone.mp4">
      <TargetingUI />
    </HudFrame>
  );
}`}
      controls={
        <ShellSegmented
          label="HUD"
          value={showTargeting ? "on" : "off"}
          options={[
            { value: "on", label: "On" },
            { value: "off", label: "Off" },
          ]}
          onChange={(value) => {
            if (value === "on") {
              setTargetingKey((current) => current + 1);
              setShowTargeting(true);
            } else {
              setShowTargeting(false);
            }
          }}
        />
      }
    >
      {demo}
    </ComponentDemoShell>
  );
}
