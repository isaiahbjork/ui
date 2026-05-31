"use client";

import * as React from "react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { cn } from "@/lib/utils";

export type BjorkInputOTPVariant = "default" | "quiet" | "inset" | "ghost";

export interface BjorkInputOTPProps {
  variant?: BjorkInputOTPVariant;
  value?: string;
  defaultValue?: string;
  maxLength?: number;
  onChange?: (value: string) => void;
  className?: string;
  slotClassName?: string;
}

const slotVariants: Record<BjorkInputOTPVariant, string> = {
  default:
    "border border-transparent bg-[var(--bjork-field)] shadow-[var(--bjork-shadow-surface)] hover:bg-[var(--bjork-surface-hover)]",
  quiet:
    "border border-transparent bg-[var(--bjork-field-muted)] text-[color:var(--bjork-text-soft)] shadow-none hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text-medium)]",
  inset:
    "border border-[color:var(--bjork-border)] bg-[var(--bjork-field-inset)] shadow-[var(--bjork-shadow-inset)] hover:bg-[var(--bjork-panel)]",
  ghost:
    "border border-transparent bg-transparent text-[color:var(--bjork-text-muted)] shadow-none hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)]",
};

export function BjorkInputOTP({
  variant = "default",
  value,
  defaultValue = "284915",
  maxLength = 6,
  onChange,
  className,
  slotClassName,
}: BjorkInputOTPProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const currentValue = value ?? internalValue;

  const handleChange = (nextValue: string) => {
    if (value === undefined) {
      setInternalValue(nextValue);
    }

    onChange?.(nextValue);
  };

  return (
    <InputOTP maxLength={maxLength} value={currentValue} onChange={handleChange}>
      <InputOTPGroup className={cn("gap-2 px-1 py-1", className)}>
        {Array.from({ length: maxLength }).map((_, index) => (
          <InputOTPSlot
            key={index}
            index={index}
            className={cn(
              "bjork-otp-slot h-11 w-10 rounded-[13px] text-[color:var(--bjork-text)] transition-[background-color,border-color,box-shadow,color] duration-200 first:rounded-[13px] first:border last:rounded-[13px] data-[active=true]:border-[color:var(--bjork-border-strong)] data-[active=true]:ring-[color:var(--bjork-border-strong)]/25",
              `bjork-otp-slot-${variant}`,
              slotVariants[variant],
              slotClassName,
            )}
          />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}
