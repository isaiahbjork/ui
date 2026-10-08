"use client";

import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTheme } from "next-themes";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type BjorkTableThemeMode,
  getBjorkTablePalette,
  useBjorkTableIsDark,
} from "./table-theme";

export type ShortcutPlatform = "mac" | "other";

export interface ShortcutKeys {
  /** A sequence of chords. `[["Cmd", "K"], ["Z"]]` reads "⌘ + K then Z". */
  mac: string[][];
  other: string[][];
}

export interface Shortcut {
  id?: string;
  action: string;
  keys: ShortcutKeys;
  description?: string;
}

export interface ShortcutGroup {
  id: string;
  label: string;
  shortcuts: Shortcut[];
}

export interface ShortcutsTableProps {
  groups?: ShortcutGroup[];
  title?: string;
  subtitle?: string;
  /** "auto" reads the platform from the browser. The visitor can still switch. */
  platform?: ShortcutPlatform | "auto";
  onPlatformChange?: (platform: ShortcutPlatform) => void;
  searchable?: boolean;
  defaultQuery?: string;
  onQueryChange?: (query: string) => void;
  /** Max height of the scrolling body. Header and group headings stick. */
  maxHeight?: number;
  className?: string;
  theme?: BjorkTableThemeMode;
  enableAnimations?: boolean;
}

const k = (mac: string[][], other: string[][]): ShortcutKeys => ({ mac, other });

export const SHORTCUTS_TABLE_SAMPLE: ShortcutGroup[] = [
  {
    id: "general",
    label: "General",
    shortcuts: [
      { action: "Command palette", keys: k([["Cmd", "K"]], [["Ctrl", "K"]]), description: "Run any command by name" },
      { action: "Quick open", keys: k([["Cmd", "P"]], [["Ctrl", "P"]]), description: "Jump to a file in the workspace" },
      { action: "Save", keys: k([["Cmd", "S"]], [["Ctrl", "S"]]) },
      { action: "Save all", keys: k([["Option", "Cmd", "S"]], [["Ctrl", "Alt", "S"]]) },
      { action: "Settings", keys: k([["Cmd", ","]], [["Ctrl", ","]]) },
      { action: "Focus mode", keys: k([["Cmd", "K"], ["Z"]], [["Ctrl", "K"], ["Z"]]), description: "Hide every panel except the editor" },
    ],
  },
  {
    id: "navigation",
    label: "Navigation",
    shortcuts: [
      { action: "Go to line", keys: k([["Ctrl", "G"]], [["Ctrl", "G"]]) },
      { action: "Go to symbol", keys: k([["Shift", "Cmd", "O"]], [["Ctrl", "Shift", "O"]]) },
      { action: "Go to definition", keys: k([["F12"]], [["F12"]]) },
      { action: "Go back", keys: k([["Ctrl", "-"]], [["Alt", "Left"]]) },
      { action: "Next tab", keys: k([["Shift", "Cmd", "]"]], [["Ctrl", "Tab"]]) },
      { action: "Matching bracket", keys: k([["Shift", "Cmd", "\\"]], [["Ctrl", "Shift", "\\"]]) },
    ],
  },
  {
    id: "editing",
    label: "Editing",
    shortcuts: [
      { action: "Select next match", keys: k([["Cmd", "D"]], [["Ctrl", "D"]]), description: "Adds a cursor at the next occurrence" },
      { action: "Add cursor below", keys: k([["Option", "Cmd", "Down"]], [["Ctrl", "Alt", "Down"]]) },
      { action: "Move line up", keys: k([["Option", "Up"]], [["Alt", "Up"]]) },
      { action: "Duplicate line", keys: k([["Shift", "Option", "Down"]], [["Shift", "Alt", "Down"]]) },
      { action: "Delete line", keys: k([["Shift", "Cmd", "K"]], [["Ctrl", "Shift", "K"]]) },
      { action: "Toggle comment", keys: k([["Cmd", "/"]], [["Ctrl", "/"]]) },
      { action: "Rename symbol", keys: k([["F2"]], [["F2"]]), description: "Updates every reference in the project" },
      { action: "Format document", keys: k([["Shift", "Option", "F"]], [["Shift", "Alt", "F"]]) },
    ],
  },
  {
    id: "view",
    label: "View",
    shortcuts: [
      { action: "Toggle sidebar", keys: k([["Cmd", "B"]], [["Ctrl", "B"]]) },
      { action: "Toggle terminal", keys: k([["Ctrl", "`"]], [["Ctrl", "`"]]) },
      { action: "Split editor", keys: k([["Cmd", "\\"]], [["Ctrl", "\\"]]) },
      { action: "Fold all", keys: k([["Cmd", "K"], ["Cmd", "0"]], [["Ctrl", "K"], ["Ctrl", "0"]]) },
      { action: "Unfold all", keys: k([["Cmd", "K"], ["Cmd", "J"]], [["Ctrl", "K"], ["Ctrl", "J"]]) },
      { action: "Zoom in", keys: k([["Cmd", "="]], [["Ctrl", "="]]) },
      { action: "Zoom out", keys: k([["Cmd", "-"]], [["Ctrl", "-"]]) },
    ],
  },
];

