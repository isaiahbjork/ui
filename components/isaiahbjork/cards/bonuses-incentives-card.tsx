"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BjorkButton } from "@/components/isaiahbjork/primitives/button";

interface BonusesIncentivesCardProps {
  // Content
  bonusText?: string;
  incentivesText?: string;
  bonusesValue?: number;
  incentivesValue?: number;

  // Styling
  borderColor?: string;
  backgroundColor?: string;
  blurColorBlue?: string;
  blurColorGreen?: string;

  // Dots configuration
  outerDotsCount?: number;
  innerDotsCount?: number;

  // Animation controls
  enableAnimations?: boolean;

  // Callbacks
  onMoreDetails?: () => void;
}

const defaultProps: Partial<BonusesIncentivesCardProps> = {
  bonusText: "Bonus and Incentives",
  incentivesText: "Incentives",
  bonusesValue: 1250,
  incentivesValue: 875,
  borderColor: "border-[#d8d3c7] dark:border-[#161616]",
  backgroundColor: "bg-[#f4f1e9] dark:bg-[#121212]",
  blurColorBlue: "bg-[#ec5c13]/10",
  blurColorGreen: "bg-[#8a7a60]/10",
  outerDotsCount: 48,
  innerDotsCount: 36,
  enableAnimations: true,
};

