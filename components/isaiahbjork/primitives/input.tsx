"use client";

import * as React from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const bjorkInputVariants = cva(
  "flex w-full min-w-0 rounded-[13px] border-0 bg-[var(--bjork-field)] text-[color:var(--bjork-text)] outline-none backdrop-blur-md transition-[background-color,border-color,box-shadow,opacity,transform] duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[color:var(--bjork-text-soft)] selection:bg-[#ec5c13]/30 selection:text-[color:var(--bjork-text)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-35 focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-border-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bjork-ring-offset)]",
  {
    variants: {
      variant: {
        default:
          "shadow-[var(--bjork-shadow-surface)] hover:bg-[var(--bjork-surface-hover)]",
        quiet:
          "bg-[var(--bjork-field-muted)] text-[color:var(--bjork-text-strong)] shadow-[var(--bjork-shadow-soft)] hover:bg-[var(--bjork-surface-hover)]",
        inset:
          "border border-[color:var(--bjork-border)] bg-[var(--bjork-field-inset)] shadow-[var(--bjork-shadow-inset)] hover:bg-[var(--bjork-panel)]",
        ghost:
          "bg-transparent shadow-none hover:bg-transparent",
        error:
          "border border-[#ec5c13]/42 bg-[var(--bjork-error-bg)] shadow-[inset_0_7px_14px_rgba(236,92,19,0.035),0_8px_14px_-13px_rgba(236,92,19,0.28)] focus-visible:ring-[color:var(--bjork-border-strong)]",
      },
      inputSize: {
        sm: "h-9 px-3 text-xs",
        md: "h-[45px] px-4 text-sm",
        lg: "h-12 px-4 text-[15px]",
      },
    },
    defaultVariants: {
      variant: "default",
      inputSize: "md",
    },
  },
);

export interface BjorkInputProps
  extends Omit<HTMLMotionProps<"input">, "ref" | "size">,
    VariantProps<typeof bjorkInputVariants> {
  icon?: React.ReactNode;
}

export function BjorkInput({
  className,
  icon,
  variant,
  inputSize,
  type = "text",
  ...props
}: BjorkInputProps) {
  const shouldReduceMotion = useReducedMotion();

  const input = (
    <motion.input
      data-slot="bjork-input"
      type={type}
      className={cn(
        bjorkInputVariants({
          variant,
          inputSize,
          className: cn(icon && "pl-9", className),
        })
      )}
      whileFocus={shouldReduceMotion ? undefined : { y: -1 }}
      transition={{ type: "spring", stiffness: 360, damping: 30 }}
      {...props}
    />
  );

  if (!icon) return input;

  return (
    <div className="relative w-full min-w-0">
      <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[color:var(--bjork-text-soft)] [&>svg]:size-4">
        {icon}
      </span>
      {input}
    </div>
  );
}

export { bjorkInputVariants };
