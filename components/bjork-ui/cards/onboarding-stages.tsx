"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState, useEffect } from "react";
import { Check, Share2, Package, CreditCard, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";

interface StageItem {
  id: string;
  text: string;
  completed: boolean;
  icon: React.ReactNode;
}

interface ThemeColors {
  // Background gradients
  outerGradient?: {
    from: string;
    to: string;
  };
  
  // Header colors
  headerBackground?: string;
  headerText?: string;
  percentageText?: string;
  
  // Card colors
  cardBackground?: string;
  dividerColor?: string;
  
  // Stage colors
  stageTitle?: string;
  completedBadge?: {
    background: string;
    text: string;
  };
  todoBadge?: {
    background: string;
    text: string;
  };
  
  // Item colors
  completedIcon?: {
    background: string;
    text: string;
  };
  completedText?: string;
  pendingIcon?: string;
  pendingText?: string;
  
  // Button colors
  button?: {
    background: string;
    hover: string;
    text: string;
  };
}

interface OnboardingStagesProps {
  className?: string;
  enableAnimations?: boolean;
  onButtonClick?: () => void;
  
  // Customization props
  title?: string;
  percentage?: number;
  buttonText?: string;
  
  // Theme customization
  theme?: 'blue' | 'purple' | 'green' | 'orange' | 'custom';
  customColors?: ThemeColors;
  
  // Animation controls
  animationDuration?: number;
  staggerDelay?: number;
  
  // Layout props
  variant?: 'default' | 'compact' | 'expanded';
  showPercentage?: boolean;
  rounded?: 'sm' | 'md' | 'lg' | 'xl';
}

const brandTheme: ThemeColors = {
  outerGradient: { from: "from-[#f4f1e9] dark:from-[#121212]", to: "to-[#eee9df] dark:to-[#090909]" },
  headerText: "text-[#171717]/58 dark:text-[#ededed]/42",
  percentageText: "text-[#bd4514] dark:text-[#d86a2c]",
  cardBackground:
    "bg-[#f4f1e9] dark:bg-[#121212] border border-[#d8d3c7] dark:border-[#161616] shadow-[inset_0_7px_14px_rgba(255,255,255,0.62),inset_0_0.5px_0.5px_rgba(255,255,255,0.9),0_18px_34px_-16px_rgba(55,47,36,0.28)] dark:shadow-[inset_0_7px_14px_rgba(255,255,255,0.03),inset_0_0.5px_0.5px_rgba(255,255,255,0.06),0_18px_34px_-16px_rgba(0,0,0,0.9)]",
  dividerColor: "bg-[#d8d3c7] dark:bg-[#232323]",
  stageTitle: "text-[#171717] dark:text-[#ededed]",
  completedBadge: { background: "bg-[#8a7a60]/14", text: "text-[#6b5f4b] dark:text-[#b8aa91]" },
  todoBadge: { background: "bg-[#ec5c13]/12", text: "text-[#bd4514] dark:text-[#d86a2c]" },
  completedIcon: { background: "bg-[#ec5c13]", text: "text-[#080808]" },
  completedText: "text-[#171717]/76 dark:text-[#ededed]/72",
  pendingIcon: "text-[#bd4514] dark:text-[#d86a2c]",
  pendingText: "text-[#171717]/52 dark:text-[#ededed]/42",
  button: { background: "bg-[#ec5c13]", hover: "hover:bg-[#f06d27]", text: "text-[#080808]" },
};

// Predefined theme configurations stay for API compatibility, but use the house style.
const themes: Record<string, ThemeColors> = {
  blue: brandTheme,
  purple: brandTheme,
  green: brandTheme,
  orange: brandTheme,
};

export function OnboardingStages({
  className,
  enableAnimations = true,
  onButtonClick,
  title = "ONBOARDING",
  percentage = 40,
  buttonText = "Let's Go",
  theme = 'blue',
  customColors,
  animationDuration = 1500,
  staggerDelay = 0.12,
  variant = 'expanded',
  showPercentage = true,
  rounded = 'xl',
}: OnboardingStagesProps) {
  const [displayPercentage, setDisplayPercentage] = useState(0);
  const shouldReduceMotion = useReducedMotion();

  // Get theme colors
  const themeColors = customColors || themes[theme] || themes.blue;

  // Responsive padding based on variant
  const variantStyles = {
    compact: "p-0.5",
    default: "p-1",
    expanded: "p-2",
  };

  // Rounded styles
  const roundedStyles = {
    sm: "rounded-lg",
    md: "rounded-xl",
    lg: "rounded-2xl",
    xl: "rounded-3xl",
  };

  // Animate percentage counter on mount
  useEffect(() => {
    if (!enableAnimations || shouldReduceMotion) {
      setDisplayPercentage(percentage);
      return;
    }

    const startTime = Date.now();

    const animateCounter = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / animationDuration, 1);
      
      // More sophisticated easing with overshoot
      const easeOut = 1 - Math.pow(1 - progress, 2.5);
      const currentValue = Math.round(easeOut * percentage);
      
      setDisplayPercentage(currentValue);

      if (progress < 1) {
        requestAnimationFrame(animateCounter);
      }
    };

    const timeout = setTimeout(animateCounter, 200);
    return () => clearTimeout(timeout);
  }, [enableAnimations, shouldReduceMotion, percentage, animationDuration]);

  const stage1Items: StageItem[] = [
    {
      id: "mission",
      text: "Define your brand mission",
      completed: true,
      icon: <Check className="w-4 h-4" />,
    },
    {
      id: "logo",
      text: "Upload your brand logo",
      completed: true,
      icon: <Check className="w-4 h-4" />,
    },
    {
      id: "colors",
      text: "Select your brand colors",
      completed: true,
      icon: <Check className="w-4 h-4" />,
    },
  ];

  const stage2Items: StageItem[] = [
    {
      id: "social",
      text: "Connect your social media accounts",
      completed: false,
      icon: <Share2 className="w-4 h-4" />,
    },
    {
      id: "product",
      text: "Add your first product/service",
      completed: false,
      icon: <Package className="w-4 h-4" />,
    },
    {
      id: "payment",
      text: "Set up your payment methods",
      completed: false,
      icon: <CreditCard className="w-4 h-4" />,
    },
    {
      id: "shipping",
      text: "Configure your shipping options",
      completed: false,
      icon: <Truck className="w-4 h-4" />,
    },
  ];

  const shouldAnimate = enableAnimations && !shouldReduceMotion;

  // Enhanced animation variants with more sophisticated timing
  const containerVariants = {
    hidden: { 
      opacity: 0, 
      y: 30, 
      scale: 0.92,
      rotateX: 10, // Subtle 3D entrance effect
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      rotateX: 0,
      transition: {
        type: "spring",
        stiffness: 280,
        damping: 32,
        mass: 0.9,
        staggerChildren: Math.min(staggerDelay, 0.06),
        delayChildren: 0.05,
      },
    },
  };

  const headerVariants = {
    hidden: { opacity: 0, x: -30, scale: 0.9 },
    visible: {
      opacity: 1,
      x: 0,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 350,
        damping: 28,
        mass: 0.7,
      },
    },
  };

  const itemVariants = {
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
      },
    },
  };

  const stageContainerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: Math.min(staggerDelay * 0.8, 0.05),
        delayChildren: 0.03,
      },
    },
  };

  const iconVariants = {
    hidden: { scale: 0, rotate: -180, opacity: 0 },
    visible: {
      scale: 1,
      rotate: 0,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 500,
        damping: 22,
        mass: 0.5,
      },
    },
  };

  const buttonVariants = {
    hidden: { 
      opacity: 0, 
      y: 25, 
      scale: 0.95,
      rotateX: 5,
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      rotateX: 0,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 30,
        mass: 0.8,
        delay: 0.25,
      },
    },
  };

  const percentageVariants = {
    hidden: { scale: 0, opacity: 0, rotate: -10 },
    visible: {
      scale: 1,
      opacity: 1,
      rotate: 0,
      transition: {
        type: "spring",
        stiffness: 400,
        damping: 20,
        mass: 0.6,
        delay: 0.2,
      },
    },
  };

  return (
    <motion.div 
      className={cn("relative", className)}
      initial={false}
      animate="visible"
      variants={shouldAnimate ? containerVariants : {}}
    >
      {/* Outer card with customizable gradient */}
      <div className={cn(
        variantStyles[variant],
        `bg-gradient-to-br ${themeColors.outerGradient?.from} ${themeColors.outerGradient?.to}`,
        roundedStyles[rounded],
        "shadow-none"
      )}>
        {/* Header */}
        <motion.div
          className="flex items-center justify-between px-4 py-2"
          variants={shouldAnimate ? headerVariants : {}}
        >
          <h1 className={cn(
            "text-md font-semibold tracking-wide",
            themeColors.headerText
          )}>
            {title}
          </h1>
          {showPercentage && (
            <motion.div
              className={cn("text-md font-bold", themeColors.percentageText)}
              variants={shouldAnimate ? percentageVariants : {}}
            >
              {displayPercentage}%
            </motion.div>
          )}
        </motion.div>
        
        {/* Inner card */}
        <motion.div
          className={cn(
            themeColors.cardBackground,
            variant === 'compact' ? 'rounded-lg' : 'rounded-2xl',
            "overflow-hidden"
          )}
          variants={shouldAnimate ? itemVariants : {}}
        >
          <div className={cn(
            variant === 'compact' ? 'p-4 pt-3' : variant === 'expanded' ? 'p-10 pt-8' : 'p-8 pt-6'
          )}>

            {/* Stage 1 */}
            <motion.div
              className="mb-8"
              variants={shouldAnimate ? stageContainerVariants : {}}
            >
              <motion.div 
                className="flex items-center justify-between mb-6"
                variants={shouldAnimate ? itemVariants : {}}
              >
                <h2 className={cn("text-lg font-semibold tracking-[-0.02em]", themeColors.stageTitle)}>
                  STAGE 1
                </h2>
                <span className={cn(
                  "rounded-lg border border-[#d8d3c7] px-3 py-1 text-sm font-medium dark:border-[#232323]",
                  themeColors.completedBadge?.background,
                  themeColors.completedBadge?.text
                )}>
                  Completed
                </span>
              </motion.div>

              <motion.div 
                className="space-y-4"
                variants={shouldAnimate ? stageContainerVariants : {}}
              >
                {stage1Items.map((item, index) => (
                  <motion.div
                    key={item.id}
                    className="flex items-center space-x-3"
                    variants={shouldAnimate ? itemVariants : {}}
                    custom={index}
                  >
                    <motion.div
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-lg",
                        themeColors.completedIcon?.background,
                        themeColors.completedIcon?.text
                      )}
                      variants={shouldAnimate ? iconVariants : {}}
                      whileHover={
                        shouldAnimate
                          ? {
                              scale: 1.15,
                              rotate: 10,
                              transition: {
                                type: "spring",
                                stiffness: 500,
                                damping: 20,
                              },
                            }
                          : {}
                      }
                    >
                      <Check className="w-3 h-3" />
                    </motion.div>
                    <span className={cn("font-medium", themeColors.completedText)}>
                      {item.text}
                    </span>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>

            {/* Divider */}
            <motion.div
              className={cn("h-px mb-8", themeColors.dividerColor)}
              variants={shouldAnimate ? itemVariants : {}}
            />

            {/* Stage 2 */}
            <motion.div
              className="mb-8"
              variants={shouldAnimate ? stageContainerVariants : {}}
            >
              <motion.div 
                className="flex items-center justify-between mb-6"
                variants={shouldAnimate ? itemVariants : {}}
              >
                <h2 className={cn("text-lg font-semibold tracking-[-0.02em]", themeColors.stageTitle)}>
                  STAGE 2
                </h2>
                <span className={cn(
                  "rounded-lg border border-[#ec5c13]/18 px-3 py-1 text-sm font-medium",
                  themeColors.todoBadge?.background,
                  themeColors.todoBadge?.text
                )}>
                  To Do
                </span>
              </motion.div>

              <motion.div 
                className="space-y-4"
                variants={shouldAnimate ? stageContainerVariants : {}}
              >
                {stage2Items.map((item, index) => (
                  <motion.div
                    key={item.id}
                    className="flex items-center space-x-3"
                    variants={shouldAnimate ? itemVariants : {}}
                    custom={index}
                  >
                    <motion.div
                      className={cn("mr-2 rounded-lg border border-[#d8d3c7] bg-[#eee9df] p-1.5 dark:border-[#232323] dark:bg-[#090909]", themeColors.pendingIcon)}
                      variants={shouldAnimate ? iconVariants : {}}
                      whileHover={
                        shouldAnimate
                          ? {
                              scale: 1.1,
                              x: 2,
                              transition: {
                                type: "spring",
                                stiffness: 400,
                                damping: 25,
                              },
                            }
                          : {}
                      }
                    >
                      {item.icon}
                    </motion.div>
                    <span className={cn("font-medium", themeColors.pendingText)}>
                      {item.text}
                    </span>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>

            {/* Button */}
            <BjorkButton
              variant="accent"
              size="lg"
              className="w-full"
              variants={shouldAnimate ? buttonVariants : {}}
              whileHover={
                shouldAnimate
                  ? {
                      scale: 1.02,
                      y: -3,
                      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
                      transition: {
                        type: "spring",
                        stiffness: 400,
                        damping: 20,
                      },
                    }
                  : {}
              }
              whileTap={shouldAnimate ? { scale: 0.98, y: -1 } : {}}
              onClick={onButtonClick}
            >
              {buttonText}
            </BjorkButton>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