// ─── keys ────────────────────────────────────────────────────────────────────

interface KeyInfo {
  glyph: string;
  spoken: string;
  tokens: string[];
}

const KEY_ALIASES: Record<string, string> = {
  command: "cmd",
  meta: "cmd",
  super: "cmd",
  win: "cmd",
  windows: "cmd",
  control: "ctrl",
  opt: "option",
  return: "enter",
  escape: "esc",
  arrowup: "up",
  arrowdown: "down",
  arrowleft: "left",
  arrowright: "right",
};

const MAC_KEYS: Record<string, [glyph: string, spoken: string]> = {
  cmd: ["⌘", "Command"],
  option: ["⌥", "Option"],
  alt: ["⌥", "Option"],
  shift: ["⇧", "Shift"],
  ctrl: ["⌃", "Control"],
  enter: ["↵", "Return"],
  backspace: ["⌫", "Delete"],
  delete: ["⌦", "Forward delete"],
  tab: ["⇥", "Tab"],
  esc: ["esc", "Escape"],
  space: ["space", "Space"],
  up: ["↑", "Up arrow"],
  down: ["↓", "Down arrow"],
  left: ["←", "Left arrow"],
  right: ["→", "Right arrow"],
};

const OTHER_KEYS: Record<string, [glyph: string, spoken: string]> = {
  cmd: ["Win", "Windows key"],
  option: ["Alt", "Alt"],
  alt: ["Alt", "Alt"],
  shift: ["Shift", "Shift"],
  ctrl: ["Ctrl", "Control"],
  enter: ["Enter", "Enter"],
  backspace: ["Backspace", "Backspace"],
  delete: ["Del", "Delete"],
  tab: ["Tab", "Tab"],
  esc: ["Esc", "Escape"],
  space: ["Space", "Space"],
  up: ["↑", "Up arrow"],
  down: ["↓", "Down arrow"],
  left: ["←", "Left arrow"],
  right: ["→", "Right arrow"],
};

const SYMBOL_NAMES: Record<string, string> = {
  ",": "Comma",
  ".": "Period",
  "/": "Slash",
  "\\": "Backslash",
  "`": "Backtick",
  "-": "Minus",
  "=": "Equals",
  "[": "Left bracket",
  "]": "Right bracket",
  ";": "Semicolon",
};

function describeKey(raw: string, platform: ShortcutPlatform): KeyInfo {
  const lower = raw.toLowerCase();
  const canonical = KEY_ALIASES[lower] ?? lower;
  const table = platform === "mac" ? MAC_KEYS : OTHER_KEYS;
  const known = table[canonical];
  const glyph = known?.[0] ?? (raw.length === 1 ? raw.toUpperCase() : raw);
  const spoken = known?.[1] ?? SYMBOL_NAMES[raw] ?? raw;
  const tokens = new Set([lower, canonical, glyph.toLowerCase(), spoken.toLowerCase()]);
  for (const [alias, target] of Object.entries(KEY_ALIASES)) if (target === canonical) tokens.add(alias);
  return { glyph, spoken, tokens: [...tokens] };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const noopSubscribe = () => () => {};

function useMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

function useIsNarrow<T extends HTMLElement>(threshold: number) {
  const ref = useRef<T>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setNarrow(width > 0 && width < threshold);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);
  return [ref, narrow] as const;
}

