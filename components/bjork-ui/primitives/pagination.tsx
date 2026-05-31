"use client";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

export function BjorkPagination() {
  return (
    <Pagination>
      <PaginationContent className="rounded-[18px] border border-[color:var(--bjork-border-muted)] bg-[var(--bjork-surface)] p-1.5 shadow-[var(--bjork-shadow-surface)]">
        <PaginationItem>
          <PaginationPrevious className="h-9 rounded-[12px] !border-transparent px-3 text-[color:var(--bjork-text-muted)] shadow-none hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)] hover:shadow-[var(--bjork-shadow-soft)]" />
        </PaginationItem>
        {[1, 2, 3].map((page) => (
          <PaginationItem key={page}>
            <PaginationLink
              href="#"
              isActive={page === 2}
              className={cn(
                "size-9 rounded-[12px] !border-transparent text-[color:var(--bjork-text-muted)] shadow-none hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)] hover:shadow-[var(--bjork-shadow-soft)]",
                page === 2 &&
                  "!bg-[var(--bjork-field)] !text-[color:var(--bjork-text)] !shadow-[var(--bjork-shadow-surface)]",
              )}
            >
              {page}
            </PaginationLink>
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationEllipsis className="text-[color:var(--bjork-text-faint)]" />
        </PaginationItem>
        <PaginationItem>
          <PaginationNext className="h-9 rounded-[12px] !border-transparent px-3 text-[color:var(--bjork-text-muted)] shadow-none hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)] hover:shadow-[var(--bjork-shadow-soft)]" />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
