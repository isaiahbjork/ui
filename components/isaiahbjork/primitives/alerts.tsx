"use client";

import * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { bjorkSurface } from "./_shared";

export function BjorkAlert({
  className,
  ...props
}: React.ComponentProps<typeof Alert>) {
  return (
    <Alert
      className={cn(
        "block w-[min(440px,100%)] rounded-[18px] px-4 py-4 [&>svg]:translate-y-0",
        bjorkSurface,
        className,
      )}
      {...props}
    />
  );
}

export function BjorkAlertTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertTitle>) {
  return (
    <AlertTitle
      className={cn("col-auto min-h-0 text-sm font-medium text-[color:var(--bjork-text-strong)]", className)}
      {...props}
    />
  );
}

export function BjorkAlertDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDescription>) {
  return (
    <AlertDescription
      className={cn("col-auto mt-2 block text-sm leading-6 text-[color:var(--bjork-text-muted)]", className)}
      {...props}
    />
  );
}