function detectPlatform(): ShortcutPlatform {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const name = nav.userAgentData?.platform || nav.platform || nav.userAgent;
  return /mac|iphone|ipad|ipod/i.test(name) ? "mac" : "other";
}

function useDetectedPlatform() {
  return useSyncExternalStore<ShortcutPlatform>(noopSubscribe, detectPlatform, () => "mac");
}

function keyMatches(info: KeyInfo, terms: string[]) {
  return terms.some((term) =>
    info.tokens.some((token) => (term.length === 1 ? token === term : token === term || (term.length > 2 && token.startsWith(term))))
  );
}

function Highlight({ text, query, markClassName }: { text: string; query: string; markClassName: string }) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const out: ReactNode[] = [];
  let from = 0;
  let at = lower.indexOf(query, from);
  while (at !== -1 && query.length > 0) {
    if (at > from) out.push(<Fragment key={`t${from}`}>{text.slice(from, at)}</Fragment>);
    out.push(
      <mark key={`m${at}`} className={markClassName}>
        {text.slice(at, at + query.length)}
      </mark>
    );
    from = at + query.length;
    at = lower.indexOf(query, from);
  }
  if (from < text.length) out.push(<Fragment key={`t${from}`}>{text.slice(from)}</Fragment>);
  return <>{out}</>;
}

// ─── component ───────────────────────────────────────────────────────────────

const HEADER_HEIGHT = 38;

