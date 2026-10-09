"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pencil, Search } from "lucide-react";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import { ease, easeCss, springs } from "@/components/bjork-ui/_core/motion";
import {
  AI_PANEL,
  FOCUS_RING,
  PRESS,
  useAiTone,
  useControllable,
  useReduceMotion,
  type BjorkTone,
} from "@/components/bjork-ui/ai/_shared";
import { cn } from "@/lib/utils";

export interface MemoryItem {
  id: string;
  /** The remembered fact, as one sentence. */
  text: string;
  /** Group heading, such as "Preferences" or "Projects". */
  category: string;
  /** "chat" was inferred from a conversation; "user" was added by hand. */
  source: "chat" | "user";
  /** ISO date the memory was saved. Shown for chat memories. */
  savedAt?: string;
  /** Marks a memory saved recently with a soft accent dot. */
  recent?: boolean;
}

export interface MemoryViewerProps {
  memories: MemoryItem[];
  /**
   * Called once a forget is final: 5 seconds after Forget, unless Undo was pressed. The row hides at once and an
   * Undo receipt takes its place until then.
   */
  onForget?: (id: string) => void;
  onEdit?: (id: string, text: string) => void;
  /** Controlled on/off state of memory. */
  enabled?: boolean;
  defaultEnabled?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
  /** Category order. Categories not listed follow in order of appearance. */
  categories?: string[];
  /** Demo/preview only: opens this memory in edit mode on mount. */
  defaultEditingId?: string;
  tone?: BjorkTone;
  className?: string;
}

export const SAMPLE_MEMORIES: MemoryItem[] = [
  { id: "m1", category: "Preferences", text: "Prefers concise answers with the code first and the explanation after.", source: "chat", savedAt: "2026-09-14" },
  { id: "m2", category: "Preferences", text: "Writes in British English: colour, organise, programme.", source: "user" },
  { id: "m3", category: "Preferences", text: "Likes metric units and 24-hour times.", source: "chat", savedAt: "2026-08-30" },
  { id: "m4", category: "Work", text: "Staff product designer at Northwind Atlas, a mapping startup.", source: "user" },
  { id: "m5", category: "Work", text: "Runs design reviews on Thursday afternoons.", source: "chat", savedAt: "2026-09-02" },
  {
    id: "m6",
    category: "Projects",
    text: "Building Tideline, an offline-first field notes app in React Native.",
    source: "chat",
    savedAt: "2026-10-06",
    recent: true,
  },
  {
    id: "m7",
    category: "Projects",
    text: "Tideline syncs with CRDTs; do not suggest last-write-wins.",
    source: "chat",
    savedAt: "2026-10-07",
    recent: true,
  },
  { id: "m8", category: "Personal", text: "Training for a half marathon in March.", source: "chat", savedAt: "2026-07-21" },
  { id: "m9", category: "Personal", text: "Vegetarian, and cooks most weeknights.", source: "user" },
];

const DEFAULT_CATEGORIES = ["Preferences", "Work", "Projects", "Personal"];
const UNDO_MS = 5000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function provenance(m: MemoryItem): string {
  if (m.source === "user") return "You added";
  const d = m.savedAt ? /^(\d{4})-(\d{2})-(\d{2})/.exec(m.savedAt) : null;
  return d ? `From chat · ${MONTHS[Number(d[2]) - 1]} ${Number(d[3])}` : "From chat";
}

/**
 * What the assistant remembers about the user, grouped by category. Each memory can be edited in place or
 * forgotten with a five-second undo. Turning memory off dims the list and explains what that means.
 */
