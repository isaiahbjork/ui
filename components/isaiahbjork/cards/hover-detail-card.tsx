"use client";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { BjorkButton } from "@/components/isaiahbjork/primitives/button";

interface HoverDetailCardProps {
  title?: string;
  subtitle?: string;
  images?: string[];
  primaryButton?: {
    text: string;
    color?: string;
    hoverColor?: string;
    textColor?: string;
  };
  secondaryButton?: {
    text: string;
    color?: string;
    hoverColor?: string;
    textColor?: string;
  };
  pills?: {
    left: {
      text: string;
      color?: string;
      textColor?: string;
    };
    sparkle?: {
      show: boolean;
      color?: string;
    };
    right: {
      text: string;
      color?: string;
      textColor?: string;
    };
  };
  enableAnimations?: boolean;
}

const defaultImages = [
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=200&h=200&fit=crop",
  "https://images.unsplash.com/photo-1524863479829-916d8e77f114?w=200&h=200&fit=crop",
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=200&h=200&fit=crop&flip=h",
  "https://images.unsplash.com/photo-1524863479829-916d8e77f114?w=200&h=200&fit=crop&flip=h",
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=200&h=200&fit=crop",
  "https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=200&h=200&fit=crop",
  "https://images.unsplash.com/photo-1524863479829-916d8e77f114?w=200&h=200&fit=crop&sat=-100",
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&h=200&fit=crop",
  "https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=200&h=200&fit=crop&flip=h",
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=200&h=200&fit=crop&sat=-50",
];

