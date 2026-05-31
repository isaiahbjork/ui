"use client";

import { User } from "lucide-react";
import { BjorkButton } from "./button";
import { BjorkCard } from "./card";
import { BjorkInput } from "./input";

export function BjorkFormPreview() {
  return (
    <BjorkCard className="w-[min(360px,100%)]" padding="md">
      <form className="space-y-4">
      <div>
        <label className="mb-3 block text-sm font-medium text-[color:var(--bjork-text-strong)]" htmlFor="bjork-email">
          Email
        </label>
        <BjorkInput id="bjork-email" icon={<User />} placeholder="zay@glass.dev" />
        <p className="mt-2.5 text-xs leading-5 text-[color:var(--bjork-text-soft)]">
          Labels, helper text, and controls stay aligned on one compact form grid.
        </p>
      </div>
      <BjorkButton variant="accent" className="w-full">
        Save profile
      </BjorkButton>
      </form>
    </BjorkCard>
  );
}
