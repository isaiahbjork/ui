"use client";

import { Circle, CircleDot, Settings2, type LucideIcon } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const radioOptions: Array<{ value: string; label: string; Icon: LucideIcon }> = [
  { value: "starter", label: "Starter", Icon: Circle },
  { value: "pro", label: "Pro", Icon: CircleDot },
  { value: "studio", label: "Studio", Icon: Settings2 },
];

export function BjorkRadioGroup() {
  return (
    <RadioGroup defaultValue="pro" className="grid gap-2">
      {radioOptions.map(({ value, label, Icon }) => (
        <label
          key={value}
          className="flex w-[260px] items-center gap-3 rounded-[16px] border border-[color:var(--bjork-border)] bg-[var(--bjork-field)] px-4 py-3 text-sm text-[color:var(--bjork-text-medium)] shadow-[var(--bjork-shadow-soft)]"
        >
          <RadioGroupItem
            value={value}
            className="border-[color:var(--bjork-border-strong)] text-[#ec5c13] focus-visible:ring-[#ec5c13]/35 data-[state=checked]:border-[#ec5c13]"
          />
          <Icon className="size-4 text-[color:var(--bjork-text-soft)]" aria-hidden="true" />
          {label}
        </label>
      ))}
    </RadioGroup>
  );
}
