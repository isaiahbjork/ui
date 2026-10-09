"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Lock, Search } from "lucide-react";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import {
  FOCUS_RING,
  PRESS,
  formatTokens,
  useAiTone,
  useControllable,
  useReduceMotion,
  type BjorkTone,
} from "@/components/bjork-ui/ai/_shared";
import { StrokeMorphIcon } from "@/components/bjork-ui/utilities/stroke-morph-icon";
import { cn } from "@/lib/utils";

export type ModelCapability = "vision" | "tools" | "reasoning" | "long-context";
export type ModelSpeed = "fast" | "balanced" | "deliberate";

export interface AiModel {
  id: string;
  name: string;
  /** Groups the list. Its initials become the monogram tile. */
  provider: string;
  description?: string;
  capabilities?: ModelCapability[];
  /** Context window in tokens. Shown as "200k". */
  contextWindow?: number;
  /** US dollars per million tokens. */
  price?: { input: number; output: number };
  speed?: ModelSpeed;
  disabled?: boolean;
  /** Why a disabled model is unavailable, such as "Requires Pro". */
  disabledReason?: string;
}

export interface ModelSelectorProps {
  /** Defaults to SAMPLE_MODELS. */
  models?: AiModel[];
  /** Controlled selected model id. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (id: string, model: AiModel) => void;
  /** Controlled open state of the menu. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Preferred side for the menu. It flips when the other side has more room. Default "bottom". */
  side?: "top" | "bottom";
  /** Edge of the trigger the menu lines up with before it is kept inside the viewport. Default "start". */
  align?: "start" | "end";
  /** Accessible name of the trigger and list. Default "Model". */
  label?: string;
  disabled?: boolean;
  tone?: BjorkTone;
  className?: string;
}

export const SAMPLE_MODELS: AiModel[] = [
  {
    id: "halcyon-3-pro",
    name: "Halcyon 3 Pro",
    provider: "Lumen Labs",
    description: "Careful, thorough work across long documents and code.",
    capabilities: ["vision", "tools", "reasoning", "long-context"],
    contextWindow: 200_000,
    price: { input: 3, output: 15 },
    speed: "balanced",
  },
  {
    id: "halcyon-3-flash",
    name: "Halcyon 3 Flash",
    provider: "Lumen Labs",
    description: "Quick answers and high-volume drafting.",
    capabilities: ["vision", "tools"],
    contextWindow: 200_000,
    price: { input: 0.25, output: 1.25 },
    speed: "fast",
  },
  {
    id: "halcyon-3-ultra",
    name: "Halcyon 3 Ultra",
    provider: "Lumen Labs",
    description: "The largest Halcyon, for research-grade problems.",
    capabilities: ["vision", "tools", "reasoning", "long-context"],
    contextWindow: 500_000,
    price: { input: 15, output: 75 },
    speed: "deliberate",
    disabled: true,
    disabledReason: "Requires Pro",
  },
  {
    id: "kestrel-mini",
    name: "Kestrel Mini",
    provider: "Aviary",
    description: "Small and cheap. Good for routing and extraction.",
    capabilities: ["tools"],
    contextWindow: 128_000,
    price: { input: 0.15, output: 0.6 },
    speed: "fast",
  },
  {
    id: "kestrel-large",
    name: "Kestrel Large",
    provider: "Aviary",
    description: "Balanced general model with strong image reading.",
    capabilities: ["vision", "tools"],
    contextWindow: 128_000,
    price: { input: 2.5, output: 10 },
    speed: "balanced",
  },
  {
    id: "corvid-reasoner",
    name: "Corvid Reasoner",
    provider: "Corvid Research",
    description: "Thinks before it answers. Best for math and planning.",
    capabilities: ["reasoning", "tools", "long-context"],
    contextWindow: 256_000,
    price: { input: 4, output: 16 },
    speed: "deliberate",
  },
  {
    id: "corvid-reasoner-max",
    name: "Corvid Reasoner Max",
    provider: "Corvid Research",
    description: "Extended thinking budget for the hardest problems.",
    capabilities: ["reasoning", "tools", "long-context"],
    contextWindow: 256_000,
    price: { input: 12, output: 48 },
    speed: "deliberate",
    disabled: true,
    disabledReason: "Waitlist only",
  },
];

const CAPABILITY_LABEL: Record<ModelCapability, string> = {
  vision: "Vision",
  tools: "Tools",
  reasoning: "Reasoning",
  "long-context": "Long ctx",
};
const SPEED_LEVEL: Record<ModelSpeed, number> = { fast: 3, balanced: 2, deliberate: 1 };
// Room kept between the menu and the viewport edge.
const EDGE = 12;
const GAP = 6;

