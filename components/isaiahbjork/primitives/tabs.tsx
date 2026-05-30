"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { bjorkPanel } from "./_shared";

const triggerClass =
  "h-8 rounded-[12px] border-transparent px-3 text-sm text-[color:var(--bjork-text-soft)] transition data-[state=active]:border-[color:var(--bjork-border)] data-[state=active]:bg-[var(--bjork-surface-active)] data-[state=active]:text-[color:var(--bjork-text)] data-[state=active]:shadow-[var(--bjork-shadow-soft)] hover:text-[color:var(--bjork-text)]";

export function BjorkTabs() {
  return (
    <Tabs defaultValue="overview" className="w-[min(420px,100%)]">
      <TabsList className="h-auto gap-1 rounded-[18px] border border-[color:var(--bjork-border)] bg-[var(--bjork-surface-muted)] p-1.5 shadow-[var(--bjork-shadow-surface)]">
        <TabsTrigger value="overview" className={triggerClass}>
          Overview
        </TabsTrigger>
        <TabsTrigger value="usage" className={triggerClass}>
          Usage
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className={cn("mt-3 p-4 text-sm text-[color:var(--bjork-text-muted)]", bjorkPanel)}>
        Track the surface, density, and interaction rules in one compact panel.
      </TabsContent>
      <TabsContent value="usage" className={cn("mt-3 p-4 text-sm text-[color:var(--bjork-text-muted)]", bjorkPanel)}>
        Use tabs when parallel panels share the same footprint.
      </TabsContent>
    </Tabs>
  );
}
