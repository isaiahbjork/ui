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
import { bjorkMenuItem } from "./_shared";

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
      <PopoverContent className="w-[220px] rounded-[18px] !border-[color:var(--bjork-border-muted)] bg-[var(--bjork-surface)] p-1.5 shadow-[var(--bjork-shadow-surface)]">
        <Command
          className={cn(
            "rounded-[15px] bg-transparent text-[color:var(--bjork-text)]",
            "[&_[data-slot=command-input-wrapper]]:h-[45px] [&_[data-slot=command-input-wrapper]]:rounded-[13px]",
            "[&_[data-slot=command-input-wrapper]]:border-0 [&_[data-slot=command-input-wrapper]]:bg-[var(--bjork-field)]",
            "[&_[data-slot=command-input-wrapper]]:px-3 [&_[data-slot=command-input-wrapper]]:shadow-[var(--bjork-shadow-surface)]",
            "[&_[data-slot=command-input-wrapper]_svg]:text-[color:var(--bjork-text-soft)] [&_[data-slot=command-input-wrapper]_svg]:opacity-100",
            "[&_[data-slot=command-input]]:h-[43px] [&_[data-slot=command-input]]:text-[color:var(--bjork-text)] [&_[data-slot=command-input]]:placeholder:text-[color:var(--bjork-text-soft)]",
          )}
        >
          <CommandInput
            placeholder="Search metric..."
            className="text-[color:var(--bjork-text)] placeholder:text-[color:var(--bjork-text-soft)]"
          />
          <CommandList className="pt-1">
            <CommandEmpty className="py-6 text-center text-sm text-[color:var(--bjork-text-soft)]">
              No metric found.
            </CommandEmpty>
            <CommandGroup className="p-0">
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