function monogram(provider: string): string {
  const words = provider.split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function money(n: number): string {
  return n < 1 || n % 1 !== 0 ? `$${n.toFixed(2)}` : `$${n}`;
}

function matches(model: AiModel, q: string): boolean {
  if (!q) return true;
  const hay = [model.name, model.provider, model.description ?? "", ...(model.capabilities ?? []).map((c) => CAPABILITY_LABEL[c])]
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word));
}

/**
 * A model picker: a compact trigger that opens a searchable list of models grouped by provider. The list is a
 * combobox, so focus stays in the search field while the arrow keys move the highlighted option.
 */
export function ModelSelector({
  models = SAMPLE_MODELS,
  value,
  defaultValue,
  onValueChange,
  open,
  defaultOpen = false,
  onOpenChange,
  side = "bottom",
  align = "start",
  label = "Model",
  disabled = false,
  tone: toneProp,
  className,
}: ModelSelectorProps) {
  const { style } = useAiTone(toneProp);
  const reduce = useReduceMotion();
  const firstEnabled = models.find((m) => !m.disabled)?.id ?? "";
  const [selectedId, setSelectedId] = useControllable<string>(value, defaultValue ?? firstEnabled, (id) => {
    const model = models.find((m) => m.id === id);
    if (model) onValueChange?.(id, model);
  });
  const [isOpen, setOpen] = useControllable(open, defaultOpen, onOpenChange);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(selectedId);
  const [announce, setAnnounce] = useState("");

  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusOnOpen = useRef(false);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (id: string) => `${baseId}-opt-${id}`;

  const selected = models.find((m) => m.id === selectedId);
  const filtered = useMemo(() => models.filter((m) => matches(m, query.trim())), [models, query]);
  const groups = useMemo(
    () =>
      filtered.reduce<{ provider: string; models: AiModel[] }[]>((acc, m) => {
        const g = acc.find((x) => x.provider === m.provider);
        if (g) g.models.push(m);
        else acc.push({ provider: m.provider, models: [m] });
        return acc;
      }, []),
    [filtered],
  );
  // Visual order (grouped) drives the arrow keys.
  const ordered = useMemo(() => groups.flatMap((g) => g.models), [groups]);
  const active = ordered.find((m) => m.id === activeId) ?? ordered[0];

  const openMenu = () => {
    if (disabled) return;
    focusOnOpen.current = true;
    setQuery("");
    setActiveId(selectedId);
    setOpen(true);
  };

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const choose = (model: AiModel | undefined) => {
    if (!model || model.disabled) return;
    setSelectedId(model.id);
    setAnnounce(`${model.name} selected`);
    close(true);
  };

  // Placement: flip above or below by available room, then slide sideways so the menu stays in the viewport.
  // Written straight to the DOM, so measuring never costs a render.
  useLayoutEffect(() => {
    if (!isOpen) return;
    const place = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      const list = listRef.current;
      if (!trigger || !panel || !list) return;
      const r = trigger.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const below = vh - r.bottom - GAP - EDGE;
      const above = r.top - GAP - EDGE;
      const chrome = panel.offsetHeight - list.offsetHeight;
      const want = Math.min(list.scrollHeight, 340);
      const fitsPreferred = (side === "bottom" ? below : above) >= want + chrome;
      const placeBelow = side === "bottom" ? fitsPreferred || below >= above : !(fitsPreferred || above >= below);
      const room = Math.max(120, (placeBelow ? below : above) - chrome);
      list.style.maxHeight = `${Math.min(340, room)}px`;
      panel.dataset.side = placeBelow ? "bottom" : "top";
      panel.style.top = placeBelow ? `calc(100% + ${GAP}px)` : "auto";
      panel.style.bottom = placeBelow ? "auto" : `calc(100% + ${GAP}px)`;
      const width = panel.offsetWidth;
      const wantLeft = align === "start" ? r.left : r.right - width;
      const left = Math.min(Math.max(EDGE, wantLeft), Math.max(EDGE, vw - EDGE - width));
      panel.style.left = `${left - r.left}px`;
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [isOpen, side, align, groups]);

  // Focus moves into the search field only when the user opened the menu, never on mount.
  useEffect(() => {
    if (!isOpen || !focusOnOpen.current) return;
    focusOnOpen.current = false;
    inputRef.current?.focus();
  }, [isOpen]);

  // Keep the highlighted option in view inside the list without scrolling the page.
  const activeDomId = active ? optionId(active.id) : null;
  useEffect(() => {
    const list = listRef.current;
    if (!isOpen || !list || !activeDomId) return;
    const el = document.getElementById(activeDomId);
    if (!el) return;
    const header = 28;
    const top = el.offsetTop - header;
    const bottom = el.offsetTop + el.offsetHeight + 6;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [isOpen, activeDomId]);

  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    // Escape from anywhere, for a menu opened without focus inside it (defaultOpen or controlled).
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      setOpen(false);
      if (wrapRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, setOpen]);

  const move = (delta: number) => {
    if (ordered.length === 0) return;
    const i = active ? ordered.indexOf(active) : -1;
    const next = ordered[(i + delta + ordered.length) % ordered.length];
    setActiveId(next.id);
  };

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        e.preventDefault();
        if (ordered[0]) setActiveId(ordered[0].id);
        break;
      case "End":
        e.preventDefault();
        if (ordered.length) setActiveId(ordered[ordered.length - 1].id);
        break;
      case "Enter":
        e.preventDefault();
        choose(active);
        break;
      case "Escape":
        e.preventDefault();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
    }
  };

  return (
    <div
      ref={wrapRef}
      className={cn("relative inline-flex max-w-full font-bjork-alpha text-[color:var(--bjork-text)]", className)}
      style={style}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        aria-label={`${label}: ${selected?.name ?? "none"}`}
        onClick={() => (isOpen ? close(false) : openMenu())}
        onKeyDown={(e) => {
          if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !isOpen) {
            e.preventDefault();
            openMenu();
          }
        }}
        className={cn(
          "group flex h-8 min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-[9px] pl-1.5 pr-2 text-left transition-colors duration-150 hover:bg-[color:var(--bjork-surface-active)] disabled:cursor-not-allowed disabled:opacity-45",
          isOpen && "bg-[color:var(--bjork-surface-active)]",
          FOCUS_RING,
          PRESS,
        )}
      >
        <Monogram provider={selected?.provider ?? "?"} accent />
        <span className="min-w-0 truncate text-[13px] font-medium leading-5">{selected?.name ?? "Choose a model"}</span>
        <span
          aria-hidden="true"
          className={cn(
            "grid size-3 shrink-0 place-items-center transition-transform duration-[180ms] ease-out motion-reduce:transition-none",
            isOpen ? "rotate-180" : "rotate-0",
          )}
        >
          <StrokeMorphIcon name="chevron-down" size={12} strokeWidth={1.75} color="var(--bjork-text-muted)" />
        </span>
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          data-side={side}
          className={cn(
            "absolute left-0 top-[calc(100%+6px)] z-40 flex w-[min(380px,calc(100vw-24px))] flex-col overflow-hidden rounded-[14px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-menu)] shadow-[var(--bjork-shadow-menu)] backdrop-blur-md",
            "data-[side=bottom]:origin-top data-[side=top]:origin-bottom",
            !reduce && "motion-safe:animate-[bjork-model-pop_180ms_cubic-bezier(0.23,1,0.32,1)]",
          )}
        >
          <style href="bjork-model-selector-pop" precedence="default">
            {"@keyframes bjork-model-pop{from{opacity:0;transform:scale(0.97) translateY(-2px)}to{opacity:1;transform:none}}"}
          </style>
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[color:var(--bjork-border)] px-3">
            <Search aria-hidden="true" size={14} strokeWidth={1.75} className="shrink-0 text-[color:var(--bjork-text-faint)]" />
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={active ? optionId(active.id) : undefined}
              aria-label={`Search ${label.toLowerCase()}s`}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveId(null);
              }}
              onKeyDown={onInputKey}
              placeholder="Search models"
              spellCheck={false}
              autoComplete="off"
              className="h-full min-w-0 flex-1 bg-transparent text-[13px] leading-5 text-[color:var(--bjork-text)] outline-none placeholder:text-[color:var(--bjork-text-soft)]"
            />
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-[color:var(--bjork-text-faint)]">
              {filtered.length}/{models.length}
            </span>
          </div>

          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            className="relative max-h-[340px] overflow-y-auto overscroll-contain p-1.5 [scrollbar-width:thin]"
          >
            {groups.length === 0 && (
              <div className="px-3 py-6 text-center text-[13px] text-[color:var(--bjork-text-muted)]">
                No models match “{query.trim()}”
              </div>
            )}
            {groups.map((group) => {
              const headId = `${baseId}-g-${monogram(group.provider)}-${group.provider.length}`;
              return (
                <div key={group.provider} role="group" aria-labelledby={headId} className="pb-1 last:pb-0">
                  <div
                    id={headId}
                    className="sticky top-0 z-10 -mx-1.5 flex h-7 items-center gap-2 bg-[color:var(--bjork-menu)] px-3 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--bjork-text-faint)]"
                  >
                    {group.provider}
                  </div>
                  {group.models.map((model) => (
                    <ModelOption
                      key={model.id}
                      id={optionId(model.id)}
                      model={model}
                      active={active?.id === model.id}
                      selected={selectedId === model.id}
                      onHover={() => setActiveId(model.id)}
                      onChoose={() => choose(model)}
                    />
                  ))}
                </div>
              );
            })}
          </div>

          <div
            aria-hidden="true"
            className="hidden h-8 shrink-0 items-center gap-3 border-t border-[color:var(--bjork-border)] px-3 font-mono text-[10px] text-[color:var(--bjork-text-faint)] min-[420px]:flex"
          >
            <span>↑↓ move</span>
            <span>↵ select</span>
            <span>esc close</span>
            <span className="ml-auto">per 1M tokens · in / out</span>
          </div>
        </div>
      )}
      <LiveRegion message={announce} />
    </div>
  );
}

