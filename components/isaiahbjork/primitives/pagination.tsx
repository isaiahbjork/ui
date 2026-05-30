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
      <PaginationContent className="rounded-[16px] border border-[color:var(--bjork-border)] bg-[var(--bjork-surface-muted)] p-1">
        <PaginationItem>
          <PaginationPrevious className="h-9 rounded-[12px] px-3 text-[color:var(--bjork-text-muted)] hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)]" />
        </PaginationItem>
        {[1, 2, 3].map((page) => (
          <PaginationItem key={page}>
            <PaginationLink
              href="#"
              isActive={page === 2}
              className={cn(
                "size-9 rounded-[12px] text-[color:var(--bjork-text-muted)] hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)]",
                page === 2 && "border-[#ec5c13]/45 bg-[#ec5c13]/16 text-[#ec5c13]",
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
          <PaginationNext className="h-9 rounded-[12px] px-3 text-[color:var(--bjork-text-muted)] hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)]" />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
