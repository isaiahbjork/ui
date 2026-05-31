"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { bjorkMenuItem } from "./_shared";

type BjorkFieldVariant = "default" | "quiet" | "inset" | "ghost";
export type BjorkSelectVariant = BjorkFieldVariant | "base" | "outline";

export interface BjorkSelectOption {
  value: string;
  label: string;
}

export interface BjorkSelectProps {
  options?: BjorkSelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  variant?: BjorkSelectVariant;
  className?: string;
  contentClassName?: string;
  itemClassName?: string;
}

const defaultOptions: BjorkSelectOption[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const triggerVariants: Record<BjorkFieldVariant, string> = {
  default:
    "border-transparent bg-[var(--bjork-field)] text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-surface)] hover:bg-[var(--bjork-surface-hover)]",
  quiet:
    "border-transparent bg-[var(--bjork-field-muted)] text-[color:var(--bjork-text-soft)] shadow-none hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text-medium)]",
  inset:
    "border-[color:var(--bjork-border)] bg-[var(--bjork-field-inset)] text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-inset)] hover:border-[color:var(--bjork-border-strong)] hover:bg-[var(--bjork-panel)]",
  ghost:
    "border-transparent bg-transparent text-[color:var(--bjork-text-muted)] shadow-none hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)]",
};

const contentVariants: Record<BjorkFieldVariant, string> = {
  default:
    "rounded-[18px] border-[color:var(--bjork-border-muted)] bg-[var(--bjork-surface)] p-1.5 shadow-[var(--bjork-shadow-surface)]",
  quiet:
    "rounded-[18px] border-transparent bg-[var(--bjork-field-muted)] p-1.5 shadow-[var(--bjork-shadow-soft)]",
  inset:
    "rounded-[18px] border-[color:var(--bjork-border)] bg-[var(--bjork-field-inset)] p-1.5 shadow-[var(--bjork-shadow-inset)]",
  ghost:
    "rounded-[18px] border-transparent bg-[var(--bjork-menu)] p-1.5 shadow-[var(--bjork-shadow-menu)] backdrop-blur-xl",
};

function normalizeVariant(variant: BjorkSelectVariant): BjorkFieldVariant {
  if (variant === "base") return "default";
  if (variant === "outline") return "inset";
  return variant;
}

export function BjorkSelect({
  options = defaultOptions,
  value,
  defaultValue = "weekly",
  onValueChange,
  placeholder = "Cadence",
  variant = "default",
  className,
  contentClassName,
  itemClassName,
}: BjorkSelectProps) {
  const resolvedVariant = normalizeVariant(variant);
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const currentValue = value ?? internalValue;
  const selectedLabel = options.find((option) => option.value === currentValue)?.label;

  const handleValueChange = (nextValue: string) => {
    if (value === undefined) {
      setInternalValue(nextValue);
    }

    onValueChange?.(nextValue);
  };

  return (
    <Select
      value={currentValue}
      onValueChange={handleValueChange}
    >
      <SelectTrigger
        className={cn(
          "bjork-select-trigger h-[45px] w-[210px] rounded-[13px] px-3 focus-visible:ring-[color:var(--bjork-border-strong)]/45",
          `bjork-select-trigger-${resolvedVariant}`,
          triggerVariants[resolvedVariant],
          className,
        )}
      >
        <SelectValue placeholder={placeholder}>
          <span className="truncate">{selectedLabel ?? placeholder}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        className={cn(
          "bjork-select-content w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)] box-border",
          `bjork-select-content-${resolvedVariant}`,
          contentVariants[resolvedVariant],
          contentClassName,
        )}
      >
        {options.map((option) => (
          <SelectItem
            key={option.value}
            className={cn(bjorkMenuItem, itemClassName)}
            value={option.value}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
