"use client";

import * as React from "react";
import { CreditCard } from "lucide-react";
import { BjorkInput } from "./input";

export function BjorkInputMask() {
  const [value, setValue] = React.useState("");

  return (
    <div className="px-1">
      <BjorkInput
        value={value}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "").slice(0, 16);
          setValue(digits.replace(/(.{4})/g, "$1 ").trim());
        }}
        icon={<CreditCard />}
        inputMode="numeric"
        placeholder="4242 4242 4242 4242"
        className="w-[280px]"
      />
    </div>
  );
}