export function MemoryViewer({
  memories,
  onForget,
  onEdit,
  enabled,
  defaultEnabled = true,
  onEnabledChange,
  categories = DEFAULT_CATEGORIES,
  defaultEditingId,
  tone: toneProp,
  className,
}: MemoryViewerProps) {
  const { style } = useAiTone(toneProp);
  const reduce = useReduceMotion();
  const [isOn, setOn] = useControllable(enabled, defaultEnabled, onEnabledChange);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(defaultEditingId ?? null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string[]>([]);
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const [announce, setAnnounce] = useState("");
  const titleId = useId();
  const noteId = useId();

  // A forget still waiting on its undo window is committed if the viewer unmounts.
  const pendingRef = useRef(pending);
  const onForgetRef = useRef(onForget);
  useLayoutEffect(() => {
    pendingRef.current = pending;
    onForgetRef.current = onForget;
  });
  useEffect(() => () => pendingRef.current.forEach((id) => onForgetRef.current?.(id)), []);

  const live = memories.filter((m) => !gone.has(m.id));
  const remembered = live.filter((m) => !pending.includes(m.id)).length;
  const q = query.trim().toLowerCase();
  const textOf = (m: MemoryItem) => edits[m.id] ?? m.text;
  const visible = q ? live.filter((m) => textOf(m).toLowerCase().includes(q) || m.category.toLowerCase().includes(q)) : live;
  const order = [...categories, ...visible.map((m) => m.category).filter((c) => !categories.includes(c))];
  const groups = order
    .filter((c, i) => order.indexOf(c) === i)
    .map((category) => ({ category, items: visible.filter((m) => m.category === category) }))
    .filter((g) => g.items.length > 0);

  const forget = (m: MemoryItem) => {
    setPending((p) => [...p, m.id]);
    if (editingId === m.id) setEditingId(null);
    setAnnounce("Memory forgotten. Undo is available for 5 seconds.");
  };
  const undo = (m: MemoryItem) => {
    setPending((p) => p.filter((id) => id !== m.id));
    setAnnounce("Memory restored");
  };
  const expire = (m: MemoryItem) => {
    setPending((p) => p.filter((id) => id !== m.id));
    setGone((g) => new Set(g).add(m.id));
    onForget?.(m.id);
  };
  const save = (m: MemoryItem, text: string) => {
    const next = text.trim();
    setEditingId(null);
    if (!next || next === textOf(m)) return;
    setEdits((e) => ({ ...e, [m.id]: next }));
    onEdit?.(m.id, next);
    setAnnounce("Memory updated");
  };

  return (
    <section
      aria-labelledby={titleId}
      className={cn(AI_PANEL, "@container w-full max-w-[560px] font-bjork-alpha text-[color:var(--bjork-text)]", className)}
      style={style}
    >
      <header className="flex items-center justify-between gap-3 pb-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 id={titleId} className="text-[14px] font-semibold leading-5">
            Memory
          </h2>
          <span className="font-mono text-[12px] leading-5 tabular-nums text-[color:var(--bjork-text-muted)]">
            {remembered} {remembered === 1 ? "memory" : "memories"}
          </span>
        </div>
        <MemorySwitch
          on={isOn}
          onChange={(next) => {
            setOn(next);
            setAnnounce(next ? "Memory turned on" : "Memory turned off");
          }}
        />
      </header>

      <label className="relative mb-1 flex h-9 items-center gap-2 rounded-[10px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-field)] px-3 focus-within:border-[color:var(--bjork-border-strong)]">
        <Search aria-hidden="true" size={14} strokeWidth={1.75} className="shrink-0 text-[color:var(--bjork-text-faint)]" />
        <span className="sr-only">Search memories</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && query) {
              e.preventDefault();
              setQuery("");
            }
          }}
          placeholder="Search memories"
          className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-[color:var(--bjork-text)] outline-none placeholder:text-[color:var(--bjork-text-soft)] [&::-webkit-search-cancel-button]:hidden"
        />
      </label>

      <div
        className="grid"
        style={{
          gridTemplateRows: isOn ? "0fr" : "1fr",
          transition: reduce ? "none" : `grid-template-rows 280ms ${easeCss.drawer}`,
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <p
            id={noteId}
            className="mt-2 rounded-[10px] border border-dashed border-[color:var(--bjork-border-strong)] px-3 py-2.5 text-[13px] leading-5 text-[color:var(--bjork-text-muted)]"
          >
            <span className="font-medium text-[color:var(--bjork-text)]">Memory is off.</span> New chats won’t save or use
            these memories. They stay here until you forget them.
          </p>
        </div>
      </div>

      <div
        aria-describedby={isOn ? undefined : noteId}
        className={cn("transition-opacity duration-200", !isOn && "opacity-45")}
      >
        {live.length === 0 ? (
          <EmptyState title="Nothing remembered yet" body="As you chat, useful details about you and your work show up here." />
        ) : groups.length === 0 ? (
          <EmptyState title={`No memories match “${query.trim()}”`} body="Try another word, or clear the search." />
        ) : (
          groups.map((group) => (
            <div key={group.category} className="pt-4" role="group" aria-label={group.category}>
              <h3 className="flex items-baseline gap-2 pb-1 font-mono text-[10px] font-normal uppercase tracking-[0.08em] text-[color:var(--bjork-text-faint)]">
                {group.category}
                <span className="tabular-nums">{group.items.filter((m) => !pending.includes(m.id)).length}</span>
              </h3>
              <ul className="-mx-1 flex flex-col">
                <AnimatePresence initial={false}>
                  {group.items.map((m) => (
                    <motion.li
                      key={m.id}
                      layout={reduce ? false : "position"}
                      initial={reduce ? false : { opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, height: 0, filter: "blur(3px)" }}
                      transition={reduce ? { duration: 0 } : { duration: 0.24, ease: ease.out }}
                      // The 4px side padding keeps focus rings and the edit glow clear of the clip used by the height animation.
                      className="overflow-hidden border-b border-[color:var(--bjork-border)] px-1 last:border-b-0"
                    >
                      {pending.includes(m.id) ? (
                        <UndoReceipt memory={m} text={textOf(m)} onUndo={() => undo(m)} onExpire={() => expire(m)} />
                      ) : (
                        <MemoryRow
                          memory={m}
                          text={textOf(m)}
                          editing={editingId === m.id}
                          interactive={isOn}
                          onStartEdit={() => setEditingId(m.id)}
                          onCancel={() => setEditingId(null)}
                          onSave={(t) => save(m, t)}
                          onForget={() => forget(m)}
                        />
                      )}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </div>
          ))
        )}
      </div>
      <LiveRegion message={announce} />
    </section>
  );
}

function MemorySwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn("group flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-full pl-2.5 pr-1.5", FOCUS_RING)}
    >
      <span className="font-mono text-[11px] text-[color:var(--bjork-text-muted)]">{on ? "On" : "Off"}</span>
      <span
        aria-hidden="true"
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors duration-200",
          on ? "bg-[color:var(--bjork-accent)]" : "bg-[color:var(--bjork-surface-active)] shadow-[inset_0_0_0_1px_var(--bjork-border-strong)]",
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 size-4 rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-transform duration-200 ease-out motion-reduce:transition-none",
            on ? "translate-x-4 bg-[color:var(--bjork-accent-foreground)]" : "translate-x-0 bg-[color:var(--bjork-text-muted)]",
          )}
        />
      </span>
    </button>
  );
}

