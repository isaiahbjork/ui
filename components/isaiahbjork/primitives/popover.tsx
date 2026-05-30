"use client";

import * as React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { bjorkMenu } from "./_shared";

export {
  Popover as BjorkPopover,
  PopoverTrigger as BjorkPopoverTrigger,
};

export function BjorkPopoverContent({
  className,
  ...props
}: React.ComponentProps<typeof PopoverContent>) {
  return <PopoverContent className={cn(bjorkMenu, "p-4", className)} {...props} />;
}
