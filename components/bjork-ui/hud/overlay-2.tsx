"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useTheme } from "next-themes";

import { HudButton } from "@/components/bjork-ui/hud/hud-button";
import { cn } from "@/lib/utils";

interface Overlay2Props {
  className?: string;
  compact?: boolean;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.3,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 100,
      damping: 15,
    },
  },
};

const svgVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  show: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.8,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
};

export function Overlay2({ className, compact = false }: Overlay2Props) {
  const shouldReduceMotion = useReducedMotion();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  const svgFilter = isDark ? "none" : "invert(1)";
  const animationProps = shouldReduceMotion
    ? {
        initial: false as const,
        animate: "show" as const,
      }
    : {
        initial: "hidden" as const,
        animate: "show" as const,
      };

  return (
    <div
      className={cn(
        "relative h-full min-h-[520px] w-full overflow-hidden bg-transparent text-foreground",
        className,
      )}
    >
      <motion.div
        className="absolute inset-0 z-0 flex items-center justify-center"
        variants={svgVariants}
        {...animationProps}
      >
        <div className={cn("h-[80%] w-[80%] max-w-5xl", compact && "h-[82%] w-[84%]")}>
          <img
            src="/images/interface-01.svg"
            alt="Interface background"
            className="h-full w-full object-contain"
            style={{ filter: svgFilter }}
            draggable={false}
          />
        </div>
      </motion.div>

      <motion.div
        className="relative z-10 flex h-full flex-col items-center justify-center"
        variants={containerVariants}
        {...animationProps}
      >
        <motion.h1
          className={cn(
            "mb-4 font-raster font-bold tracking-wider text-foreground drop-shadow-lg",
            compact ? "text-5xl" : "text-6xl",
          )}
          variants={itemVariants}
        >
          SYSTEM ONLINE
        </motion.h1>
        <motion.p
          className={cn(
            "font-raster tracking-wide text-foreground/70",
            compact ? "text-xl" : "text-2xl",
          )}
          variants={itemVariants}
        >
          INTERFACE 01
        </motion.p>
        <motion.div className="mt-8 flex gap-6" variants={itemVariants}>
          <HudButton variant="primary">INITIALIZE</HudButton>
        </motion.div>
      </motion.div>

      <motion.div
        className={cn("absolute z-10", compact ? "right-6 top-5" : "right-8 top-6")}
        initial={shouldReduceMotion ? false : { opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: shouldReduceMotion ? 0 : 0.8, duration: shouldReduceMotion ? 0 : 0.5 }}
      >
        <p className="font-raster text-md tracking-wider text-foreground drop-shadow-lg">Menu</p>
      </motion.div>

      <motion.div
        className={cn("absolute z-10", compact ? "bottom-0 left-6" : "bottom-0 left-8")}
        initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: shouldReduceMotion ? 0 : 1, duration: shouldReduceMotion ? 0 : 0.5 }}
      >
        <motion.div
          className={cn(compact ? "h-20 w-80" : "h-24 w-96")}
          initial={shouldReduceMotion ? false : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{
            delay: shouldReduceMotion ? 0 : 1.2,
            duration: shouldReduceMotion ? 0 : 0.8,
            type: "spring",
            stiffness: 100,
            damping: 12,
          }}
        >
          <img
            src="/images/all-systems-active.svg"
            alt="All Systems Active"
            className="h-full w-full object-contain"
            style={{ filter: svgFilter }}
            draggable={false}
          />
        </motion.div>
      </motion.div>
    </div>
  );
}
