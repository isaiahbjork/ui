"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const bjorkTextareaVariants = cva(
  "bjork-textarea-hidden-resizer min-h-[120px] w-[min(380px,100%)] rounded-[18px] border px-4 py-3 text-sm !text-[color:var(--bjork-text)] !outline-none transition-[background-color,border-color,box-shadow,opacity] duration-200 placeholder:!text-[color:var(--bjork-text-faint)] selection:bg-[#ec5c13]/30 selection:text-[color:var(--bjork-text)] focus-visible:!outline-none focus-visible:!ring-0 focus-visible:!ring-offset-0 disabled:cursor-not-allowed disabled:opacity-35",
  {
    variants: {
      variant: {
        default:
          "!border-transparent !bg-[var(--bjork-field)] !shadow-[var(--bjork-shadow-surface)] hover:!bg-[var(--bjork-surface-hover)] focus-visible:!border-transparent",
        quiet:
          "!border-transparent !bg-[var(--bjork-field-muted)] !text-[color:var(--bjork-text-strong)] !shadow-[var(--bjork-shadow-soft)] hover:!bg-[var(--bjork-surface-hover)] focus-visible:!border-transparent",
        inset:
          "!border-[color:var(--bjork-border)] !bg-[var(--bjork-field-inset)] !shadow-[var(--bjork-shadow-inset)] hover:!bg-[var(--bjork-panel)] focus-visible:!border-[color:var(--bjork-border)]",
        ghost:
          "!border-transparent !bg-transparent !shadow-none hover:!bg-transparent focus-visible:!border-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type BjorkTextareaVariant = NonNullable<VariantProps<typeof bjorkTextareaVariants>["variant"]> | "base" | "outline";

export interface BjorkTextareaProps
  extends React.ComponentProps<typeof Textarea>,
    Omit<VariantProps<typeof bjorkTextareaVariants>, "variant"> {
  variant?: BjorkTextareaVariant;
}

function normalizeTextareaVariant(variant: BjorkTextareaVariant | undefined) {
  if (variant === "base") return "default";
  if (variant === "outline") return "inset";
  return variant;
}

export function BjorkTextarea({
  className,
  variant,
  ...props
}: BjorkTextareaProps) {
  const resolvedVariant = normalizeTextareaVariant(variant) ?? "default";

  return (
    <Textarea
      className={cn(
        "bjork-textarea",
        `bjork-textarea-${resolvedVariant}`,
        bjorkTextareaVariants({
          variant: resolvedVariant,
          className,
        }),
      )}
      {...props}
    />
  );
}

export { bjorkTextareaVariants };
