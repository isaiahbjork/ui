"use client";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const radioOptions: Array<{ value: string; label: string }> = [
  { value: "starter", label: "Starter" },
  { value: "pro", label: "Pro" },
  { value: "studio", label: "Studio" },
];

export function BjorkRadioGroup() {
  return (
    <RadioGroup defaultValue="pro" className="grid gap-2">
      {radioOptions.map(({ value, label }) => (
        <label
          key={value}
          className="flex w-[260px] items-center gap-3 rounded-[16px] border border-[color:var(--bjork-border)] bg-[var(--bjork-field)] px-4 py-3 text-sm text-[color:var(--bjork-text-medium)] shadow-[var(--bjork-shadow-soft)]"
        >
          <RadioGroupItem
            value={value}
            className="border-[color:var(--bjork-border-strong)] text-[#ec5c13] focus-visible:ring-[#ec5c13]/35 data-[state=checked]:border-[#ec5c13]"
          />
          {label}
        </label>
      ))}
    </RadioGroup>
  );
}