interface RowProps {
  memory: MemoryItem;
  text: string;
  editing: boolean;
  interactive: boolean;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: (text: string) => void;
  onForget: () => void;
}

function MemoryRow({ memory, text, editing, interactive, onStartEdit, onCancel, onSave, onForget }: RowProps) {
  const editRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  // After Save or Cancel from the keyboard, focus returns to the Edit button.
  useEffect(() => {
    if (editing || !restoreFocus.current) return;
    restoreFocus.current = false;
    editRef.current?.focus();
  }, [editing]);

  if (editing) {
    return (
      <EditForm
        initial={text}
        onCancel={() => {
          restoreFocus.current = true;
          onCancel();
        }}
        onSave={(t) => {
          restoreFocus.current = true;
          onSave(t);
        }}
      />
    );
  }

  return (
    <div className="group relative flex items-start gap-3 py-2.5">
      <span aria-hidden="true" className="flex h-5 w-1.5 shrink-0 items-center">
        {memory.recent && <span className="size-1.5 rounded-full bg-[color:var(--bjork-accent)] shadow-[0_0_0_3px_var(--bjork-accent-soft)]" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] leading-5 text-[color:var(--bjork-text)]">
          {text}
          {memory.recent && <span className="sr-only"> (recently added)</span>}
        </p>
        <p className="mt-0.5 font-mono text-[11px] leading-4 text-[color:var(--bjork-text-faint)]">{provenance(memory)}</p>
      </div>
      <div
        className={cn(
          "flex shrink-0 items-center gap-0.5 transition-opacity duration-150",
          "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100",
          !interactive && "pointer-events-none",
        )}
      >
        <button
          ref={editRef}
          type="button"
          disabled={!interactive}
          onClick={onStartEdit}
          aria-label={`Edit: ${text}`}
          className={cn(
            "grid size-7 cursor-pointer place-items-center rounded-[7px] text-[color:var(--bjork-text-muted)] transition-colors duration-150 hover:bg-[color:var(--bjork-surface-active)] hover:text-[color:var(--bjork-text)]",
            FOCUS_RING,
            PRESS,
          )}
        >
          <Pencil aria-hidden="true" size={13} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          disabled={!interactive}
          onClick={onForget}
          aria-label={`Forget: ${text}`}
          className={cn(
            "h-7 cursor-pointer rounded-[7px] px-2 text-[12px] font-medium text-[color:var(--bjork-text-muted)] transition-colors duration-150 hover:bg-[color:color-mix(in_srgb,var(--bjork-error)_10%,transparent)] hover:text-[color:var(--bjork-error)]",
            FOCUS_RING,
            PRESS,
          )}
        >
          Forget
        </button>
      </div>
    </div>
  );
}

