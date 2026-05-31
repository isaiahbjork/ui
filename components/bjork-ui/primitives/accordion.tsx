"use client";

import * as React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { bjorkCardVariants } from "./card";

export function BjorkAccordion({
  className,
  ...props
}: React.ComponentProps<typeof Accordion>) {
  return (
    <Accordion
      className={cn(
        bjorkCardVariants({ variant: "surface", padding: "none" }),
        "bjork-accordion w-[min(440px,100%)] divide-y divide-[color:var(--bjork-border-muted)]",
        className,
      )}
      {...props}
    />
  );
}

export function BjorkAccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionItem>) {
  return (
    <AccordionItem
      className={cn(
        "border-0 px-4",
        className,
      )}
      {...props}
    />
  );
}

export function BjorkAccordionTrigger({
  className,
  ...props
}: React.ComponentProps<typeof AccordionTrigger>) {
  return (
    <AccordionTrigger
      className={cn(
        "py-4 text-left text-sm font-medium tracking-[-0.01em] text-[color:var(--bjork-text-strong)] transition-colors duration-200 hover:text-[color:var(--bjork-text)] hover:no-underline focus-visible:ring-[#ec5c13]/45 [&>svg]:text-[color:var(--bjork-text-soft)] [&>svg]:transition-[transform,color] [&>svg]:duration-200 [&[data-state=open]>svg]:text-[color:var(--bjork-text-medium)]",
        className,
      )}
      {...props}
    />
  );
}

export function BjorkAccordionContent({
  className,
  ...props
}: React.ComponentProps<typeof AccordionContent>) {
  return (
    <AccordionContent
      className={cn(
        "pb-5 text-sm leading-6 text-[color:var(--bjork-text-muted)] will-change-[opacity,filter,transform]",
        className,
      )}
      {...props}
    />
  );
}
