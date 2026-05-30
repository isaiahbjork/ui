"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

type BjorkSwitchSize = "sm" | "md" | "lg";

const switchSizeClasses: Record<
  BjorkSwitchSize,
  {
    root: string;
    track: string;
    marker: string;
    thumb: string;
    thumbTranslate: string;
  }
> = {
  sm: {
    root: "h-5 w-9",
    track: "h-1.5",
    marker: "w-1.5",
    thumb: "h-1.5 w-3",
    thumbTranslate: "data-[state=checked]:translate-x-6",
  },
  md: {
    root: "h-6 w-11",
    track: "h-2",
    marker: "w-2",
    thumb: "h-2 w-4",
    thumbTranslate: "data-[state=checked]:translate-x-7",
  },
  lg: {
    root: "h-7 w-[52px]",
    track: "h-2.5",
    marker: "w-2.5",
    thumb: "h-2.5 w-5",
    thumbTranslate: "data-[state=checked]:translate-x-8",
  },
};

export interface BjorkSwitchProps
  extends Omit<React.ComponentProps<typeof SwitchPrimitive.Root>, "asChild"> {
  size?: BjorkSwitchSize;
}

export function BjorkSwitch({
  className,
  size = "md",
  ...props
}: BjorkSwitchProps) {
  const sizeClasses = switchSizeClasses[size];

  return (
    <SwitchPrimitive.Root
      data-slot="bjork-switch"
      className={cn(
        "group relative inline-flex shrink-0 items-center rounded-full outline-none transition-[opacity,filter] duration-150 focus-visible:ring-2 focus-visible:ring-[#ec5c13]/36 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bjork-ring-offset)] disabled:pointer-events-none disabled:opacity-35",
        sizeClasses.root,
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 overflow-hidden rounded-full bg-[var(--bjork-track)]",
          "shadow-[inset_0_1px_1px_rgba(255,255,255,0.04),0_0_14px_rgba(189,69,20,0.06)]",
          sizeClasses.track,
        )}
      >
        <span className="absolute inset-y-0 left-0 w-full origin-left scale-x-0 rounded-full bg-gradient-to-r from-[#bd4514] to-[#d86a2c] transition-transform duration-200 ease-out group-data-[state=checked]:scale-x-[0.68]" />
        <span className={cn("absolute inset-y-0 left-[68%] hidden bg-[var(--bjork-thumb)] group-data-[state=checked]:block", sizeClasses.marker)} />
      </span>
      <SwitchPrimitive.Thumb
        data-slot="bjork-switch-thumb"
        className={cn(
          "pointer-events-none relative z-10 block rounded-full bg-[var(--bjork-thumb)]",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_0_1px_rgba(0,0,0,0.42)]",
          "transition-transform duration-200 ease-out data-[state=unchecked]:translate-x-0",
          sizeClasses.thumb,
          sizeClasses.thumbTranslate,
        )}
      />
    </SwitchPrimitive.Root>
  );
}
