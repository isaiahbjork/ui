"use client";

import * as React from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const bjorkBadgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] border font-medium outline-none transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent-muted)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bjork-ring-offset)] [&_svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--bjork-text)] text-[color:var(--bjork-inverted-text)] shadow-[var(--bjork-shadow-soft)]",
        secondary:
          "border-transparent bg-[var(--bjork-surface-active)] text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-soft)]",
        outline:
          "border-[color:var(--bjork-border)] bg-[var(--bjork-field-inset)] text-[color:var(--bjork-text-medium)]",
        muted:
          "border-transparent bg-[var(--bjork-field-muted)] text-[color:var(--bjork-text-soft)]",
        accent:
          "border-[color:var(--bjork-accent-muted)] bg-[var(--bjork-accent-badge)] text-[color:var(--bjork-accent-badge-foreground)] shadow-[var(--bjork-shadow-soft)]",
      },
      size: {
        sm: "px-1.5 py-0.5 text-[11px]",
        md: "px-2 py-1 text-xs",
        lg: "px-2.5 py-1.5 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

export interface BjorkBadgeProps
  extends Omit<HTMLMotionProps<"span">, "ref">,
    VariantProps<typeof bjorkBadgeVariants> {}

export function BjorkBadge({
  className,
  variant,
  size,
  ...props
}: BjorkBadgeProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.span
      data-slot="bjork-badge"
      className={cn(bjorkBadgeVariants({ variant, size, className }))}
      whileHover={shouldReduceMotion ? undefined : { y: -1, opacity: 0.92 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      {...props}
    />
  );
}

export { bjorkBadgeVariants };
