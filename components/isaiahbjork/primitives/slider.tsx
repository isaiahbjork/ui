"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface BjorkSliderProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "defaultValue" | "max" | "min" | "onChange" | "step" | "type" | "value"
  > {
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  displayValue?: React.ReactNode;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  onValueChange?: (value: number) => void;
  trackClassName?: string;
  valueClassName?: string;
}

function getProgress(value: number, min: number, max: number) {
  if (max === min) return 0;

  return Math.min(Math.max(((value - min) / (max - min)) * 100, 0), 100);
}

export function BjorkSlider({
  className,
  defaultValue,
  disabled,
  displayValue,
  max = 100,
  min = 0,
  onChange,
  onValueChange,
  step = 1,
  trackClassName,
  value,
  valueClassName,
  ...props
}: BjorkSliderProps) {
  const [localValue, setLocalValue] = React.useState(defaultValue ?? min);
  const currentValue = value ?? localValue;
  const progress = getProgress(currentValue, min, max);

  const handleChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextValue = Number(event.target.value);

      if (value === undefined) {
        setLocalValue(nextValue);
      }

      onValueChange?.(nextValue);
      onChange?.(event);
    },
    [onChange, onValueChange, value],
  );

  const slider = (
    <input
      data-slot="bjork-slider"
      type="range"
      min={min}
      max={max}
      step={step}
      value={currentValue}
      disabled={disabled}
      onChange={handleChange}
      className={cn(
        "bjork-range h-2 w-full min-w-0 cursor-pointer appearance-none rounded-full outline-none transition-[opacity,filter] duration-150 focus-visible:ring-2 focus-visible:ring-[#ec5c13]/36 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bjork-ring-offset)] disabled:cursor-not-allowed disabled:opacity-35",
        trackClassName,
      )}
      style={{
        background: `linear-gradient(90deg,#bd4514 0%,#d86a2c ${Math.max(progress - 14, 0)}%,var(--bjork-thumb) ${progress}%,var(--bjork-track) ${progress}%,var(--bjork-track) 100%)`,
      }}
      {...props}
    />
  );

  if (displayValue === undefined || displayValue === null) {
    return <span className={cn("block min-w-0", className)}>{slider}</span>;
  }

  return (
    <span className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)_42px] items-center gap-2", className)}>
      {slider}
      <span
        data-slot="bjork-slider-value"
        className={cn(
          "w-[42px] overflow-hidden text-right font-mono text-[11px]",
          "text-[color:var(--bjork-text-soft)]",
          valueClassName,
        )}
      >
        {displayValue}
      </span>
    </span>
  );
}
