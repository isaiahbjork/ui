"use client";

import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { BjorkBadge } from "./badge";
import { bjorkCardVariants } from "./card";

const defaultRows = [
  { account: "Northwind", status: "Active", value: "$12,480" },
  { account: "Acme", status: "Queued", value: "$8,140" },
  { account: "Linear", status: "Review", value: "$6,920" },
];

export function BjorkTable({
  rows = defaultRows,
}: {
  rows?: typeof defaultRows;
}) {
  return (
    <div
      data-slot="bjork-table"
      className={cn(
        "w-[min(620px,100%)] overflow-hidden",
        bjorkCardVariants({ variant: "surface", padding: "none" }),
      )}
    >
      <Table>
        <TableHeader className="bg-[var(--bjork-field-muted)] shadow-[var(--bjork-shadow-soft)] dark:bg-[var(--bjork-field-inset)] dark:shadow-[var(--bjork-shadow-inset)]">
          <TableRow className="border-[color:var(--bjork-border-muted)] hover:bg-transparent">
            <TableHead className="h-10 px-4 text-xs font-medium uppercase tracking-[0.08em] text-[color:var(--bjork-text-soft)]">
              Account
            </TableHead>
            <TableHead className="h-10 px-4 text-xs font-medium uppercase tracking-[0.08em] text-[color:var(--bjork-text-soft)]">
              Status
            </TableHead>
            <TableHead className="h-10 px-4 text-right text-xs font-medium uppercase tracking-[0.08em] text-[color:var(--bjork-text-soft)]">
              Value
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.account}
              className="border-[color:var(--bjork-border-muted)] transition-colors hover:bg-[var(--bjork-surface-hover)]"
            >
              <TableCell className="px-4 py-3 text-[color:var(--bjork-text-medium)]">{row.account}</TableCell>
              <TableCell className="px-4 py-3">
                <BjorkBadge variant={row.status === "Active" ? "accent" : "muted"}>
                  {row.status}
                </BjorkBadge>
              </TableCell>
              <TableCell className="px-4 py-3 text-right font-mono text-[color:var(--bjork-text-muted)]">
                {row.value}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
