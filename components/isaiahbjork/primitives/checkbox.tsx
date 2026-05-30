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
        "size-5 rounded-[7px] border-[color:var(--bjork-border-strong)] bg-[var(--bjork-bg)] text-white shadow-[var(--bjork-shadow-soft)] data-[state=checked]:border-[#ec5c13] data-[state=checked]:bg-[#ec5c13] focus-visible:ring-[#ec5c13]/35",
        className,
      )}
      {...props}
    />
  );
}
