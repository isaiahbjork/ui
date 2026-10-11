"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function BjorkButtonGroup({
  className,
  borderless = false,
  ...props
}: React.ComponentProps<"div"> & { borderless?: boolean }) {
  return (
    <div
      role="group"
      className={cn(
        "inline-flex min-w-0 gap-1.5 rounded-[18px] bg-[var(--bjork-surface-muted)] p-1.5 shadow-[var(--bjork-shadow-surface)] [&>button]:rounded-[12px]",
        borderless ? "border-0" : "border border-[color:var(--bjork-border)]",
        className,
      )}
      {...props}
    />
  );
}