export function ShortcutsTable({
  groups = SHORTCUTS_TABLE_SAMPLE,
  title = "Keyboard shortcuts",
  subtitle = "Tessel editor",
  platform: platformProp = "auto",
  onPlatformChange,
  searchable = true,
  defaultQuery = "",
  onQueryChange,
  maxHeight = 520,
  className,
  theme = "auto",
  enableAnimations = true,
}: ShortcutsTableProps) {
  const mounted = useMounted();
  const { resolvedTheme } = useTheme();
  const forcedTheme = theme === "auto" ? undefined : theme;
  const detectedIsDark = useBjorkTableIsDark(resolvedTheme, forcedTheme);
  const isDark = !mounted && theme === "auto" ? true : detectedIsDark;
  const palette = getBjorkTablePalette(isDark);
  const shouldReduceMotion = useReducedMotion();
  const shouldAnimate = enableAnimations && !shouldReduceMotion;
  const uid = useId();
  const [rootRef, narrow] = useIsNarrow<HTMLDivElement>(480);

  const detected = useDetectedPlatform();
  const [override, setOverride] = useState<ShortcutPlatform | null>(null);
  const platform: ShortcutPlatform = override ?? (platformProp === "auto" ? detected : platformProp);

  const [query, setQuery] = useState(defaultQuery);
  const [intro, setIntro] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);
  const platformRefs = useRef(new Map<ShortcutPlatform, HTMLButtonElement>());

  useEffect(() => {
    const t = window.setTimeout(() => setIntro(false), 900);
    return () => window.clearTimeout(t);
  }, []);

  const normalized = query.trim().toLowerCase();
  const terms = useMemo(() => normalized.split(/[\s+]+/).filter(Boolean), [normalized]);

  const { visible, matchCount, totalCount } = useMemo(() => {
    const total = groups.reduce((sum, g) => sum + g.shortcuts.length, 0);
    const out = groups
      .map((group) => {
        const rows = group.shortcuts
          .map((shortcut) => {
            const chords = shortcut.keys[platform].map((chord) => chord.map((key) => describeKey(key, platform)));
            const haystack = `${shortcut.action} ${shortcut.description ?? ""} ${group.label}`.toLowerCase();
            const textHit = normalized.length > 0 && haystack.includes(normalized);
            const keyHits = chords.map((chord) => chord.map((info) => terms.length > 0 && keyMatches(info, terms)));
            const words = haystack.split(/[^a-z0-9]+/);
            // Short terms ("k", "f2") match word starts only, so "k" doesn't hit "quick".
            const inText = (term: string) =>
              term.length > 2 ? haystack.includes(term) : words.some((word) => word.startsWith(term));
            const allTermsHit =
              terms.length > 0 &&
              terms.every((term) => inText(term) || chords.some((c) => c.some((info) => keyMatches(info, [term]))));
            const hit = normalized.length === 0 || textHit || allTermsHit;
            return { shortcut, chords, keyHits: textHit && !allTermsHit ? null : keyHits, hit };
          })
          .filter((r) => r.hit);
        return { group, rows };
      })
      .filter((g) => g.rows.length > 0);
    const matched = out.reduce((sum, g) => sum + g.rows.length, 0);
    return { visible: out, matchCount: matched, totalCount: total };
  }, [groups, platform, normalized, terms]);

  const choosePlatform = (next: ShortcutPlatform, focus = false) => {
    setOverride(next);
    onPlatformChange?.(next);
    if (focus) platformRefs.current.get(next)?.focus();
  };

  const updateQuery = (next: string) => {
    setQuery(next);
    onQueryChange?.(next);
  };

  const handleRootKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!searchable || event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
    event.preventDefault();
    searchRef.current?.focus();
    searchRef.current?.select();
  };

  const platforms: { id: ShortcutPlatform; label: string }[] = [
    { id: "mac", label: "Mac" },
    { id: "other", label: "Windows · Linux" },
  ];

  const handlePlatformKey = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    choosePlatform(platforms[(index + 1) % platforms.length].id, true);
  };

  const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[#ec5c13]/60";
  const headerLabel = "text-[11px] font-medium uppercase tracking-[0.08em]";
  const surface = isDark ? "bg-[#111]" : "bg-[#fffcf6]";
  const markClass = cn("rounded-[3px] px-[1px] text-inherit", isDark ? "bg-[#ec5c13]/28" : "bg-[#ec5c13]/20");
  const keyCap = isDark
    ? "border-[#2e2e2e] border-b-[#3a3a3a] bg-[#1a1a1a] text-[#ededed]/86"
    : "border-[#e4d9c7] border-b-[#d6c8b2] bg-[#fffcf6] text-[#171717]/80 shadow-[0_1px_0_rgba(62,52,38,0.06)]";
  const keyCapHit = isDark
    ? "border-[#ec5c13]/50 border-b-[#ec5c13]/70 bg-[#ec5c13]/14 text-[#f0a274]"
    : "border-[#bd4514]/40 border-b-[#bd4514]/60 bg-[#ec5c13]/10 text-[#9f4317]";

  let rowIndex = 0;

  return (
    <div
      ref={rootRef}
      onKeyDown={handleRootKey}
      className={cn("w-full overflow-hidden rounded-[18px] border text-[13px]", palette.container, className)}
    >
      <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-3 px-5 pb-3.5 pt-4", narrow && "px-4")}>
        <div className="mr-auto min-w-0">
          <h3 className={cn("text-[15px] font-semibold tracking-[-0.01em]", palette.primaryText)}>{title}</h3>
          {subtitle ? <p className={cn("mt-0.5 text-[12px]", palette.secondaryText)}>{subtitle}</p> : null}
        </div>
        <div
          role="radiogroup"
          aria-label="Platform"
          className={cn("grid grid-cols-2 gap-1 rounded-[10px] border p-[3px]", palette.divider, palette.mutedSurface)}
        >
          {platforms.map((p, index) => {
            const selected = p.id === platform;
            return (
              <button
                key={p.id}
                ref={(node) => {
                  if (node) platformRefs.current.set(p.id, node);
                  else platformRefs.current.delete(p.id);
                }}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => choosePlatform(p.id)}
                onKeyDown={(e) => handlePlatformKey(e, index)}
                className={cn(
                  "relative whitespace-nowrap rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition-colors motion-reduce:transition-none",
                  selected ? palette.primaryText : palette.secondaryText,
                  focusRing
                )}
              >
                {selected ? (
                  <motion.span
                    layoutId={shouldAnimate ? `${uid}-platform` : undefined}
                    transition={{ type: "spring", stiffness: 520, damping: 40 }}
                    className={cn(
                      "absolute inset-0 rounded-[7px] border",
                      isDark ? "border-[#2c2c2c] bg-[#222]" : "border-[#eadfce] bg-[#fffcf6] shadow-[var(--bjork-shadow-soft)]"
                    )}
                  />
                ) : null}
                <span className="relative">{p.label}</span>
              </button>
            );
          })}
        </div>
        {searchable ? (
          <div className="relative w-full">
            <Search
              size={14}
              aria-hidden
              className={cn("pointer-events-none absolute left-3 top-1/2 -translate-y-1/2", palette.secondaryText)}
            />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => updateQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && query) {
                  e.preventDefault();
                  updateQuery("");
                }
              }}
              placeholder="Search actions or keys, e.g. “cmd k”"
              aria-label="Search shortcuts"
              aria-controls={`${uid}-table`}
              className={cn(
                "h-9 w-full rounded-[10px] border pl-8 pr-14 text-[13px] [&::-webkit-search-cancel-button]:appearance-none",
                isDark
                  ? "border-[#232323] bg-[#161616] text-[#ededed]/90 placeholder:text-[#ededed]/30"
                  : "border-[#eadfce] bg-[#fbf7ef] text-[#171717]/86 placeholder:text-[#171717]/38",
                "outline-none focus-visible:border-[#ec5c13]/50 focus-visible:ring-2 focus-visible:ring-[#ec5c13]/30"
              )}
            />
            <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center">
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    updateQuery("");
                    searchRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  className={cn("grid size-6 place-items-center rounded-[6px]", palette.secondaryText, palette.menuItem, focusRing)}
                >
                  <X size={13} />
                </button>
              ) : (
                <kbd
                  aria-hidden
                  className={cn("grid h-[20px] min-w-[20px] place-items-center rounded-[5px] border px-1 font-sans text-[11px]", keyCap)}
                >
                  /
                </kbd>
              )}
            </span>
          </div>
        ) : null}
      </div>

      <div
        role="region"
        aria-label={`${title} list`}
        tabIndex={0}
        className={cn("overflow-auto overscroll-contain border-t", palette.divider, focusRing)}
        style={{ maxHeight }}
      >
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-6 py-12 text-center">
            <span className={cn("text-[13px] font-medium", palette.primaryText)}>
              No shortcuts match “{query.trim()}”
            </span>
            <span className={cn("text-[12.5px]", palette.secondaryText)}>Try an action like “rename”, or a key like “shift”.</span>
            <button
              type="button"
              onClick={() => {
                updateQuery("");
                searchRef.current?.focus();
              }}
              className={cn("mt-3 rounded-[8px] border px-3 py-1.5 text-[12.5px] transition-colors", palette.control, focusRing)}
            >
              Clear search
            </button>
          </div>
        ) : (
          <table id={`${uid}-table`} className="w-full table-fixed border-separate border-spacing-0 text-left">
            <caption className="sr-only">
              {title} for {platform === "mac" ? "Mac" : "Windows and Linux"}
            </caption>
            <colgroup>
              <col />
              <col style={{ width: narrow ? "48%" : "42%" }} />
            </colgroup>
            <thead>
              <tr className={palette.header}>
                <th
                  scope="col"
                  className={cn("sticky top-0 z-20 border-b pl-5 pr-3", narrow && "pl-4", palette.header, headerLabel)}
                  style={{ height: HEADER_HEIGHT }}
                >
                  Action
                </th>
                <th
                  scope="col"
                  className={cn("sticky top-0 z-20 border-b pl-3 pr-5 text-right", narrow && "pr-4", palette.header, headerLabel)}
                  style={{ height: HEADER_HEIGHT }}
                >
                  Shortcut
                </th>
              </tr>
            </thead>
            {visible.map(({ group, rows }) => (
              <tbody key={group.id}>
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={2}
                    className={cn("sticky z-10 border-b pb-2 pl-5 pr-5 pt-3.5 text-left", narrow && "px-4", surface, palette.divider)}
                    style={{ top: HEADER_HEIGHT }}
                  >
                    <span className="flex items-baseline justify-between">
                      <span className={cn(headerLabel, palette.accent)}>{group.label}</span>
                      <span className={cn("text-[11px] tabular-nums", palette.secondaryText)}>{rows.length}</span>
                    </span>
                  </th>
                </tr>
                {rows.map(({ shortcut, chords, keyHits }, i) => {
                  const index = rowIndex++;
                  const last = i === rows.length - 1;
                  const cell = cn("border-b py-2.5 align-middle", last ? palette.divider : isDark ? "border-[#1c1c1c]" : "border-[#f5eee3]");
                  return (
                    <motion.tr
                      key={shortcut.id ?? shortcut.action}
                      initial={intro && shouldAnimate ? { opacity: 0, y: 6 } : false}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1], delay: intro ? 0.04 + index * 0.016 : 0 }}
                      className={cn("transition-colors duration-150 motion-reduce:transition-none", palette.row)}
                    >
                      <td className={cn(cell, "pl-5 pr-3", narrow && "pl-4")}>
                        <span className={cn("block", palette.primaryText)}>
                          <Highlight text={shortcut.action} query={normalized} markClassName={markClass} />
                        </span>
                        {shortcut.description ? (
                          <span className={cn("mt-0.5 block text-[12px] leading-[1.4]", palette.secondaryText)}>
                            <Highlight text={shortcut.description} query={normalized} markClassName={markClass} />
                          </span>
                        ) : null}
                      </td>
                      <td className={cn(cell, "pl-2 pr-5", narrow && "pr-4")}>
                        <span className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-1">
                          {chords.map((chord, c) => (
                            <Fragment key={c}>
                              {c > 0 ? (
                                <span className={cn("px-0.5 text-[11px]", palette.secondaryText)}>then</span>
                              ) : null}
                              <kbd className="inline-flex items-center gap-[3px] font-sans">
                                {chord.map((info, j) => {
                                  const hit = keyHits?.[c]?.[j] ?? false;
                                  return (
                                    <Fragment key={j}>
                                      {j > 0 ? (
                                        <>
                                          <span aria-hidden className={cn("text-[10px]", palette.secondaryText, "opacity-70")}>
                                            +
                                          </span>
                                          <span className="sr-only"> plus </span>
                                        </>
                                      ) : null}
                                      <kbd
                                        className={cn(
                                          "inline-grid h-[22px] min-w-[22px] place-items-center rounded-[6px] border border-b-2 px-[6px] font-sans text-[11.5px] font-medium leading-none tabular-nums transition-colors duration-150 motion-reduce:transition-none",
                                          hit ? keyCapHit : keyCap
                                        )}
                                      >
                                        <span aria-hidden>{info.glyph}</span>
                                        <span className="sr-only">{info.spoken}</span>
                                      </kbd>
                                    </Fragment>
                                  );
                                })}
                              </kbd>
                            </Fragment>
                          ))}
                        </span>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        )}
      </div>

      <div
        className={cn(
          "flex items-center justify-between gap-3 border-t px-5 py-2.5 text-[11.5px]",
          narrow && "px-4",
          palette.divider,
          palette.secondaryText
        )}
      >
        <span aria-live="polite" className="tabular-nums">
          {normalized ? `${matchCount} of ${totalCount} shortcuts` : `${totalCount} shortcuts`}
        </span>
        {searchable && !narrow ? (
          <span>
            Press <span className={cn("font-medium", palette.primaryText)}>/</span> to search
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default ShortcutsTable;
