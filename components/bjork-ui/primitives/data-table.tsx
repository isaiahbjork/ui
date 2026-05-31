"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { BjorkButton } from "./button";
import { BjorkInput } from "./input";
import { BjorkTable } from "./table";

export function BjorkDataTable() {
  return (
    <div className="w-[min(620px,100%)] space-y-3">
      <div className="flex items-center justify-between gap-3">
        <BjorkInput
          icon={<Search />}
          placeholder="Filter accounts"
          className="h-10 max-w-[300px]"
        />
        <BjorkButton variant="quiet" size="sm">
          <SlidersHorizontal aria-hidden="true" />
          View
        </BjorkButton>
      </div>
      <BjorkTable />
    </div>
  );
}
