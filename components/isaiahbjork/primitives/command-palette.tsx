"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import {
  ArrowRight,
  BookOpen,
  CircleDashed,
  Command as CommandIcon,
  CornerDownLeft,
  ExternalLink,
  Search,
  Settings2,
  Sparkles,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  commandPaletteItems,
  type CommandPaletteItem,
  type CommandPaletteItemKind,
} from "@/lib/command-palette-data";
import { cn } from "@/lib/utils";
import { BjorkButton } from "./button";

export interface BjorkCommandPaletteAction {
  id: string;
  title: string;
  value?: string;
  shortcut?: string;
  hint?: string;
  onSelect: () => void;
}

export interface BjorkCommandPaletteProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  items?: CommandPaletteItem[];
  actions?: BjorkCommandPaletteAction[];
  placeholder?: string;
  showTrigger?: boolean;
  triggerLabel?: string;
  className?: string;
}

const groupOrder = ["Pages", "Primitives", "Components", "Actions"];

function getItemIcon(kind: CommandPaletteItemKind) {
  if (kind === "primitive") return BookOpen;
  if (kind === "component") return CircleDashed;
  if (kind === "action") return Settings2;
  return ArrowRight;
}

function getKeyboardLabel(shortcut?: string) {
  if (!shortcut) return null;

  return shortcut
    .replace("meta", "⌘")
    .replace("cmd", "⌘")
    .replace("mod", "⌘")
    .replace("+", " + ")
    .toUpperCase();
}

