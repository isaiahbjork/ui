"use client";

import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function BjorkTextarea({
  className,
  ...props
}: React.ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      className={cn(
        "bjork-textarea-hidden-resizer min-h-[120px] w-[min(380px,100%)] rounded-[18px] border-[color:var(--bjork-border)] bg-[var(--bjork-field)] px-4 py-3 text-sm text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-surface)] placeholder:text-[color:var(--bjork-text-faint)] focus-visible:border-[color:var(--bjork-border-strong)] focus-visible:ring-[color:var(--bjork-border-strong)]",
        className,
      )}
      {...props}
    />
  );
}