function Monogram({ provider, accent = false, small = false }: { provider: string; accent?: boolean; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-[6px] border font-mono font-medium leading-none tracking-[-0.02em]",
        small ? "size-[18px] text-[8.5px]" : "size-5 text-[9px]",
        accent
          ? "border-[color:var(--bjork-accent-muted)] bg-[color:var(--bjork-accent-soft)] text-[color:var(--bjork-accent-ink)]"
          : "border-[color:var(--bjork-border)] bg-[color:var(--bjork-surface-active)] text-[color:var(--bjork-text-medium)]",
      )}
    >
      {monogram(provider)}
    </span>
  );
}

function SpeedBars({ speed }: { speed: ModelSpeed }) {
  const level = SPEED_LEVEL[speed];
  return (
    <span className="inline-flex items-center gap-1.5" title={`Speed: ${speed}`}>
      <span aria-hidden="true" className="inline-flex h-2.5 items-end gap-[2px]">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className="w-[3px] rounded-[1px]"
            style={{
              height: `${4 + n * 2}px`,
              background: n <= level ? "var(--bjork-text-muted)" : "var(--bjork-hair)",
            }}
          />
        ))}
      </span>
      <span className="text-[color:var(--bjork-text-faint)]">{speed}</span>
    </span>
  );
}

