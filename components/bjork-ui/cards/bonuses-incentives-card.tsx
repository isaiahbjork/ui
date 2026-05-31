"use client";

import type { CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";

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
  borderColor: "border-[color:var(--bjork-border-muted)]",
  backgroundColor: "bg-[var(--bjork-surface)]",
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

  const bonusDelay = (delay: number): CSSProperties => {
    return { "--bonus-delay": `${delay}s` } as CSSProperties;
  };

  const dotStyle = (color: string, delay: number): CSSProperties => {
    return {
      color,
      "--bonus-delay": `${delay}s`,
    } as CSSProperties;
  };


  return (
    <motion.div
      className={cn("w-full max-w-md", shouldAnimate && "bjork-bonus-card-enter")}
      initial={false}
    >
      <motion.div
        className={cn(
          backgroundColor,
          borderColor,
          "overflow-hidden rounded-[20px] border text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-surface)]"
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
                  data-bonus-dot
                  fill="currentColor"
                  style={dotStyle("#ec5c13", dot.delay)}
                />
              ))}

              {/* Inner dots */}
              {innerDots.map((dot, index) => (
                <motion.circle
                  key={`inner-${index}`}
                  cx={dot.x}
                  cy={dot.y}
                  r="10"
                  data-bonus-dot
                  fill="currentColor"
                  style={dotStyle("#8a7a60", dot.delay + 0.08)}
                />
              ))}
            </svg>

            {/* Center Text Overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none -mt-24 -ml-12">
              <div className="text-center" style={{ zIndex: 20 }}>
                <motion.div 
                  data-bonus-enter
                  className="mb-2 text-xl font-medium text-[color:var(--bjork-text-muted)]"
                  initial={false}
                  style={bonusDelay(0.3)}
                >
                  TOTAL
                </motion.div>
                <motion.div 
                  data-bonus-enter
                  className="text-5xl font-bold text-[color:var(--bjork-text)]"
                  initial={false}
                  style={bonusDelay(0.5)}
                >
                  ${(bonusesValue! + incentivesValue!).toLocaleString()}
                </motion.div>
              </div>
            </div>
          </div>

          {/* Gradient fade overlay for bottom half - covers entire card */}
          <div
            className="pointer-events-none absolute -inset-4 rounded-xl"
            style={{
              background:
                "linear-gradient(to bottom, rgb(from var(--bjork-surface) r g b / 0) 0%, rgb(from var(--bjork-surface) r g b / 0) 48%, rgb(from var(--bjork-surface) r g b / 0.54) 58%, rgb(from var(--bjork-surface) r g b / 0.9) 70%, var(--bjork-surface) 86%)",
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
                  data-bonus-enter
                  className="w-0.5 h-4 rounded-full"
                  initial={false}
                  style={{ backgroundColor: "#ec5c13", ...bonusDelay(0.4) }}
                />
                <motion.div
                  data-bonus-enter
                  className="text-sm font-medium text-[color:var(--bjork-text-muted)]"
                  initial={false}
                  style={bonusDelay(0.5)}
                >
                  Bonuses
                </motion.div>
              </div>
              <div className="flex flex-col">
                <motion.div
                  data-bonus-enter
                  className="text-left text-xl font-bold text-[color:var(--bjork-text)]"
                  initial={false}
                  style={bonusDelay(0.6)}
                >
                  ${bonusesValue!.toLocaleString()}
                </motion.div>
                <motion.div
                  data-bonus-enter
                  className="text-xs font-medium text-left"
                  initial={false}
                  style={{ color: "#ec5c13", ...bonusDelay(0.7) }}
                >
                  +15.2%
                </motion.div>
              </div>
            </div>

            {/* Incentives Section */}
            <div className="flex flex-col items-center gap-2 mb-2">
              <div className="flex items-center gap-2">
                <motion.div
                  data-bonus-enter
                  className="w-0.5 h-4 rounded-full"
                  initial={false}
                  style={{ backgroundColor: "#8a7a60", ...bonusDelay(0.8) }}
                />
                <motion.div
                  data-bonus-enter
                  className="text-sm font-medium text-[color:var(--bjork-text-muted)]"
                  initial={false}
                  style={bonusDelay(0.9)}
                >
                  Incentives
                </motion.div>
              </div>
              <div className="flex flex-col">
                <motion.div
                  data-bonus-enter
                  className="text-left text-xl font-bold text-[color:var(--bjork-text)]"
                  initial={false}
                  style={bonusDelay(1)}
                >
                  ${incentivesValue!.toLocaleString()}
                </motion.div>
                <motion.div
                  data-bonus-enter
                  className="text-xs font-medium text-left"
                  initial={false}
                  style={{ color: "#ec5c13", ...bonusDelay(1.1) }}
                >
                  +8.7%
                </motion.div>
              </div>
            </div>
          </div>

          <BjorkButton
            variant="accent"
            data-bonus-enter
            className="mb-4 w-full"
            initial={false}
            style={bonusDelay(1.1)}
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
