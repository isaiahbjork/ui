"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { bjorkMenu, bjorkMenuItem } from "./_shared";

export function BjorkSelect() {
  return (
    <Select defaultValue="weekly">
      <SelectTrigger
        className={cn(
          "h-[45px] w-[210px] rounded-[13px] border-transparent bg-[var(--bjork-field)] px-3 text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-surface)] hover:bg-[var(--bjork-surface-hover)] focus-visible:ring-[#ec5c13]/35",
        )}
      >
        <SelectValue placeholder="Cadence" />
      </SelectTrigger>
      <SelectContent className={bjorkMenu}>
        <SelectItem className={bjorkMenuItem} value="daily">
          Daily
        </SelectItem>
        <SelectItem className={bjorkMenuItem} value="weekly">
          Weekly
        </SelectItem>
        <SelectItem className={bjorkMenuItem} value="monthly">
          Monthly
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