export function BonusesIncentivesCard(props: BonusesIncentivesCardProps) {
  const {
    bonusesValue,
    incentivesValue,
    borderColor,
    backgroundColor,
    outerDotsCount,
    innerDotsCount,
    enableAnimations,
    onMoreDetails,
  } = { ...defaultProps, ...props };

  const shouldReduceMotion = useReducedMotion();
  const shouldAnimate = enableAnimations && !shouldReduceMotion;

  // Generate circular dots positions
  const generateDots = (count: number, radius: number, centerX: number, centerY: number) => {
    const dots = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * 2 * Math.PI;
      const x = Math.round((centerX + radius * Math.cos(angle)) * 1000) / 1000;
      const y = Math.round((centerY + radius * Math.sin(angle)) * 1000) / 1000;
      dots.push({ x, y, angle, delay: i * 0.02 });
    }
    return dots;
  };

  const outerDots = generateDots(outerDotsCount!, 185, 203, 200);
  const innerDots = generateDots(innerDotsCount!, 155, 203, 200);

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

  const dotVariants = {
    hidden: {
      opacity: 0,
      scale: 0,
    },
    visible: {
      opacity: 0.6,
      scale: 1,
      transition: {
        duration: 0.5,
        ease: "easeOut",
      }
    }
  };


  return (
    <motion.div
      className="w-full max-w-md"
      initial={false}
      animate="visible"
      variants={shouldAnimate ? containerVariants : {}}
    >
      <motion.div
        className={cn(
          backgroundColor,
          borderColor,
          "overflow-hidden rounded-[20px] border text-[#171717] shadow-[inset_0_7px_14px_rgba(255,255,255,0.62),inset_0_0.5px_0.5px_rgba(255,255,255,0.9),0_18px_34px_-16px_rgba(55,47,36,0.28)] dark:text-[#ededed] dark:shadow-[inset_0_7px_14px_rgba(255,255,255,0.03),inset_0_0.5px_0.5px_rgba(255,255,255,0.06),0_18px_34px_-16px_rgba(0,0,0,0.9)]"
        )}
      >

        {/* Middle Section - Dots */}
        <div className="relative pl-4 pr-8 pb-4 pt-8 overflow-hidden">
          {/* Blur backgrounds */}
          <div className={cn("absolute inset-0 rounded-lg backdrop-blur-[2px]", backgroundColor)} />

          {/* Dots Container */}
          <div className="relative w-[28rem] h-[28rem] mx-auto">
            <svg className="w-full h-full" viewBox="0 0 448 448">
              {/* Outer dots */}
              {outerDots.map((dot, index) => (
                <motion.circle
                  key={`outer-${index}`}
                  cx={dot.x}
                  cy={dot.y}
                  r="10"
                  fill="currentColor"
                  style={{ color: '#ec5c13' }}
                  variants={shouldAnimate ? dotVariants : {}}
                  initial={false}
                  animate="visible"
                />
              ))}

              {/* Inner dots */}
              {innerDots.map((dot, index) => (
                <motion.circle
                  key={`inner-${index}`}
                  cx={dot.x}
                  cy={dot.y}
                  r="10"
                  fill="currentColor"
                  style={{ color: '#8a7a60' }}
                  variants={shouldAnimate ? dotVariants : {}}
                  initial={false}
                  animate="visible"
                />
              ))}
            </svg>

            {/* Center Text Overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none -mt-24 -ml-12">
              <div className="text-center" style={{ zIndex: 20 }}>
                <motion.div 
                  className="mb-2 text-xl font-medium text-[#171717]/58 dark:text-[#ededed]/42"
                  initial={false}
                  animate={shouldAnimate ? { opacity: 1, y: 0, scale: 1 } : {}}
                  transition={{ 
                    delay: 0.3,
                    type: "spring",
                    stiffness: 400,
                    damping: 25,
                    mass: 0.6
                  }}
                >
                  TOTAL
                </motion.div>
                <motion.div 
                  className="text-5xl font-bold text-[#171717] dark:text-[#ededed]"
                  initial={false}
                  animate={shouldAnimate ? { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" } : {}}
                  transition={{ 
                    delay: 0.5,
                    type: "spring",
                    stiffness: 300,
                    damping: 28,
                    mass: 0.8
                  }}
                >
                  ${(bonusesValue! + incentivesValue!).toLocaleString()}
                </motion.div>
              </div>
            </div>
          </div>

          {/* Gradient fade overlay for bottom half - covers entire card */}
          <div
            className="pointer-events-none absolute -inset-4 rounded-xl dark:hidden"
            style={{
              background:
                "linear-gradient(to bottom, rgba(244,241,233,0) 0%, rgba(244,241,233,0) 48%, rgba(244,241,233,0.48) 58%, rgba(244,241,233,0.86) 70%, #f4f1e9 86%)",
              zIndex: 5,
            }}
          />
          <div
            className="pointer-events-none absolute -inset-4 hidden rounded-xl dark:block"
            style={{
              background:
                "linear-gradient(to bottom, rgba(18,18,18,0) 0%, rgba(18,18,18,0) 48%, rgba(18,18,18,0.52) 58%, rgba(18,18,18,0.88) 70%, #121212 86%)",
              zIndex: 5,
            }}
          />

          {/* Bottom Section */}
          <div className="absolute bottom-0 left-0 right-0 px-6 pb-2 pt-4" style={{ zIndex: 10 }}>
          <div className="flex items-start justify-between mb-4">
            {/* Bonuses Section */}
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                <motion.div
                  className="w-0.5 h-4 rounded-full"
                  style={{ backgroundColor: '#ec5c13' }}
                  initial={false}
                  animate={shouldAnimate ? { opacity: 1, scaleY: 1 } : {}}
                  transition={{ delay: 0.4, type: "spring" }}
                />
                <motion.div
                  className="text-sm font-medium text-[#171717]/50 dark:text-[#ededed]/42"
                  initial={false}
                  animate={shouldAnimate ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.5 }}
                >
                  Bonuses
                </motion.div>
              </div>
              <div className="flex flex-col">
                <motion.div
                  className="text-left text-xl font-bold text-[#171717] dark:text-[#ededed]"
                  initial={false}
                  animate={shouldAnimate ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.6 }}
                >
                  ${bonusesValue!.toLocaleString()}
                </motion.div>
                <motion.div
                  className="text-xs font-medium text-left"
                  style={{ color: '#ec5c13' }}
                  initial={false}
                  animate={shouldAnimate ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.7 }}
                >
                  +15.2%
                </motion.div>
              </div>
            </div>

            {/* Incentives Section */}
            <div className="flex flex-col items-center gap-2 mb-2">
              <div className="flex items-center gap-2">
                <motion.div
                  className="w-0.5 h-4 rounded-full"
                  style={{ backgroundColor: '#8a7a60' }}
                  initial={false}
                  animate={shouldAnimate ? { opacity: 1, scaleY: 1 } : {}}
                  transition={{ delay: 0.8, type: "spring" }}
                />
                <motion.div
                  className="text-sm font-medium text-[#171717]/50 dark:text-[#ededed]/42"
                  initial={false}
                  animate={shouldAnimate ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.9 }}
                >
                  Incentives
                </motion.div>
              </div>
              <div className="flex flex-col">
                <motion.div
                  className="text-left text-xl font-bold text-[#171717] dark:text-[#ededed]"
                  initial={false}
                  animate={shouldAnimate ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 1.0 }}
                >
                  ${incentivesValue!.toLocaleString()}
                </motion.div>
                <motion.div
                  className="text-xs font-medium text-left"
                  style={{ color: '#ec5c13' }}
                  initial={false}
                  animate={shouldAnimate ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 1.1 }}
                >
                  +8.7%
                </motion.div>
              </div>
            </div>
          </div>

          <BjorkButton
            variant="outline"
            className="mb-4 w-full"
            initial={false}
            animate={shouldAnimate ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 1.1 }}
            whileHover={shouldAnimate ? { scale: 1.02 } : {}}
            whileTap={shouldAnimate ? { scale: 0.98 } : {}}
            onClick={onMoreDetails}
          >
            More Details
          </BjorkButton>
        </div>
        </div>

      </motion.div>
    </motion.div>
  );
}