export function BjorkCommandPalette({
  open: controlledOpen,
  onOpenChange,
  items = commandPaletteItems,
  actions,
  placeholder = "Search anything",
  showTrigger = true,
  triggerLabel = "Search",
  className,
}: BjorkCommandPaletteProps) {
  const { setTheme } = useTheme();
  const shouldReduceMotion = useReducedMotion();
  const [internalOpen, setInternalOpen] = React.useState(false);
  const [selectedItem, setSelectedItem] = React.useState<CommandPaletteItem | null>(
    items[0] ?? null
  );

  const open = controlledOpen ?? internalOpen;
  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      setInternalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [onOpenChange]
  );

  const commandActions = React.useMemo<CommandPaletteItem[]>(() => {
    const baseActions: BjorkCommandPaletteAction[] = actions ?? [
      {
        id: "theme-dark",
        title: "Use dark theme",
        hint: "Appearance",
        onSelect: () => setTheme("dark"),
      },
      {
        id: "theme-light",
        title: "Use light theme",
        hint: "Appearance",
        onSelect: () => setTheme("light"),
      },
      {
        id: "reload",
        title: "Reload",
        shortcut: "cmd+r",
        hint: "Refresh",
        onSelect: () => window.location.reload(),
      },
    ];

    return baseActions.map((action) => ({
      id: `action-${action.id}`,
      title: action.title,
      group: "Actions",
      value: action.value ?? `${action.title} ${action.shortcut ?? ""} ${action.hint ?? ""}`,
      kind: "action",
      hint: action.hint,
      shortcut: action.shortcut,
      keywords: [action.hint ?? ""],
    }));
  }, [actions, setTheme]);

  const allItems = React.useMemo(
    () => [...items, ...commandActions],
    [commandActions, items]
  );

  const groupedItems = React.useMemo(() => {
    const groups = allItems.reduce<Map<string, CommandPaletteItem[]>>((acc, item) => {
      const groupItems = acc.get(item.group) ?? [];
      acc.set(item.group, [...groupItems, item]);
      return acc;
    }, new Map());

    return Array.from(groups, ([group, groupItems]) => ({ group, items: groupItems }))
      .filter((group) => group.items.length > 0)
      .sort((a, b) => {
        const aRank = groupOrder.indexOf(a.group);
        const bRank = groupOrder.indexOf(b.group);
        return (aRank === -1 ? groupOrder.length : aRank) - (bRank === -1 ? groupOrder.length : bRank);
      });
  }, [allItems]);

  const actionMap = React.useMemo(() => {
    const baseActions = actions ?? [
      { id: "theme-dark", title: "Use dark theme", onSelect: () => setTheme("dark") },
      { id: "theme-light", title: "Use light theme", onSelect: () => setTheme("light") },
      { id: "reload", title: "Reload", onSelect: () => window.location.reload() },
    ];

    return new Map(baseActions.map((action) => [`action-${action.id}`, action.onSelect]));
  }, [actions, setTheme]);

  const selectItem = React.useCallback(
    (item: CommandPaletteItem) => {
      const targetRoute = item.route ?? item.value.match(/^~\s+(\S+)/)?.[1];

      if (targetRoute) {
        setOpen(false);
        window.location.assign(targetRoute);
        return;
      }

      actionMap.get(item.id)?.();
      setOpen(false);
    },
    [actionMap, setOpen]
  );

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(!open);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  React.useEffect(() => {
    if (!open) return;

    const firstItem = allItems[0] ?? null;
    setSelectedItem(firstItem);
  }, [allItems, open]);

  const commandTransition = shouldReduceMotion
    ? { duration: 0.12, ease: "linear" as const }
    : { type: "spring" as const, stiffness: 360, damping: 34, mass: 0.78 };

  return (
    <>
      {showTrigger && (
        <BjorkButton
          type="button"
          variant="secondary"
          onClick={() => setOpen(true)}
          className={cn("h-8 gap-2 px-3 text-xs", className)}
        >
          <Search className="size-3.5" aria-hidden="true" />
          <span>{triggerLabel}</span>
          <span className="ml-2 hidden items-center gap-1 text-[color:var(--bjork-text-soft)] sm:flex">
            <CommandIcon className="size-3" aria-hidden="true" />K
          </span>
        </BjorkButton>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[18vh] max-h-[min(650px,calc(100vh-4rem))] !max-w-3xl translate-y-0 overflow-hidden border-none bg-transparent p-2 shadow-none duration-150 data-[state=open]:slide-in-from-top-4 data-[state=closed]:slide-out-to-top-4 [&_[data-slot=dialog-close]]:hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Command palette</DialogTitle>
            <DialogDescription>Search pages, primitives, components, and actions.</DialogDescription>
          </DialogHeader>
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, y: -10, scale: 0.985, filter: "blur(5px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            transition={commandTransition}
          >
            <Command
              className="rounded-3xl border border-[color:var(--bjork-border)] bg-[color:var(--bjork-menu)] p-2 text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-menu)] backdrop-blur-xl [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-[color:var(--bjork-text-soft)] [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:size-4 [&_[cmdk-input]]:h-11 [&_[cmdk-item]_svg]:size-4"
            >
              <CommandInput
                placeholder={placeholder}
                className="h-11 text-[color:var(--bjork-text)] placeholder:text-[color:var(--bjork-text-faint)]"
              />
              <CommandList className="hide-scrollbar relative mb-10 h-[400px] max-h-[52vh] scroll-py-5 overflow-y-auto overflow-x-hidden py-2 font-medium">
                <CommandEmpty className="py-12 text-center text-sm text-[color:var(--bjork-text-soft)]">
                  No result found.
                </CommandEmpty>
                {groupedItems.map((group) => (
                  <CommandGroup
                    key={group.group}
                    heading={group.group}
                    className="!px-0 py-3"
                  >
                    {group.items.map((item) => {
                      const Icon = getItemIcon(item.kind);

                      return (
                        <CommandItem
                          key={item.id}
                          value={getCommandItemValue(item)}
                          keywords={item.keywords}
                          data-command-route={item.route}
                          onMouseMove={() => setSelectedItem(item)}
                          onSelect={() => selectItem(item)}
                          className="group relative mx-1 cursor-default rounded-xl !px-4 py-2 text-sm text-[color:var(--bjork-text-medium)] data-[selected=true]:bg-[color:var(--bjork-surface-hover)] data-[selected=true]:text-[color:var(--bjork-text)]"
                        >
                          <Icon className="text-[color:var(--bjork-text-soft)]" aria-hidden="true" />
                          <span className="min-w-0 truncate">{item.title}</span>
                          {item.hint && (
                            <span className="ml-auto hidden max-w-[42%] truncate text-xs font-normal text-[color:var(--bjork-text-soft)] opacity-0 transition-opacity group-data-[selected=true]:opacity-100 sm:block">
                              {item.hint}
                            </span>
                          )}
                          {item.shortcut && (
                            <KeyboardShortcut shortcut={item.shortcut} />
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                ))}
              </CommandList>
              <div className="absolute inset-x-0 bottom-0 flex h-12 items-center justify-between rounded-b-3xl border-t border-[color:var(--bjork-border)] bg-[color:var(--bjork-surface-muted)] px-5 text-xs text-[color:var(--bjork-text-soft)] backdrop-blur-xl">
                <div className="flex items-center gap-2">
                  <span className="flex size-5 items-center justify-center rounded-[4px] border border-[color:var(--bjork-border)]">
                    <CornerDownLeft className="size-3" aria-hidden="true" />
                  </span>
                  <span>{selectedItem?.route ? "Go to page" : "Run action"}</span>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={selectedItem?.id ?? "empty"}
                      className="max-w-[40vw] truncate"
                      initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={shouldReduceMotion ? undefined : { opacity: 0, y: -4 }}
                      transition={{ duration: 0.14, ease: "easeOut" }}
                    >
                      {selectedItem?.hint ?? selectedItem?.route ?? "Ready"}
                    </motion.span>
                  </AnimatePresence>
                  {selectedItem?.route ? (
                    <ExternalLink className="size-3" aria-hidden="true" />
                  ) : (
                    <Sparkles className="size-3" aria-hidden="true" />
                  )}
                </div>
              </div>
            </Command>
          </motion.div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function getCommandItemValue(item: CommandPaletteItem) {
  return item.value;
}

function KeyboardShortcut({ shortcut }: { shortcut: string }) {
  const label = getKeyboardLabel(shortcut);

  if (!label) return null;

  return (
    <span className="ml-auto flex items-center gap-1 text-[color:var(--bjork-text-soft)]">
      {label.split(" + ").map((part, index) => (
        <React.Fragment key={`${part}-${index}`}>
          {index > 0 && <span>+</span>}
          <span className="flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-[color:var(--bjork-border)] px-1 text-[10px] leading-none">
            {part}
          </span>
        </React.Fragment>
      ))}
    </span>
  );
}

export function BjorkCommandPaletteDemo() {
  return (
    <div className="flex min-h-[360px] w-full items-center justify-center rounded-[20px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-panel)] p-6 shadow-[var(--bjork-shadow-panel)]">
      <BjorkCommandPalette />
    </div>
  );
}
