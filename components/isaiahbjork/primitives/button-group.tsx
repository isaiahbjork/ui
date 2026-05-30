"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function BjorkButtonGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      role="group"
      className={cn(
        "inline-flex gap-1 rounded-[18px] border border-[color:var(--bjork-border)] bg-[var(--bjork-surface-muted)] p-1.5 shadow-[var(--bjork-shadow-surface)] [&>button]:rounded-[12px]",
        className,
      )}
      {...props}
    />
  );
}