export function HoverDetailCard({
  title = "Studio shots",
  subtitle = "52 tiles",
  images = defaultImages,
  primaryButton = {
    text: "Go to collection",
    color: "bg-[#ec5c13]",
    hoverColor: "hover:bg-[#f06d27]",
    textColor: "text-[#080808]"
  },
  secondaryButton = {
    text: "Edit rules",
    color: "bg-[#eee9df] dark:bg-[#090909]",
    hoverColor: "hover:bg-[#e7e1d5] dark:hover:bg-[#141414]",
    textColor: "text-[#171717] dark:text-[#ededed]"
  },
  pills = {
    left: { text: "1×1", color: "bg-[#ec5c13]/12", textColor: "text-[#bd4514] dark:text-[#d86a2c]" },
    sparkle: { show: true, color: "bg-[#eee9df] text-[#bd4514] dark:bg-[#090909] dark:text-[#d86a2c]" },
    right: { text: "Published", color: "bg-[#8a7a60]/14", textColor: "text-[#6b5f4b] dark:text-[#b8aa91]" }
  },
  enableAnimations = true
}: HoverDetailCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const shouldAnimate = enableAnimations && !shouldReduceMotion;

  // Animation variants
  const containerVariants = {
    hidden: { 
      opacity: 0, 
      y: 20,
      scale: 0.95
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 30,
        staggerChildren: 0.08,
        delayChildren: 0.1,
      }
    }
  };

  const imageVariants = {
    hidden: { 
      opacity: 0, 
      scale: 0.8,
      y: 10
    },
    visible: { 
      opacity: 1, 
      scale: 1,
      y: 0,
      transition: { 
        type: "spring", 
        stiffness: 400, 
        damping: 25 
      }
    }
  };

  const contentVariants = {
    hidden: { 
      opacity: 0, 
      x: -25,
      scale: 0.95,
      filter: "blur(4px)",
    },
    visible: { 
      opacity: 1, 
      x: 0,
      scale: 1,
      filter: "blur(0px)",
      transition: { 
        type: "spring", 
        stiffness: 400, 
        damping: 28,
        mass: 0.6,
      }
    }
  };

  const bottomSectionVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.4,
      },
    },
  };

  const pillVariants = {
    hidden: { 
      opacity: 0, 
      x: -20,
      scale: 0.9,
      filter: "blur(3px)",
    },
    visible: {
      opacity: 1,
      x: 0,
      scale: 1,
      filter: "blur(0px)",
      transition: {
        type: "spring",
        stiffness: 450,
        damping: 25,
        mass: 0.5,
      },
    },
  };

  const textVariants = {
    hidden: { 
      opacity: 0, 
      y: 15,
      scale: 0.95,
      filter: "blur(4px)",
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      transition: {
        type: "spring",
        stiffness: 400,
        damping: 30,
        mass: 0.7,
      },
    },
  };

  return (
    <motion.div
      className="w-full max-w-md"
      initial={shouldAnimate ? "hidden" : "visible"}
      animate="visible"
      variants={shouldAnimate ? containerVariants : {}}
    >
      <motion.div 
        className="overflow-hidden rounded-[20px] border border-[#d8d3c7] bg-[#f4f1e9] text-[#171717] shadow-[inset_0_7px_14px_rgba(255,255,255,0.62),inset_0_0.5px_0.5px_rgba(255,255,255,0.9),0_18px_34px_-16px_rgba(55,47,36,0.28)] transition-shadow duration-300 hover:shadow-[inset_0_7px_14px_rgba(255,255,255,0.62),inset_0_0.5px_0.5px_rgba(255,255,255,0.9),0_22px_38px_-18px_rgba(55,47,36,0.34)] dark:border-[#161616] dark:bg-[#121212] dark:text-[#ededed] dark:shadow-[inset_0_7px_14px_rgba(255,255,255,0.03),inset_0_0.5px_0.5px_rgba(255,255,255,0.06),0_18px_34px_-16px_rgba(0,0,0,0.9)] dark:hover:shadow-[inset_0_7px_14px_rgba(255,255,255,0.04),inset_0_0.5px_0.5px_rgba(255,255,255,0.08),0_22px_38px_-18px_rgba(0,0,0,0.95)]"
        variants={shouldAnimate ? contentVariants : {}}
      >
        {/* Top Image Section */}
        <motion.div 
          className="relative border-b border-[#d8d3c7] bg-[#eee9df] p-4 dark:border-[#232323] dark:bg-[#090909]"
          onHoverStart={() => setIsHovered(true)}
          onHoverEnd={() => setIsHovered(false)}
          variants={shouldAnimate ? contentVariants : {}}
        >
          <div className="grid grid-cols-5 gap-2 relative">
            {images.slice(0, 10).map((src, index) => (
              <motion.div
                key={index}
                className="relative aspect-square overflow-hidden rounded-lg"
                variants={shouldAnimate ? imageVariants : {}}
                custom={index}
                animate={{
                  scale: isHovered ? 0.85 : 1,
                }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 25,
                }}
              >
                <img
                  src={src}
                  alt={`${title} ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </motion.div>
            ))}
          </div>

          {/* Blur Overlay */}
          <AnimatePresence>
            {isHovered && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center"
              >
                {/* Buttons Container */}
                <div className="flex gap-3 mx-auto">
                  <BjorkButton
                    variant="accent"
                    size="sm"
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -20, opacity: 0 }}
                    transition={{
                      type: "spring",
                      stiffness: 400,
                      damping: 25,
                      delay: 0.1,
                    }}
                    className="h-8 px-3"
                  >
                    {primaryButton.text}
                  </BjorkButton>
                  <BjorkButton
                    variant="outline"
                    size="sm"
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -20, opacity: 0 }}
                    transition={{
                      type: "spring",
                      stiffness: 400,
                      damping: 25,
                      delay: 0.2,
                    }}
                    className="h-8 px-3"
                  >
                    {secondaryButton.text}
                  </BjorkButton>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Bottom Content Section */}
        <motion.div 
          className="p-4"
          variants={shouldAnimate ? bottomSectionVariants : {}}
        >
          {/* Bottom Pills and Content */}
          <motion.div 
            className="flex items-center justify-between mb-3"
            variants={shouldAnimate ? contentVariants : {}}
          >
            <motion.div 
              className="flex items-center gap-2"
              variants={shouldAnimate ? bottomSectionVariants : {}}
            >
              <motion.div 
                className={cn(pills.left.color, pills.left.textColor, "rounded-lg border border-[#ec5c13]/18 px-3 py-1 text-sm font-medium")}
                variants={shouldAnimate ? pillVariants : {}}
              >
                {pills.left.text}
              </motion.div>
              {pills.sparkle?.show && (
                <motion.div 
                  className={cn(pills.sparkle.color, "rounded-lg border border-[#d8d3c7] p-2 dark:border-[#232323]")}
                  variants={shouldAnimate ? pillVariants : {}}
                  whileHover={shouldAnimate ? { 
                    rotate: 15,
                    scale: 1.1,
                    transition: { type: "spring", stiffness: 400, damping: 25 }
                  } : {}}
                >
                  <Sparkles className="w-3 h-3" />
                </motion.div>
              )}
            </motion.div>
            <motion.div 
              className={cn(pills.right.color, pills.right.textColor, "rounded-lg border border-[#d8d3c7] px-3 py-1 text-sm font-medium dark:border-[#232323]")}
              variants={shouldAnimate ? pillVariants : {}}
            >
              {pills.right.text}
            </motion.div>
          </motion.div>

          {/* Title and Subtitle */}
          <motion.div
            variants={shouldAnimate ? bottomSectionVariants : {}}
          >
            <motion.h3 
              className="text-2xl font-bold text-foreground mb-1"
              variants={shouldAnimate ? textVariants : {}}
            >
              {title}
            </motion.h3>
            <motion.p 
              className="text-muted-foreground text-lg"
              variants={shouldAnimate ? textVariants : {}}
            >
              {subtitle}
            </motion.p>
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
