"use client";

import * as React from "react";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

export function BjorkBreadcrumb({
  className,
  ...props
}: React.ComponentProps<typeof Breadcrumb>) {
  return <Breadcrumb className={cn("text-[color:var(--bjork-text-soft)]", className)} {...props} />;
}

export {
  BreadcrumbEllipsis as BjorkBreadcrumbEllipsis,
  BreadcrumbItem as BjorkBreadcrumbItem,
  BreadcrumbLink as BjorkBreadcrumbLink,
  BreadcrumbList as BjorkBreadcrumbList,
  BreadcrumbPage as BjorkBreadcrumbPage,
  BreadcrumbSeparator as BjorkBreadcrumbSeparator,
};
