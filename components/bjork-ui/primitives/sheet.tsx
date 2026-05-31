"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export {
  Sheet as BjorkSheet,
  SheetDescription as BjorkSheetDescription,
  SheetFooter as BjorkSheetFooter,
  SheetHeader as BjorkSheetHeader,
  SheetTitle as BjorkSheetTitle,
  SheetTrigger as BjorkSheetTrigger,
};

export function BjorkSheetContent({
  className,
  ...props
}: React.ComponentProps<typeof SheetContent>) {
  return (
    <SheetContent
      className={cn(
        "inset-y-2 right-2 h-[calc(100dvh-16px)] w-[min(380px,calc(100vw-16px))] rounded-[24px] border border-[color:var(--bjork-border-muted)] bg-[var(--bjork-field)] text-[color:var(--bjork-text)] !shadow-[var(--bjork-shadow-surface)] sm:max-w-[380px]",
        className,
      )}
      {...props}
    />
  );
}