interface ModelOptionProps {
  id: string;
  model: AiModel;
  active: boolean;
  selected: boolean;
  onHover: () => void;
  onChoose: () => void;
}

function ModelOption({ id, model, active, selected, onHover, onChoose }: ModelOptionProps) {
  const caps = model.capabilities ?? [];
  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      aria-disabled={model.disabled || undefined}
      data-active={active || undefined}
      onPointerMove={onHover}
      // Keep focus in the search field when an option is clicked.
      onPointerDown={(e) => e.preventDefault()}
      onClick={onChoose}
      className={cn(
        "relative grid scroll-my-8 grid-cols-[16px_minmax(0,1fr)_auto] gap-x-2.5 rounded-[9px] px-2.5 py-2 transition-colors duration-100",
        model.disabled ? "cursor-not-allowed" : "cursor-pointer",
        active && "bg-[color:var(--bjork-surface-active)]",
      )}
    >
      <span aria-hidden="true" className="grid h-5 place-items-center">
        {selected && <StrokeMorphIcon name="check" size={14} strokeWidth={2} color="var(--bjork-accent-ink)" />}
      </span>

      <span className={cn("min-w-0", model.disabled && "opacity-55")}>
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-[14px] font-medium leading-5">{model.name}</span>
          {model.disabled && model.disabledReason && (
            <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--bjork-text-muted)]">
              <Lock aria-hidden="true" size={10} strokeWidth={2} className="translate-y-[0.5px]" />
              {model.disabledReason}
            </span>
          )}
        </span>
        {model.description && (
          <span className="block truncate text-[12px] leading-[18px] text-[color:var(--bjork-text-soft)]">
            {model.description}
          </span>
        )}
        {caps.length > 0 && (
          <span className="mt-1.5 flex flex-wrap gap-1" aria-label={`Capabilities: ${caps.map((c) => CAPABILITY_LABEL[c]).join(", ")}`}>
            {caps.map((c) => (
              <span
                key={c}
                aria-hidden="true"
                className="rounded-[4px] border border-[color:var(--bjork-border)] px-1 font-mono text-[9.5px] uppercase leading-[15px] tracking-[0.06em] text-[color:var(--bjork-text-muted)]"
              >
                {CAPABILITY_LABEL[c]}
              </span>
            ))}
          </span>
        )}
      </span>

      <span
        className={cn(
          "flex flex-col items-end gap-1 pt-0.5 font-mono text-[10.5px] leading-4 tabular-nums",
          model.disabled && "opacity-55",
        )}
      >
        {model.contextWindow !== undefined && (
          <span className="text-[color:var(--bjork-text-medium)]">
            {formatTokens(model.contextWindow)}
            <span className="sr-only"> token context</span>
          </span>
        )}
        {model.speed && <SpeedBars speed={model.speed} />}
        {model.price && (
          <span className="text-[color:var(--bjork-text-faint)]">
            <span aria-hidden="true">
              {money(model.price.input)}/{money(model.price.output)}
            </span>
            <span className="sr-only">
              {money(model.price.input)} input and {money(model.price.output)} output per million tokens
            </span>
          </span>
        )}
      </span>
    </div>
  );
}
