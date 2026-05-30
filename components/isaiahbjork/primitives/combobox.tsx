"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { BjorkButton } from "./button";
import { bjorkMenu, bjorkMenuItem } from "./_shared";

const comboboxOptions = ["Revenue", "Activation", "Retention", "Expansion", "Support"];

export function BjorkCombobox() {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("Revenue");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <BjorkButton
          variant="default"
          role="combobox"
          aria-expanded={open}
          className="w-[220px] justify-between"
        >
          {value}
          <ChevronsUpDown className="opacity-45" aria-hidden="true" />
        </BjorkButton>
      </PopoverTrigger>
      <PopoverContent className={cn("w-[220px] p-0", bjorkMenu)}>
        <Command className="bg-transparent text-[color:var(--bjork-text)]">
          <CommandInput
            placeholder="Search metric..."
            className="text-[color:var(--bjork-text)] placeholder:text-[color:var(--bjork-text-faint)]"
          />
          <CommandList>
            <CommandEmpty className="py-6 text-center text-sm text-[color:var(--bjork-text-soft)]">
              No metric found.
            </CommandEmpty>
            <CommandGroup>
              {comboboxOptions.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  onSelect={(currentValue) => {
                    setValue(currentValue);
                    setOpen(false);
                  }}
                  className={bjorkMenuItem}
                >
                  <Check
                    className={cn(
                      "mr-1 size-4 text-[color:var(--bjork-accent)]",
                      value === option ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden="true"
                  />
                  {option}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
