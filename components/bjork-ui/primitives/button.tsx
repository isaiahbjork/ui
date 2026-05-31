"use client";

import * as React from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { cva, type VariantProps } from "class-variance-authority";
import { useWebHaptics } from "web-haptics/react";
import type { HapticInput, TriggerOptions } from "web-haptics";
import { cn } from "@/lib/utils";

const bjorkButtonVariants = cva(
  "inline-flex shrink-0 transform-gpu items-center justify-center gap-2 whitespace-nowrap rounded-[13px] text-sm font-medium tracking-[-0.01em] outline-none backdrop-blur-md transition-[background-color,border-color,color,box-shadow,opacity] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-[#ec5c13]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bjork-ring-offset)] disabled:pointer-events-none disabled:opacity-35 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-transparent bg-[var(--bjork-field)] text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-surface)] hover:bg-[var(--bjork-surface-hover)]",
        secondary:
          "border border-[color:var(--bjork-border)] bg-[var(--bjork-surface-active)] text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-soft)] hover:bg-[var(--bjork-surface-hover)]",
        outline:
          "border border-[color:var(--bjork-border)] bg-[var(--bjork-field-inset)] text-[color:var(--bjork-text-strong)] shadow-[var(--bjork-shadow-soft)] hover:border-[color:var(--bjork-border-strong)] hover:bg-[var(--bjork-surface)] hover:text-[color:var(--bjork-text)]",
        ghost:
          "border border-transparent bg-transparent text-[color:var(--bjork-text-muted)] hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)]",
        quiet:
          "border border-transparent bg-[var(--bjork-field-muted)] text-[color:var(--bjork-text-soft)] hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text-medium)]",
        accent:
          "bjork-layered-button-accent tracking-tight text-white",
        raised:
          "bjork-layered-button-raised tracking-tight",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-[45px] px-4",
        lg: "h-12 px-5 text-[15px]",
        icon: "size-[45px] p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

export interface BjorkButtonProps
  extends Omit<HTMLMotionProps<"button">, "ref" | "size">,
    VariantProps<typeof bjorkButtonVariants> {
  haptics?: boolean;
  hapticPattern?: HapticInput;
  hapticOptions?: TriggerOptions;
}

export function BjorkButton({
  className,
  variant,
  size,
  disabled,
  haptics = true,
  hapticPattern = "light",
  hapticOptions,
  onPointerDown,
  ...props
}: BjorkButtonProps) {
  const shouldReduceMotion = useReducedMotion();
  const { trigger } = useWebHaptics();

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!disabled && haptics) {
        void trigger(hapticPattern, hapticOptions);
      }

      onPointerDown?.(event);
    },
    [disabled, hapticOptions, hapticPattern, haptics, onPointerDown, trigger],
  );

  return (
    <motion.button
      data-slot="bjork-button"
      className={cn(bjorkButtonVariants({ variant, size, className }))}
      disabled={disabled}
      onPointerDown={handlePointerDown}
      whileHover={disabled || shouldReduceMotion ? undefined : { scale: 1.05 }}
      whileTap={disabled || shouldReduceMotion ? undefined : { scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      {...props}
    />
  );
}

export { bjorkButtonVariants };
