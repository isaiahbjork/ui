"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export function BjorkCheckbox({
  className,
  ...props
}: React.ComponentProps<typeof Checkbox>) {
  return (
    <Checkbox
      className={cn(
        "size-5 rounded-[7px] border-[color:var(--bjork-border-strong)] bg-[var(--bjork-bg)] text-white shadow-[var(--bjork-shadow-soft)] transition-[background-color,border-color,box-shadow,color] duration-200 data-[state=checked]:border-[#ec5c13] data-[state=checked]:bg-[#ec5c13] focus-visible:ring-[#ec5c13]/35 dark:border-[color:var(--bjork-border-muted)] dark:bg-[var(--bjork-surface)] dark:text-[color:var(--bjork-text)] dark:shadow-[var(--bjork-shadow-surface)] dark:hover:bg-[var(--bjork-surface-hover)] dark:data-[state=checked]:border-[color:var(--bjork-border-muted)] dark:data-[state=checked]:bg-[var(--bjork-surface)] dark:data-[state=checked]:text-[color:var(--bjork-text)] dark:data-[state=checked]:shadow-[var(--bjork-shadow-surface)]",
        className,
      )}
      {...props}
    />
  );
}