function EditForm({ initial, onCancel, onSave }: { initial: string; onCancel: () => void; onSave: (t: string) => void }) {
  const [draft, setDraft] = useState(initial);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSave(draft);
    }
  };

  return (
    <form
      className="flex flex-col gap-2 py-2.5 pl-[18px]"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <textarea
        ref={areaRef}
        rows={1}
        value={draft}
        // Focus the field as it opens, with the caret at the end.
        autoFocus
        onFocus={(e) => e.currentTarget.setSelectionRange(draft.length, draft.length)}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        aria-label="Edit memory"
        className="block w-full resize-none overflow-hidden rounded-[9px] border border-[color:var(--bjork-accent-muted)] bg-[color:var(--bjork-field)] px-3 py-2 text-[14px] leading-5 text-[color:var(--bjork-text)] shadow-[0_0_0_3px_var(--bjork-accent-soft)] outline-none"
      />
      <div className="flex items-center justify-end gap-1.5">
        <span className="mr-auto hidden font-mono text-[10.5px] text-[color:var(--bjork-text-faint)] @[400px]:inline">
          ↵ save · esc cancel
        </span>
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            "h-7 cursor-pointer rounded-[7px] px-2.5 text-[12px] font-medium text-[color:var(--bjork-text-muted)] hover:bg-[color:var(--bjork-surface-active)] hover:text-[color:var(--bjork-text)]",
            FOCUS_RING,
            PRESS,
          )}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!draft.trim()}
          className={cn(
            "h-7 cursor-pointer rounded-[7px] bg-[color:var(--bjork-accent)] px-3 text-[12px] font-medium text-[color:var(--bjork-accent-foreground)] disabled:cursor-not-allowed disabled:opacity-45",
            FOCUS_RING,
            PRESS,
          )}
        >
          Save
        </button>
      </div>
    </form>
  );
}

function UndoReceipt({
  memory,
  text,
  onUndo,
  onExpire,
}: {
  memory: MemoryItem;
  text: string;
  onUndo: () => void;
  onExpire: () => void;
}) {
  const reduce = useReduceMotion();
  const undoRef = useRef<HTMLButtonElement>(null);
  const expireRef = useRef(onExpire);
  useLayoutEffect(() => {
    expireRef.current = onExpire;
  });

  useEffect(() => {
    // Keyboard users who pressed Forget land on Undo.
    if (document.activeElement === document.body || document.activeElement === null) undoRef.current?.focus();
    const id = window.setTimeout(() => expireRef.current(), UNDO_MS);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, filter: "blur(4px)" }}
      animate={{ opacity: 1, filter: "blur(0px)" }}
      transition={reduce ? { duration: 0 } : springs.blurIn}
      className="relative flex items-center gap-3 py-2.5 pl-[18px]"
      data-memory={memory.id}
    >
      <p className="min-w-0 flex-1 truncate text-[13px] leading-5 text-[color:var(--bjork-text-muted)]">
        Forgot <span className="text-[color:var(--bjork-text-soft)] line-through decoration-[color:var(--bjork-text-faint)]">{text}</span>
      </p>
      <button
        ref={undoRef}
        type="button"
        onClick={onUndo}
        className={cn(
          "h-7 shrink-0 cursor-pointer rounded-[7px] px-2.5 text-[12px] font-medium text-[color:var(--bjork-accent-ink)] hover:bg-[color:var(--bjork-accent-soft)]",
          FOCUS_RING,
          PRESS,
        )}
      >
        Undo
      </button>
      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px overflow-hidden">
        <span
          className="absolute inset-0 origin-left bg-[color:var(--bjork-text-faint)]"
          style={{ animation: reduce ? "none" : `bjork-memory-undo ${UNDO_MS}ms linear forwards` }}
        />
      </span>
      <style href="bjork-memory-undo" precedence="default">
        {"@keyframes bjork-memory-undo{from{transform:scaleX(1)}to{transform:scaleX(0)}}"}
      </style>
    </motion.div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
      <p className="text-[14px] font-medium leading-5 text-[color:var(--bjork-text-medium)]">{title}</p>
      <p className="max-w-[300px] text-[13px] leading-5 text-[color:var(--bjork-text-muted)]">{body}</p>
    </div>
  );
}
