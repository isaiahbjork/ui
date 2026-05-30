"use client";

import * as React from "react";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export function BjorkCalendar({
  className,
  classNames,
  ...props
}: React.ComponentProps<typeof Calendar>) {
  return (
    <Calendar
      className={cn(
        "rounded-[18px] border border-[color:var(--bjork-border)] bg-[var(--bjork-bg)] p-3 text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-soft)]",
        className,
      )}
      classNames={{
        caption_label: "text-sm font-medium text-[color:var(--bjork-text-strong)]",
        head_cell: "w-8 rounded-md text-[0.72rem] font-normal text-[color:var(--bjork-text-soft)]",
        cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:rounded-[10px]",
        day: "size-8 rounded-[10px] p-0 text-sm font-normal text-[color:var(--bjork-text-medium)] hover:bg-[var(--bjork-accent-soft)] hover:text-[color:var(--bjork-text)] focus:bg-[var(--bjork-accent-soft)]",
        day_selected:
          "bg-[var(--bjork-accent)] text-[color:var(--bjork-accent-foreground)] hover:bg-[var(--bjork-accent-hover)] hover:text-[color:var(--bjork-accent-foreground)] focus:bg-[var(--bjork-accent-hover)] focus:text-[color:var(--bjork-accent-foreground)]",
        day_today: "bg-[var(--bjork-surface-active)] text-[color:var(--bjork-text)]",
        day_outside: "text-[color:var(--bjork-text-faint)] opacity-40",
        day_disabled: "text-[color:var(--bjork-text-faint)] opacity-70",
        nav_button:
          "inline-flex size-8 items-center justify-center rounded-full border-0 bg-transparent p-0 text-[color:var(--bjork-text-muted)] opacity-100 shadow-none hover:bg-transparent hover:text-[color:var(--bjork-text)] focus:bg-transparent",
        nav_button_previous: "absolute left-0",
        nav_button_next: "absolute right-0",
        ...classNames,
      }}
      {...props}
    />
  );
}
