"use client";

import * as React from "react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export function BjorkInputOTP() {
  const [value, setValue] = React.useState("284915");

  return (
    <InputOTP maxLength={6} value={value} onChange={setValue}>
      <InputOTPGroup className="gap-2 px-1 py-1">
        {Array.from({ length: 6 }).map((_, index) => (
          <InputOTPSlot
            key={index}
            index={index}
            className="h-11 w-10 rounded-[13px] border border-[color:var(--bjork-border-strong)] bg-[var(--bjork-bg)] text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-soft)] first:rounded-[13px] first:border last:rounded-[13px] data-[active=true]:border-[#ec5c13] data-[active=true]:ring-[#ec5c13]/25"
          />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}
