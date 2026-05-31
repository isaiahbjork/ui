"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter as DialogFooterPrimitive,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export {
  Dialog as BjorkDialog,
  DialogDescription as BjorkDialogDescription,
  DialogHeader as BjorkDialogHeader,
  DialogTitle as BjorkDialogTitle,
  DialogTrigger as BjorkDialogTrigger,
};

export function BjorkDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof DialogContent>) {
  return (
    <DialogContent
      className={cn(
        "rounded-[22px] border-[color:var(--bjork-border-muted)] bg-[var(--bjork-field)] text-[color:var(--bjork-text)] !shadow-[var(--bjork-shadow-surface)]",
        className,
      )}
      {...props}
    />
  );
}

export function BjorkDialogFooter({
  className,
  ...props
}: React.ComponentProps<typeof DialogFooterPrimitive>) {
  return (
    <DialogFooterPrimitive
      className={cn(
        "[&_[data-slot=bjork-button]]:h-9 [&_[data-slot=bjork-button]]:rounded-[12px] [&_[data-slot=bjork-button]]:px-3.5",
        className,
      )}
      {...props}
    />
  );
}
