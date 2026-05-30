"use client";

import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { bjorkMenu, bjorkMenuItem } from "./_shared";

export {
  DropdownMenu as BjorkDropdownMenu,
  DropdownMenuTrigger as BjorkDropdownMenuTrigger,
};

export function BjorkDropdownMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
  return <DropdownMenuContent className={cn(bjorkMenu, className)} {...props} />;
}

export function BjorkDropdownMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuItem>) {
  return <DropdownMenuItem className={cn(bjorkMenuItem, className)} {...props} />;
}

export function BjorkDropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuLabel>) {
  return (
    <DropdownMenuLabel
      className={cn("px-3 py-2 text-xs uppercase tracking-[0.08em] text-[color:var(--bjork-text-soft)]", className)}
      {...props}
    />
  );
}

export function BjorkDropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuSeparator>) {
  return <DropdownMenuSeparator className={cn("bg-[var(--bjork-border)]", className)} {...props} />;
}
