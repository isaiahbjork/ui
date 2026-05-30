"use client";

import React, { useRef, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

interface VideoScrollHeroProps {
  videoSrc?: string;
  enableAnimations?: boolean;
  className?: string;
  startScale?: number;
  scrollRootRef?: React.RefObject<HTMLElement | null>;
}

export function VideoScrollHero({
  videoSrc = "/videos/drone.mp4",
  enableAnimations = true,
  className = "",
  startScale = 0.25,
  scrollRootRef,
}: VideoScrollHeroProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const [scrollScale, setScrollScale] = useState(startScale);

  useEffect(() => {
    if (!enableAnimations || shouldReduceMotion) return;

    const handleScroll = () => {
      if (!containerRef.current) return;

      const scrollRoot = scrollRootRef?.current;
      const rect = containerRef.current.getBoundingClientRect();
      const containerHeight = containerRef.current.offsetHeight;
      const viewportHeight = scrollRoot?.clientHeight ?? window.innerHeight;
      const scrollTop = scrollRoot?.scrollTop ?? Math.max(0, -rect.top);
      const maxScroll = Math.max(1, containerHeight - viewportHeight);
      const progress = Math.min(scrollTop / maxScroll, 1);
      
      // Scale from startScale to 1
      const newScale = startScale + (progress * (1 - startScale));
      setScrollScale(newScale);
    };

    const scrollRoot = scrollRootRef?.current;
    const target = scrollRoot ?? window;
    target.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Initial calculation

    return () => target.removeEventListener("scroll", handleScroll);
  }, [enableAnimations, shouldReduceMotion, startScale, scrollRootRef]);

  const shouldAnimate = enableAnimations && !shouldReduceMotion;

  return (
    <div className={`relative ${className}`}>
      {/* Hero Section with Video */}
      <div ref={containerRef} className="relative h-[200vh] bg-[#070707]">
        {/* Fixed Video Container */}
        <div className="sticky top-0 w-full h-screen flex items-center justify-center z-10">
          <div
            className="relative flex items-center justify-center will-change-transform"
            style={{
              transform: shouldAnimate ? `scale(${scrollScale})` : 'scale(1)',
              transformOrigin: "center center",
            }}
          >
            <video
              autoPlay
              loop
              muted
              playsInline
              className="w-[80vw] max-w-4xl h-[60vh] object-cover shadow-2xl rounded-2xl"
            >
              <source src={videoSrc} type="video/mp4" />
              Your browser does not support the video tag.
            </video>

            {/* Video Overlay Content */}
            <motion.div
              className="absolute inset-0 bg-background/20 backdrop-blur-[1px] flex items-center justify-center rounded-2xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.8 }}
            >
              <div className="text-center text-white">
                <motion.h1
                  className="text-2xl md:text-4xl lg:text-6xl font-bold mb-4"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.8,
                    duration: 0.8,
                    type: "spring",
                    stiffness: 200,
                    damping: 25,
                  }}
                >
                  Scroll to Scale
                </motion.h1>
                <motion.p
                  className="text-sm md:text-lg lg:text-xl text-white/80 max-w-2xl px-4"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 1.0,
                    duration: 0.8,
                    type: "spring",
                    stiffness: 200,
                    damping: 25,
                  }}
                >
                  Watch as the video expands with your scroll
                </motion.p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
