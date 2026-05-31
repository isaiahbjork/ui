"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { BjorkButton } from "./button";
import { BjorkCalendar } from "./calendar";
import { bjorkMenu } from "./_shared";

export function BjorkDatePicker() {
  const [date, setDate] = React.useState<Date | undefined>(new Date(2026, 4, 15));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <BjorkButton className="w-[230px] justify-start">
          <CalendarIcon aria-hidden="true" />
          {date ? format(date, "MMM d, yyyy") : "Pick a date"}
        </BjorkButton>
      </PopoverTrigger>
      <PopoverContent
        className={cn(bjorkMenu, "w-auto border-0 bg-transparent p-0 shadow-none")}
        align="center"
      >
        <BjorkCalendar mode="single" selected={date} onSelect={setDate} initialFocus />
      </PopoverContent>
    </Popover>
  );
}
