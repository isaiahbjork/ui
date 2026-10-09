"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  type SVGProps,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  File,
  FileText,
  Inbox,
  Keyboard,
  MailOpen,
  Mail,
  Menu,
  Paperclip,
  PenSquare,
  Reply,
  Search,
  Send,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  BlockButton,
  BlockDialog,
  BlockDrawer,
  BlockField,
  IconButton,
  InitialsAvatar,
  Kbd,
  blockRoot,
  focusRing,
  inputClass,
  useAnnouncer,
  useAppBlockTheme,
  useBlockReducedMotion,
  useElementWidth,
  useHydrated,
  type AppBlockTheme,
} from "@/components/bjork-ui/blocks/app-block-kit";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------------------------------------- */

export type InboxFolder = "inbox" | "sent" | "drafts" | "archive" | "trash";

export interface InboxPerson {
  name: string;
  email: string;
}

export interface InboxMessage {
  id: string;
  from: InboxPerson;
  /** ISO timestamp. */
  date: string;
  /** Plain text; blank lines separate paragraphs. */
  body: string;
}

export interface InboxThread {
  id: string;
  subject: string;
  folder: InboxFolder;
  labels?: string[];
  unread?: boolean;
  starred?: boolean;
  attachments?: { name: string; size: string }[];
  /** Oldest first. */
  messages: InboxMessage[];
}

export interface InboxLabel {
  id: string;
  name: string;
  color: string;
}

export interface AppInboxProps {
  threads?: InboxThread[];
  labels?: InboxLabel[];
  /** The signed-in user; replies are sent as them. */
  me?: InboxPerson;
  defaultFolder?: InboxFolder | "starred";
  /** Thread open on first render. Defaults to the newest in the folder; pass null for none. */
  defaultOpenId?: string | null;
  onReply?: (threadId: string, body: string) => void;
  onCompose?: (draft: { to: string; subject: string; body: string }) => void;
  /** Fired after any change to a thread (read, star, move). */
  onThreadChange?: (thread: InboxThread) => void;
  /** "Now" for relative dates. Defaults to the newest message, so sample data reads naturally. */
  now?: string;
  theme?: AppBlockTheme;
  /** Skips list animations; for static captures. */
  disableAnimation?: boolean;
  className?: string;
}

/* ----------------------------------------------------------------------------------------------------------
 * Sample data
 * -------------------------------------------------------------------------------------------------------- */

const ME: InboxPerson = { name: "Rhea Castillo", email: "rhea@halcyon.app" };

const SAMPLE_LABELS: InboxLabel[] = [
  { id: "design", name: "Design", color: "#ec7d43" },
  { id: "customers", name: "Customers", color: "#3e9e74" },
  { id: "hiring", name: "Hiring", color: "#7b6cf0" },
  { id: "billing", name: "Billing", color: "#c9a227" },
];

const p = (name: string, email: string): InboxPerson => ({ name, email });
const MAREN = p("Maren Okafor", "maren@fieldnote.studio");
const THEO = p("Theo Lindqvist", "theo@halcyon.app");
const AMARA = p("Amara Nwosu", "amara@halcyon.app");
const JONAS = p("Jonas Weber", "jonas@kettle.dev");
const PRIYA = p("Priya Raman", "priya@halcyon.app");
const STRIPE = p("Billing", "receipts@payments.example");
const LENA = p("Lena Duarte", "lena@northwind.coop");
const SAMI = p("Sami Haddad", "sami@halcyon.app");
const ODA = p("Oda Kristiansen", "oda@greyhaven.io");

const SAMPLE_THREADS: InboxThread[] = [
  {
    id: "t1",
    subject: "Revenue chart: the comparison line is confusing people",
    folder: "inbox",
    labels: ["design", "customers"],
    unread: true,
    starred: true,
    attachments: [
      { name: "session-notes.pdf", size: "212 KB" },
      { name: "chart-v3.fig", size: "4.1 MB" },
    ],
    messages: [
      {
        id: "t1m1",
        from: MAREN,
        date: "2026-10-08T09:12:00Z",
        body:
          "Hi Rhea,\n\nWe ran five sessions with finance leads this week. Four of them read the dashed comparison line as a forecast, not last period. One asked why we were predicting a dip in March.\n\nNotes attached. The quick fix might just be a legend that says “Previous period” and a lighter dash.",
      },
      {
        id: "t1m2",
        from: THEO,
        date: "2026-10-08T11:40:00Z",
        body:
          "Agree on the legend. I'd also drop the comparison line entirely on the 7-day view, where it's mostly noise.\n\nRhea, can you take a pass before Thursday's review?",
      },
      {
        id: "t1m3",
        from: MAREN,
        date: "2026-10-08T15:58:00Z",
        body:
          "One more: two people hovered the chart and expected the KPI cards above it to update to the hovered day. Might be worth a prototype.\n\nThe Figma file has three variants. My vote is v3.",
      },
    ],
  },
  {
    id: "t2",
    subject: "Offer letter for the senior design engineer role",
    folder: "inbox",
    labels: ["hiring"],
    unread: true,
    messages: [
      {
        id: "t2m1",
        from: AMARA,
        date: "2026-10-08T14:20:00Z",
        body:
          "Hi Rhea, the panel signed off on Kai. Can you write two sentences on what impressed you in the systems interview? I'll fold it into the offer note.\n\nWe'd like to send it by Friday.",
      },
    ],
  },
  {
    id: "t3",
    subject: "Re: Webhook retries after the outage",
    folder: "inbox",
    labels: ["customers"],
    messages: [
      {
        id: "t3m1",
        from: JONAS,
        date: "2026-10-07T18:05:00Z",
        body:
          "Hey team, after Tuesday's incident we received each order.paid event three times. Our handler is idempotent so nothing broke, but our on-call got paged twice.\n\nIs there a header we can use to spot a retry?",
      },
      {
        id: "t3m2",
        from: SAMI,
        date: "2026-10-08T08:30:00Z",
        body:
          "Hi Jonas, sorry for the noise. Every delivery carries Halcyon-Delivery-Attempt, starting at 1. We're also adding the original timestamp next sprint so you can drop stale retries outright.",
      },
    ],
  },
  {
    id: "t4",
    subject: "Your October invoice is ready",
    folder: "inbox",
    labels: ["billing"],
    attachments: [{ name: "INV-2026-010.pdf", size: "48 KB" }],
    messages: [
      {
        id: "t4m1",
        from: STRIPE,
        date: "2026-10-08T07:00:00Z",
        body: "Invoice INV-2026-010 for $588.00 is ready. It will be charged to the Visa ending in 4242 on October 15.\n\nNo action is needed.",
      },
    ],
  },
  {
    id: "t5",
    subject: "Design review moved to Thursday 2pm",
    folder: "inbox",
    labels: ["design"],
    starred: true,
    messages: [
      {
        id: "t5m1",
        from: PRIYA,
        date: "2026-10-07T16:45:00Z",
        body:
          "Moving the dashboard review to Thursday at 2pm so Theo can join from Lisbon. Same room, same doc.\n\nAgenda: chart legend, empty states, the orders table on phones.",
      },
    ],
  },
  {
    id: "t6",
    subject: "Co-op pilot: 40 seats from November",
    folder: "inbox",
    labels: ["customers"],
    unread: true,
    messages: [
      {
        id: "t6m1",
        from: LENA,
        date: "2026-10-06T13:10:00Z",
        body:
          "Hello! Northwind would like to start the pilot on November 3 with 40 seats across two warehouses.\n\nTwo questions: can we export the orders table to CSV on a schedule, and can store managers see only their own store?",
      },
    ],
  },
  {
    id: "t7",
    subject: "Empty states, round two",
    folder: "inbox",
    labels: ["design"],
    messages: [
      {
        id: "t7m1",
        from: THEO,
        date: "2026-10-05T10:00:00Z",
        body: "Pushed the second round of empty states. I cut the illustrations down to a single line of copy and one action. Much calmer.",
      },
      {
        id: "t7m2",
        from: ME,
        date: "2026-10-05T12:22:00Z",
        body: "Much better. The search empty state should offer “Clear filters” as the action, since that's usually the cause.",
      },
    ],
  },
  {
    id: "t8",
    subject: "Interview loop for Saturday candidates",
    folder: "inbox",
    labels: ["hiring"],
    messages: [
      {
        id: "t8m1",
        from: AMARA,
        date: "2026-10-03T09:40:00Z",
        body: "Three candidates on Saturday. I've put you on the 11:00 systems interview. The rubric is linked in the calendar invite.",
      },
    ],
  },
  {
    id: "t9",
    subject: "Accessibility audit results",
    folder: "inbox",
    attachments: [{ name: "audit-q3.pdf", size: "1.2 MB" }],
    messages: [
      {
        id: "t9m1",
        from: ODA,
        date: "2026-09-29T15:15:00Z",
        body:
          "Attached is the Q3 audit. The headline: 2 blockers, 9 serious, 14 minor. Both blockers are focus traps in the old filter popover.\n\nHappy to walk through it on a call.",
      },
    ],
  },
  {
    id: "t10",
    subject: "Re: Chart colours in dark mode",
    folder: "sent",
    labels: ["design"],
    messages: [
      {
        id: "t10m1",
        from: ME,
        date: "2026-10-07T20:10:00Z",
        body: "Sending the updated palette. The comparison series now uses a neutral ink at 30% so it never competes with the accent.",
      },
    ],
  },
  {
    id: "t11",
    subject: "Draft: Q4 roadmap notes",
    folder: "drafts",
    messages: [
      {
        id: "t11m1",
        from: ME,
        date: "2026-10-06T22:00:00Z",
        body: "Q4 themes: saved views, scheduled exports, per-store permissions…",
      },
    ],
  },
  {
    id: "t12",
    subject: "Quarterly offsite logistics",
    folder: "archive",
    messages: [
      {
        id: "t12m1",
        from: PRIYA,
        date: "2026-09-20T11:00:00Z",
        body: "Hotel blocks are booked. Please submit travel by October 1.",
      },
    ],
  },
];

/* ----------------------------------------------------------------------------------------------------------
 * Helpers
 * -------------------------------------------------------------------------------------------------------- */

const FOLDERS: { id: InboxFolder | "starred"; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "starred", label: "Starred", icon: Star },
  { id: "sent", label: "Sent", icon: Send },
  { id: "drafts", label: "Drafts", icon: FileText },
  { id: "archive", label: "Archive", icon: Archive },
  { id: "trash", label: "Trash", icon: Trash2 },
];

const lastDate = (t: InboxThread) => t.messages[t.messages.length - 1]?.date ?? "";

function snippet(body: string) {
  return body.replace(/\s+/g, " ").trim();
}

function inFolder(t: InboxThread, folder: InboxFolder | "starred") {
  return folder === "starred" ? Boolean(t.starred) && t.folder !== "trash" : t.folder === folder;
}

function newestIn(threads: InboxThread[], folder: InboxFolder | "starred", label: string | null = null) {
  return threads
    .filter((t) => inFolder(t, folder) && (!label || t.labels?.includes(label)))
    .sort((a, b) => lastDate(b).localeCompare(lastDate(a)))[0];
}

/** Formats in UTC until hydrated so server and client agree, then in the viewer's zone. */
function useDateFormat(now: number) {
  const hydrated = useHydrated();
  return useMemo(() => {
    const timeZone = hydrated ? undefined : "UTC";
    const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone });
    const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone });
    const full = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    });
    const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone });
    const today = dayKey.format(now);
    return {
      short: (iso: string) => {
        const d = new Date(iso);
        return dayKey.format(d) === today ? time.format(d) : day.format(d);
      },
      full: (iso: string) => full.format(new Date(iso)),
    };
  }, [hydrated, now]);
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && Boolean(el.closest("input, textarea, select, [contenteditable=true]"));

/* ----------------------------------------------------------------------------------------------------------
 * Block
 * -------------------------------------------------------------------------------------------------------- */

const WIDE = 1040;
const MEDIUM = 700;

export function AppInbox({
  threads: initialThreads = SAMPLE_THREADS,
  labels = SAMPLE_LABELS,
  me = ME,
  defaultFolder = "inbox",
  defaultOpenId,
  onReply,
  onCompose,
  onThreadChange,
  now,
  theme = "auto",
  disableAnimation = false,
  className,
}: AppInboxProps) {
  const { style } = useAppBlockTheme(theme);
  const reduce = useBlockReducedMotion();
  const animate = !disableAnimation && !reduce;
  const rootRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(rootRef);
  const wide = width === 0 || width >= WIDE;
  const medium = width === 0 || width >= MEDIUM;
  const { announce, region } = useAnnouncer();

  const nowMs = useMemo(() => {
    if (now) return new Date(now).getTime();
    return Math.max(...initialThreads.map((t) => new Date(lastDate(t)).getTime()).filter(Number.isFinite), 0);
  }, [now, initialThreads]);
  const fmt = useDateFormat(nowMs);

  const [threads, setThreads] = useState<InboxThread[]>(() => {
    const firstId = defaultOpenId === undefined ? newestIn(initialThreads, defaultFolder)?.id : defaultOpenId;
    return initialThreads.map((t) => (t.id === firstId ? { ...t, unread: false } : t));
  });
  const [folder, setFolder] = useState<InboxFolder | "starred">(defaultFolder);
  const [label, setLabel] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(() =>
    defaultOpenId === undefined ? (newestIn(initialThreads, defaultFolder)?.id ?? null) : defaultOpenId,
  );
  // On narrow containers the reader replaces the list; this tracks whether it is showing.
  const [readerShown, setReaderShown] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [undo, setUndo] = useState<{ message: string; previous: InboxThread[] } | null>(null);
  const undoTimer = useRef<number | undefined>(undefined);

  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const modalOpen = composeOpen || helpOpen || (drawerOpen && !wide);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return threads
      .filter((t) => inFolder(t, folder))
      .filter((t) => !label || t.labels?.includes(label))
      .filter((t) => !unreadOnly || t.unread)
      .filter(
        (t) =>
          !q ||
          t.subject.toLowerCase().includes(q) ||
          t.messages.some((m) => m.from.name.toLowerCase().includes(q) || m.body.toLowerCase().includes(q)),
      )
      .sort((a, b) => lastDate(b).localeCompare(lastDate(a)));
  }, [threads, folder, label, unreadOnly, query]);

  const counts = useMemo(() => {
    const unread: Record<string, number> = {};
    for (const f of FOLDERS) unread[f.id] = threads.filter((t) => inFolder(t, f.id) && t.unread).length;
    const drafts = threads.filter((t) => t.folder === "drafts").length;
    return { unread, drafts };
  }, [threads]);

  const open = threads.find((t) => t.id === openId) ?? null;
  const openIndex = visible.findIndex((t) => t.id === openId);
  const showList = medium || !readerShown;
  const showReader = medium || readerShown;

  useEffect(() => () => window.clearTimeout(undoTimer.current), []);

  /* --- mutations ------------------------------------------------------------------------------------- */

  const patch = (ids: string[], change: (t: InboxThread) => InboxThread) => {
    if (onThreadChange) threads.filter((t) => ids.includes(t.id)).forEach((t) => onThreadChange(change(t)));
    setThreads((list) => list.map((t) => (ids.includes(t.id) ? change(t) : t)));
  };

  const offerUndo = (message: string, ids: string[]) => {
    window.clearTimeout(undoTimer.current);
    setUndo({ message, previous: threads.filter((t) => ids.includes(t.id)) });
    announce(`${message}. Press Z to undo.`);
    undoTimer.current = window.setTimeout(() => setUndo(null), 6000);
  };

  const runUndo = () => {
    if (!undo) return;
    const byId = new Map(undo.previous.map((t) => [t.id, t]));
    setThreads((list) => list.map((t) => byId.get(t.id) ?? t));
    window.clearTimeout(undoTimer.current);
    setUndo(null);
    announce("Undone");
  };

  const openThread = (id: string | null, opts: { focusRow?: boolean } = {}) => {
    setOpenId(id);
    if (id) {
      patch([id], (t) => (t.unread ? { ...t, unread: false } : t));
      if (!medium) setReaderShown(true);
      if (opts.focusRow) rowRefs.current.get(id)?.focus();
    }
  };

  /** After threads leave the view, keep the reader on the next one down (or up, at the end). */
  const advancePast = (ids: string[]) => {
    if (!openId || !ids.includes(openId)) return;
    const remaining = visible.filter((t) => !ids.includes(t.id));
    const after = visible.slice(openIndex + 1).find((t) => !ids.includes(t.id));
    const nextId = after?.id ?? remaining[remaining.length - 1]?.id ?? null;
    setOpenId(nextId);
    if (!medium) setReaderShown(false);
    if (nextId) window.requestAnimationFrame(() => rowRefs.current.get(nextId)?.focus());
  };

  const move = (ids: string[], to: InboxFolder) => {
    if (ids.length === 0) return;
    const noun = ids.length === 1 ? "Conversation" : `${ids.length} conversations`;
    const verb = to === "archive" ? "archived" : to === "trash" ? "moved to Trash" : "moved to Inbox";
    offerUndo(`${noun} ${verb}`, ids);
    advancePast(ids);
    patch(ids, (t) => ({ ...t, folder: to }));
    setSelected(new Set());
  };

  const toggleStar = (id: string) => {
    const t = threads.find((x) => x.id === id);
    if (!t) return;
    patch([id], (x) => ({ ...x, starred: !x.starred }));
    announce(t.starred ? "Unstarred" : "Starred");
  };

  const setRead = (ids: string[], read: boolean) => {
    if (ids.length === 0) return;
    patch(ids, (t) => ({ ...t, unread: !read }));
    announce(`Marked ${ids.length === 1 ? "" : `${ids.length} `}as ${read ? "read" : "unread"}`);
    setSelected(new Set());
  };

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const changeFolder = (next: InboxFolder | "starred", nextLabel: string | null = null) => {
    setFolder(next);
    setLabel(nextLabel);
    setSelected(new Set());
    setReaderShown(false);
    setDrawerOpen(false);
    const first = newestIn(threads, next, nextLabel);
    setOpenId(medium ? (first?.id ?? null) : null);
    if (medium && first) patch([first.id], (t) => ({ ...t, unread: false }));
  };

  const sendReply = (body: string) => {
    if (!open) return;
    const message: InboxMessage = { id: `${open.id}-r${Date.now()}`, from: me, date: new Date(Math.max(Date.now(), nowMs)).toISOString(), body };
    patch([open.id], (t) => ({ ...t, messages: [...t.messages, message] }));
    onReply?.(open.id, body);
    announce("Reply sent");
  };

  /* --- keyboard -------------------------------------------------------------------------------------- */

  const step = (delta: number) => {
    if (visible.length === 0) return;
    const from = openIndex < 0 ? (delta > 0 ? -1 : visible.length) : openIndex;
    const next = visible[Math.min(visible.length - 1, Math.max(0, from + delta))];
    if (!next) return;
    if (!medium && !readerShown) {
      setOpenId(next.id);
      rowRefs.current.get(next.id)?.focus();
      return;
    }
    openThread(next.id, { focusRow: medium });
  };

  const onRootKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (modalOpen || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
    const target = openId ? [openId] : [];
    const ids = selected.size > 0 ? [...selected] : target;
    const handlers: Record<string, () => void> = {
      j: () => step(1),
      k: () => step(-1),
      e: () => move(ids, folder === "archive" ? "inbox" : "archive"),
      "#": () => move(ids, "trash"),
      s: () => openId && toggleStar(openId),
      u: () => {
        if (ids.length === 0) return;
        const t = threads.find((x) => x.id === ids[0]);
        setRead(ids, Boolean(t?.unread));
      },
      x: () => openId && toggleSelect(openId),
      r: () => replyRef.current?.focus(),
      c: () => setComposeOpen(true),
      z: () => runUndo(),
      "/": () => searchRef.current?.focus(),
      "?": () => setHelpOpen(true),
      Escape: () => {
        if (selected.size > 0) setSelected(new Set());
        else if (!medium && readerShown) {
          setReaderShown(false);
          if (openId) window.requestAnimationFrame(() => rowRefs.current.get(openId)?.focus());
        }
      },
    };
    const handler = handlers[event.key];
    if (!handler) return;
    event.preventDefault();
    handler();
  };

  /* --- render ---------------------------------------------------------------------------------------- */

  const folderNav = (
    <FolderNav
      folder={folder}
      label={label}
      labels={labels}
      counts={counts}
      onFolder={(f) => changeFolder(f)}
      onLabel={(l) => changeFolder("inbox", l)}
      onCompose={() => {
        setDrawerOpen(false);
        setComposeOpen(true);
      }}
      onClose={wide ? undefined : () => setDrawerOpen(false)}
    />
  );

  const folderTitle = label ? (labels.find((l) => l.id === label)?.name ?? "Label") : FOLDERS.find((f) => f.id === folder)?.label;

  return (
    <div ref={rootRef} tabIndex={-1} className={cn(blockRoot, "h-full outline-none", className)} style={style} onKeyDown={onRootKeyDown}>
      {wide && (
        <aside aria-label="Mailboxes" inert={modalOpen} className="flex h-full w-[220px] shrink-0 flex-col border-r border-[color:var(--bjork-border)] bg-[var(--bjork-panel)]">
          {folderNav}
        </aside>
      )}

      <div className="flex min-w-0 flex-1" inert={modalOpen}>
        {showList && (
          <section
            aria-label={`${folderTitle} conversations`}
            className={cn(
              "flex h-full min-w-0 flex-col",
              medium ? "w-[min(380px,42%)] shrink-0 border-r border-[color:var(--bjork-border)]" : "flex-1",
            )}
          >
            <ListHeader
              title={folderTitle ?? "Inbox"}
              unread={counts.unread[folder] ?? 0}
              showMenu={!wide}
              onMenu={() => setDrawerOpen(true)}
              query={query}
              onQuery={setQuery}
              searchRef={searchRef}
              unreadOnly={unreadOnly}
              onUnreadOnly={setUnreadOnly}
              onCompose={() => setComposeOpen(true)}
              onHelp={() => setHelpOpen(true)}
            />
            <BulkBar
              count={selected.size}
              total={visible.length}
              folder={folder}
              onSelectAll={() =>
                setSelected(selected.size === visible.length ? new Set() : new Set(visible.map((t) => t.id)))
              }
              onArchive={() => move([...selected], folder === "archive" ? "inbox" : "archive")}
              onTrash={() => move([...selected], "trash")}
              onRead={() => setRead([...selected], true)}
              onUnread={() => setRead([...selected], false)}
              onClear={() => setSelected(new Set())}
            />
            <ThreadList
              threads={visible}
              labels={labels}
              openId={openId}
              selected={selected}
              animate={animate}
              highlightOpen={medium}
              fmt={fmt.short}
              rowRefs={rowRefs}
              onOpen={(id) => openThread(id)}
              onToggleSelect={toggleSelect}
              onToggleStar={toggleStar}
              onStep={(id, delta) => {
                const i = visible.findIndex((t) => t.id === id);
                const next = visible[Math.min(visible.length - 1, Math.max(0, i + delta))];
                if (next) rowRefs.current.get(next.id)?.focus();
              }}
              emptyAction={
                query || unreadOnly || label ? (
                  <BlockButton
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setQuery("");
                      setUnreadOnly(false);
                      setLabel(null);
                    }}
                  >
                    Clear filters
                  </BlockButton>
                ) : null
              }
              emptyTitle={query ? `Nothing matches “${query}”` : folder === "inbox" && !label ? "Inbox zero" : `No conversations in ${folderTitle}`}
            />
          </section>
        )}

        {showReader && (
          <Reader
            thread={open}
            labels={labels}
            me={me}
            fmt={fmt}
            position={openIndex >= 0 ? { index: openIndex, total: visible.length } : null}
            showBack={!medium}
            folder={folder}
            replyRef={replyRef}
            onBack={() => {
              setReaderShown(false);
              if (openId) window.requestAnimationFrame(() => rowRefs.current.get(openId)?.focus());
            }}
            onStep={step}
            onArchive={() => openId && move([openId], folder === "archive" ? "inbox" : "archive")}
            onTrash={() => openId && move([openId], "trash")}
            onUnread={() => {
              if (!openId) return;
              setRead([openId], false);
              if (!medium) setReaderShown(false);
            }}
            onStar={() => openId && toggleStar(openId)}
            onSend={sendReply}
          />
        )}
      </div>

      {!wide && (
        <BlockDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} label="Mailboxes">
          {folderNav}
        </BlockDrawer>
      )}

      <UndoBar undo={undo} onUndo={runUndo} onDismiss={() => setUndo(null)} />

      <ComposeDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSend={(draft) => {
          const id = `c${Date.now()}`;
          setThreads((list) => [
            ...list,
            {
              id,
              subject: draft.subject || "(no subject)",
              folder: "sent",
              messages: [{ id: `${id}m1`, from: me, date: new Date(Math.max(Date.now(), nowMs)).toISOString(), body: draft.body }],
            },
          ]);
          onCompose?.(draft);
          setComposeOpen(false);
          announce(`Message to ${draft.to} sent`);
        }}
      />
      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      {region}
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------------------
 * Folder navigation
 * -------------------------------------------------------------------------------------------------------- */

function FolderNav({
  folder,
  label,
  labels,
  counts,
  onFolder,
  onLabel,
  onCompose,
  onClose,
}: {
  folder: InboxFolder | "starred";
  label: string | null;
  labels: InboxLabel[];
  counts: { unread: Record<string, number>; drafts: number };
  onFolder: (folder: InboxFolder | "starred") => void;
  onLabel: (label: string) => void;
  onCompose: () => void;
  onClose?: () => void;
}) {
  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-[color:var(--bjork-border)] px-3">
        <BlockButton variant="primary" size="md" className="flex-1" onClick={onCompose}>
          <PenSquare aria-hidden="true" />
          Compose
          <Kbd className="ml-auto border-white/25 bg-white/10 text-[color:var(--blk-accent-fill-ink)] shadow-none">C</Kbd>
        </BlockButton>
        {onClose && (
          <IconButton label="Close mailboxes" size="sm" onClick={onClose}>
            <X />
          </IconButton>
        )}
      </div>
      <nav aria-label="Folders" className="hide-scrollbar flex-1 overflow-y-auto px-2.5 py-3">
        <ul className="flex flex-col gap-0.5">
          {FOLDERS.map((f) => {
            const active = f.id === folder && !label;
            const Icon = f.icon;
            const count = f.id === "drafts" ? counts.drafts : (counts.unread[f.id] ?? 0);
            return (
              <li key={f.id}>
                <a
                  href={`#${f.id}`}
                  aria-current={active ? "page" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    onFolder(f.id);
                  }}
                  className={cn(
                    "relative flex h-9 items-center gap-2.5 rounded-[9px] px-2.5 text-[13.5px] transition-colors duration-150",
                    active
                      ? "bg-[var(--bjork-surface)] font-medium text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-soft),0_0_0_1px_var(--bjork-border)]"
                      : "text-[color:var(--bjork-text-medium)] hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)]",
                    focusRing,
                  )}
                >
                  <Icon aria-hidden="true" className={cn("size-4 shrink-0", active ? "text-[color:var(--blk-accent-ink)]" : "text-[color:var(--bjork-text-muted)]")} />
                  <span className="flex-1 truncate">{f.label}</span>
                  {count > 0 && (
                    <span className={cn("font-mono text-[11px] tabular-nums", f.id === "drafts" ? "text-[color:var(--bjork-text-soft)]" : "font-medium text-[color:var(--blk-accent-ink)]")}>
                      {count}
                      <span className="sr-only">{f.id === "drafts" ? " drafts" : " unread"}</span>
                    </span>
                  )}
                </a>
              </li>
            );
          })}
        </ul>

        {labels.length > 0 && (
          <>
            <h2 className="mb-1.5 mt-6 px-2.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-[color:var(--bjork-text-soft)]">Labels</h2>
            <ul className="flex flex-col gap-0.5">
              {labels.map((l) => {
                const active = l.id === label;
                return (
                  <li key={l.id}>
                    <a
                      href={`#label-${l.id}`}
                      aria-current={active ? "page" : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        onLabel(l.id);
                      }}
                      className={cn(
                        "flex h-8 items-center gap-2.5 rounded-[9px] px-2.5 text-[13px] transition-colors duration-150",
                        active
                          ? "bg-[var(--bjork-surface)] font-medium text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-soft),0_0_0_1px_var(--bjork-border)]"
                          : "text-[color:var(--bjork-text-medium)] hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)]",
                        focusRing,
                      )}
                    >
                      <span aria-hidden="true" className="ml-1 mr-0.5 size-2 rounded-[3px]" style={{ background: l.color }} />
                      {l.name}
                    </a>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </nav>
      <div className="shrink-0 border-t border-[color:var(--bjork-border)] p-3 text-[11.5px] leading-[1.5] text-[color:var(--bjork-text-soft)]">
        <p className="flex items-center gap-1.5">
          <Keyboard aria-hidden="true" className="size-3.5" />
          Press <Kbd>?</Kbd> for shortcuts
        </p>
      </div>
    </>
  );
}

/* ----------------------------------------------------------------------------------------------------------
 * List header, bulk bar and list
 * -------------------------------------------------------------------------------------------------------- */

function ListHeader({
  title,
  unread,
  showMenu,
  onMenu,
  query,
  onQuery,
  searchRef,
  unreadOnly,
  onUnreadOnly,
  onCompose,
  onHelp,
}: {
  title: string;
  unread: number;
  showMenu: boolean;
  onMenu: () => void;
  query: string;
  onQuery: (q: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  unreadOnly: boolean;
  onUnreadOnly: (v: boolean) => void;
  onCompose: () => void;
  onHelp: () => void;
}) {
  return (
    <div className="shrink-0 border-b border-[color:var(--bjork-border)]">
      <div className="flex h-14 items-center gap-2 px-3">
        {showMenu && (
          <IconButton label="Open mailboxes" onClick={onMenu}>
            <Menu />
          </IconButton>
        )}
        <h1 className="min-w-0 truncate text-[16px] font-semibold tracking-[-0.015em]">{title}</h1>
        {unread > 0 && (
          <span className="rounded-full bg-[var(--bjork-accent-soft)] px-2 py-px font-mono text-[11px] font-medium tabular-nums text-[color:var(--blk-accent-ink)]">
            {unread} new
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <div role="group" aria-label="Show" className="flex rounded-[9px] border border-[color:var(--bjork-border)] bg-[var(--bjork-field-inset)] p-[2px]">
            {[
              { v: false, l: "All" },
              { v: true, l: "Unread" },
            ].map((o) => (
              <button
                key={o.l}
                type="button"
                aria-pressed={unreadOnly === o.v}
                onClick={() => onUnreadOnly(o.v)}
                className={cn(
                  "h-6 rounded-[7px] px-2 text-[12px] font-medium transition-colors duration-150",
                  unreadOnly === o.v
                    ? "bg-[var(--bjork-surface)] text-[color:var(--bjork-text)] shadow-[0_0_0_1px_var(--bjork-border)]"
                    : "text-[color:var(--bjork-text-muted)] hover:text-[color:var(--bjork-text)]",
                  focusRing,
                )}
              >
                {o.l}
              </button>
            ))}
          </div>
          {showMenu && (
            <IconButton label="Compose" onClick={onCompose}>
              <PenSquare />
            </IconButton>
          )}
          <IconButton label="Keyboard shortcuts" size="sm" onClick={onHelp} className="hidden @lg:inline-grid">
            <Keyboard />
          </IconButton>
        </div>
      </div>
      <div className="px-3 pb-3">
        <label className="group relative flex items-center">
          <span className="sr-only">Search mail</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 size-[15px] text-[color:var(--bjork-text-soft)]" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                if (query) onQuery("");
                else e.currentTarget.blur();
              }
            }}
            placeholder="Search mail"
            className={cn(inputClass, "h-8 pl-8 pr-8 text-[13px] [&::-webkit-search-cancel-button]:hidden")}
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                onQuery("");
                searchRef.current?.focus();
              }}
              aria-label="Clear search"
              className={cn("absolute right-1.5 grid size-5 place-items-center rounded-[5px] text-[color:var(--bjork-text-soft)] hover:text-[color:var(--bjork-text)]", focusRing)}
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          ) : (
            <Kbd className="pointer-events-none absolute right-2 group-focus-within:opacity-0">/</Kbd>
          )}
        </label>
      </div>
    </div>
  );
}

function BulkBar({
  count,
  total,
  folder,
  onSelectAll,
  onArchive,
  onTrash,
  onRead,
  onUnread,
  onClear,
}: {
  count: number;
  total: number;
  folder: InboxFolder | "starred";
  onSelectAll: () => void;
  onArchive: () => void;
  onTrash: () => void;
  onRead: () => void;
  onUnread: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  const all = count === total;
  return (
    <div role="toolbar" aria-label={`${count} selected`} className="flex h-11 shrink-0 items-center gap-1 border-b border-[color:var(--bjork-border)] bg-[var(--bjork-accent-soft)] px-2">
      <button
        type="button"
        role="checkbox"
        aria-checked={all ? true : "mixed"}
        aria-label={all ? "Deselect all" : "Select all"}
        onClick={onSelectAll}
        className={cn("grid size-8 place-items-center rounded-[8px] hover:bg-[var(--bjork-surface-hover)]", focusRing)}
      >
        <CheckBox state={all ? "on" : "mixed"} />
      </button>
      <span className="mr-auto text-[12.5px] font-medium tabular-nums" aria-live="polite">
        {count} selected
      </span>
      <IconButton label={folder === "archive" ? "Move to inbox" : "Archive"} size="sm" onClick={onArchive}>
        {folder === "archive" ? <ArchiveRestore /> : <Archive />}
      </IconButton>
      <IconButton label="Mark as read" size="sm" onClick={onRead}>
        <MailOpen />
      </IconButton>
      <IconButton label="Mark as unread" size="sm" onClick={onUnread}>
        <Mail />
      </IconButton>
      <IconButton label="Move to trash" size="sm" onClick={onTrash}>
        <Trash2 />
      </IconButton>
      <IconButton label="Clear selection" size="sm" onClick={onClear}>
        <X />
      </IconButton>
    </div>
  );
}

function CheckBox({ state }: { state: "on" | "off" | "mixed" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-4 place-items-center rounded-[5px] border transition-colors duration-100",
        state === "off"
          ? "border-[color:var(--bjork-border-strong)] bg-[var(--bjork-field)]"
          : "border-transparent bg-[var(--blk-accent-fill)] text-[color:var(--blk-accent-fill-ink)]",
      )}
    >
      {state === "on" && (
        <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="m2.5 6.2 2.3 2.3L9.5 3.5" />
        </svg>
      )}
      {state === "mixed" && <span className="h-[1.6px] w-2 rounded-full bg-current" />}
    </span>
  );
}

function ThreadList({
  threads,
  labels,
  openId,
  selected,
  animate,
  highlightOpen,
  fmt,
  rowRefs,
  onOpen,
  onToggleSelect,
  onToggleStar,
  onStep,
  emptyTitle,
  emptyAction,
}: {
  threads: InboxThread[];
  labels: InboxLabel[];
  openId: string | null;
  selected: Set<string>;
  animate: boolean;
  highlightOpen: boolean;
  fmt: (iso: string) => string;
  rowRefs: RefObject<Map<string, HTMLButtonElement>>;
  onOpen: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onToggleStar: (id: string) => void;
  onStep: (id: string, delta: number) => void;
  emptyTitle: string;
  emptyAction: ReactNode;
}) {
  // Roving tab stop: the open row (or the first) is the list's one entry point.
  const tabId = threads.some((t) => t.id === openId) ? openId : threads[0]?.id;
  const selecting = selected.size > 0;

  if (threads.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <span aria-hidden="true" className="mb-1 grid size-11 place-items-center rounded-[13px] border border-[color:var(--bjork-border)] bg-[var(--bjork-surface)] shadow-[var(--bjork-shadow-surface)]">
          <Inbox className="size-5 text-[color:var(--bjork-text-muted)]" />
        </span>
        <p className="text-[13.5px] font-medium">{emptyTitle}</p>
        <p className="max-w-[240px] text-[12.5px] leading-[1.5] text-[color:var(--bjork-text-muted)]">
          {emptyAction ? "Try a different search or clear the filters." : "New mail shows up here."}
        </p>
        {emptyAction && <div className="mt-2">{emptyAction}</div>}
      </div>
    );
  }

  return (
    <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-label="Conversations">
      <AnimatePresence initial={false}>
        {threads.map((t) => {
          const last = t.messages[t.messages.length - 1];
          const isOpen = t.id === openId && highlightOpen;
          const isSelected = selected.has(t.id);
          const tab = t.id === tabId ? 0 : -1;
          const senders = [...new Set(t.messages.map((m) => m.from.name.split(" ")[0]))];
          const senderText = senders.length > 2 ? `${senders[0]} … ${senders[senders.length - 1]}` : senders.join(", ");
          return (
            <motion.li
              key={t.id}
              layout={animate ? "position" : false}
              initial={animate ? { opacity: 0, height: 0 } : false}
              animate={{ opacity: 1, height: "auto" }}
              exit={animate ? { opacity: 0, height: 0, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } } : { opacity: 0, transition: { duration: 0 } }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              className="overflow-hidden"
            >
              <div
                className={cn(
                  "group relative flex items-start gap-2.5 border-b border-[color:var(--bjork-border-muted)] py-3 pl-2 pr-2.5 transition-colors duration-100",
                  isSelected
                    ? "bg-[var(--bjork-accent-soft)]"
                    : isOpen
                      ? "bg-[var(--bjork-surface-active)]"
                      : "hover:bg-[var(--bjork-surface-hover)]",
                )}
              >
                {isOpen && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-[var(--bjork-accent)]" />}
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isSelected}
                  aria-label={`Select “${t.subject}”`}
                  tabIndex={tab}
                  onClick={() => onToggleSelect(t.id)}
                  className={cn("relative grid size-8 shrink-0 place-items-center rounded-full", focusRing)}
                >
                  <span className={cn("transition-opacity duration-100", isSelected || selecting ? "opacity-0" : "group-hover:opacity-0 group-focus-within:opacity-0")}>
                    <InitialsAvatar name={last.from.name} size={30} />
                  </span>
                  <span
                    className={cn(
                      "absolute inset-0 grid place-items-center transition-opacity duration-100",
                      isSelected || selecting ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                    )}
                  >
                    <CheckBox state={isSelected ? "on" : "off"} />
                  </span>
                </button>

                <button
                  ref={(el) => {
                    if (el) rowRefs.current.set(t.id, el);
                    else rowRefs.current.delete(t.id);
                  }}
                  type="button"
                  tabIndex={tab}
                  aria-current={isOpen ? "true" : undefined}
                  onClick={() => onOpen(t.id)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                      e.preventDefault();
                      onStep(t.id, e.key === "ArrowDown" ? 1 : -1);
                    }
                  }}
                  className={cn("min-w-0 flex-1 rounded-[6px] text-left", focusRing)}
                >
                  <span className="flex items-baseline gap-2">
                    {t.unread && (
                      <>
                        <span aria-hidden="true" className="size-[7px] shrink-0 -translate-y-px self-center rounded-full bg-[var(--bjork-accent)]" />
                        <span className="sr-only">Unread. </span>
                      </>
                    )}
                    <span className={cn("min-w-0 flex-1 truncate text-[13.5px]", t.unread ? "font-semibold" : "font-medium text-[color:var(--bjork-text-medium)]")}>
                      {senderText}
                      {t.messages.length > 1 && <span className="ml-1 font-mono text-[11px] font-normal text-[color:var(--bjork-text-soft)]">{t.messages.length}</span>}
                    </span>
                    <span className={cn("shrink-0 font-mono text-[11px] tabular-nums", t.unread ? "text-[color:var(--bjork-text)]" : "text-[color:var(--bjork-text-soft)]")}>
                      {fmt(last.date)}
                    </span>
                  </span>
                  <span className={cn("mt-0.5 block truncate pr-6 text-[13px]", t.unread ? "font-medium text-[color:var(--bjork-text)]" : "text-[color:var(--bjork-text-medium)]")}>
                    {t.subject}
                  </span>
                  <span className="mt-0.5 line-clamp-2 pr-6 text-[12.5px] leading-[1.45] text-[color:var(--bjork-text-muted)]">{snippet(last.body)}</span>
                  {Boolean(t.labels?.length || t.attachments?.length) && (
                    <span className="mt-2 flex flex-wrap items-center gap-1.5">
                      {t.attachments && t.attachments.length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-[6px] border border-[color:var(--bjork-border)] px-1.5 py-px text-[11px] text-[color:var(--bjork-text-muted)]">
                          <Paperclip aria-hidden="true" className="size-3" />
                          {t.attachments.length}
                          <span className="sr-only"> attachments</span>
                        </span>
                      )}
                      {t.labels?.map((id) => {
                        const l = labels.find((x) => x.id === id);
                        if (!l) return null;
                        return (
                          <span key={id} className="inline-flex items-center gap-1 rounded-[6px] bg-[var(--bjork-surface-active)] px-1.5 py-px text-[11px] text-[color:var(--bjork-text-medium)]">
                            <span aria-hidden="true" className="size-1.5 rounded-[2px]" style={{ background: l.color }} />
                            {l.name}
                          </span>
                        );
                      })}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  aria-pressed={Boolean(t.starred)}
                  aria-label={`Star “${t.subject}”`}
                  tabIndex={tab}
                  onClick={() => onToggleStar(t.id)}
                  className={cn(
                    "absolute bottom-3 right-2 grid size-7 place-items-center rounded-[7px] transition-[color,opacity,transform] duration-150 active:scale-90 motion-reduce:active:scale-100",
                    t.starred
                      ? "text-[color:var(--blk-warning)]"
                      : "text-[color:var(--bjork-text-faint)] opacity-0 hover:text-[color:var(--bjork-text-medium)] group-hover:opacity-100 focus-visible:opacity-100",
                    focusRing,
                  )}
                >
                  <Star aria-hidden="true" className="size-[15px]" fill={t.starred ? "currentColor" : "none"} />
                </button>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

/* ----------------------------------------------------------------------------------------------------------
 * Reader
 * -------------------------------------------------------------------------------------------------------- */

function Reader({
  thread,
  labels,
  me,
  fmt,
  position,
  showBack,
  folder,
  replyRef,
  onBack,
  onStep,
  onArchive,
  onTrash,
  onUnread,
  onStar,
  onSend,
}: {
  thread: InboxThread | null;
  labels: InboxLabel[];
  me: InboxPerson;
  fmt: { short: (iso: string) => string; full: (iso: string) => string };
  position: { index: number; total: number } | null;
  showBack: boolean;
  folder: InboxFolder | "starred";
  replyRef: RefObject<HTMLTextAreaElement | null>;
  onBack: () => void;
  onStep: (delta: number) => void;
  onArchive: () => void;
  onTrash: () => void;
  onUnread: () => void;
  onStar: () => void;
  onSend: (body: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const headingId = useId();

  if (!thread) {
    return (
      <section aria-label="Reading pane" className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 bg-[var(--bjork-panel)] px-8 text-center">
        <span aria-hidden="true" className="grid size-14 place-items-center rounded-[16px] border border-[color:var(--bjork-border)] bg-[var(--bjork-surface)] shadow-[var(--bjork-shadow-surface)]">
          <Mail className="size-6 text-[color:var(--bjork-text-muted)]" />
        </span>
        <p className="text-[14px] font-medium">No conversation open</p>
        <p className="flex flex-wrap items-center justify-center gap-1.5 text-[12.5px] text-[color:var(--bjork-text-muted)]">
          Pick one from the list, or press <Kbd>J</Kbd> to start at the top.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-1 flex-col bg-[var(--bjork-panel)]">
      <div role="toolbar" aria-label="Conversation actions" className="flex h-14 shrink-0 items-center gap-1 border-b border-[color:var(--bjork-border)] bg-[var(--bjork-bg)] px-2 @3xl:px-3">
        {showBack && (
          <IconButton label="Back to list" onClick={onBack}>
            <ArrowLeft />
          </IconButton>
        )}
        <IconButton label={folder === "archive" ? "Move to inbox (E)" : "Archive (E)"} onClick={onArchive}>
          {folder === "archive" ? <ArchiveRestore /> : <Archive />}
        </IconButton>
        <IconButton label="Move to trash (#)" onClick={onTrash}>
          <Trash2 />
        </IconButton>
        <IconButton label="Mark as unread (U)" onClick={onUnread}>
          <Mail />
        </IconButton>
        <IconButton label={thread.starred ? "Unstar (S)" : "Star (S)"} pressed={Boolean(thread.starred)} onClick={onStar}>
          <Star fill={thread.starred ? "currentColor" : "none"} className={thread.starred ? "text-[color:var(--blk-warning)]" : undefined} />
        </IconButton>
        {position && (
          <div className="ml-auto flex items-center gap-1">
            <span className="hidden font-mono text-[11.5px] tabular-nums text-[color:var(--bjork-text-soft)] @lg:inline">
              {position.index + 1} of {position.total}
            </span>
            <IconButton label="Newer conversation (K)" size="sm" disabled={position.index === 0} onClick={() => onStep(-1)}>
              <ChevronUp />
            </IconButton>
            <IconButton label="Older conversation (J)" size="sm" disabled={position.index >= position.total - 1} onClick={() => onStep(1)}>
              <ChevronDown />
            </IconButton>
          </div>
        )}
      </div>

      <div ref={scrollRef} className="@container/reader min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-[760px] px-4 pb-6 pt-6 @2xl/reader:px-8">
          <h2 id={headingId} className="text-[20px] font-semibold leading-[1.25] tracking-[-0.02em] @2xl/reader:text-[22px]">
            {thread.subject}
          </h2>
          {thread.labels && thread.labels.length > 0 && (
            <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Labels">
              {thread.labels.map((id) => {
                const l = labels.find((x) => x.id === id);
                if (!l) return null;
                return (
                  <li key={id} className="inline-flex items-center gap-1.5 rounded-[7px] border border-[color:var(--bjork-border)] bg-[var(--bjork-surface)] px-2 py-0.5 text-[11.5px] text-[color:var(--bjork-text-medium)]">
                    <span aria-hidden="true" className="size-1.5 rounded-[2px]" style={{ background: l.color }} />
                    {l.name}
                  </li>
                );
              })}
            </ul>
          )}

          <MessageStack key={thread.id} thread={thread} fmt={fmt} />

          {thread.attachments && thread.attachments.length > 0 && (
            <ul aria-label="Attachments" className="mt-4 grid grid-cols-1 gap-2 @lg/reader:grid-cols-2">
              {thread.attachments.map((a) => (
                <li key={a.name}>
                  <a
                    href={`#${a.name}`}
                    onClick={(e) => e.preventDefault()}
                    className={cn(
                      "flex items-center gap-3 rounded-[12px] border border-[color:var(--bjork-border)] bg-[var(--bjork-surface)] p-2.5 shadow-[var(--bjork-shadow-soft)] transition-colors hover:border-[color:var(--bjork-border-strong)]",
                      focusRing,
                    )}
                  >
                    <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-[var(--bjork-accent-soft)] text-[color:var(--blk-accent-ink)]">
                      <File className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">{a.name}</span>
                      <span className="block font-mono text-[11px] text-[color:var(--bjork-text-soft)]">{a.size}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ReplyBox
        key={thread.id}
        to={thread.messages.filter((m) => m.from.email !== me.email).at(-1)?.from ?? thread.messages[0].from}
        replyRef={replyRef}
        onSend={(body) => {
          onSend(body);
          window.requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
        }}
      />
    </section>
  );
}

function MessageStack({ thread, fmt }: { thread: InboxThread; fmt: { short: (iso: string) => string; full: (iso: string) => string } }) {
  // The newest message is open; older ones fold to one line and open on click.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([thread.messages[thread.messages.length - 1]?.id]));
  const lastId = thread.messages[thread.messages.length - 1]?.id;
  return (
    <ol className="mt-5 flex flex-col gap-2.5">
      {thread.messages.map((m) => {
        const isOpen = expanded.has(m.id) || m.id === lastId;
        return (
          <li
            key={m.id}
            className={cn(
              "overflow-hidden rounded-[14px] border border-[color:var(--bjork-border)] bg-[var(--bjork-surface)]",
              isOpen && "shadow-[var(--bjork-shadow-surface)]",
            )}
          >
            <button
              type="button"
              aria-expanded={isOpen}
              disabled={m.id === lastId}
              onClick={() =>
                setExpanded((s) => {
                  const next = new Set(s);
                  if (next.has(m.id)) next.delete(m.id);
                  else next.add(m.id);
                  return next;
                })
              }
              className={cn("flex w-full items-center gap-3 px-4 py-3 text-left disabled:cursor-default", focusRing, "focus-visible:ring-inset focus-visible:ring-offset-0")}
            >
              <InitialsAvatar name={m.from.name} size={30} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-[13.5px] font-semibold">{m.from.name}</span>
                  {isOpen && <span className="hidden truncate text-[12px] text-[color:var(--bjork-text-soft)] @md/reader:inline">{m.from.email}</span>}
                </span>
                {!isOpen && <span className="block truncate text-[12.5px] text-[color:var(--bjork-text-muted)]">{snippet(m.body)}</span>}
              </span>
              <time dateTime={m.date} className="shrink-0 text-[11.5px] tabular-nums text-[color:var(--bjork-text-soft)]">
                {isOpen ? fmt.full(m.date) : fmt.short(m.date)}
              </time>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 pl-[58px] text-[13.5px] leading-[1.65] text-[color:var(--bjork-text-strong)]">
                {m.body.split(/\n{2,}/).map((para, i) => (
                  <p key={i} className={cn(i > 0 && "mt-3", "whitespace-pre-line")}>
                    {para}
                  </p>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ReplyBox({
  to,
  replyRef,
  onSend,
}: {
  to: InboxPerson;
  replyRef: RefObject<HTMLTextAreaElement | null>;
  onSend: (body: string) => void;
}) {
  const [body, setBody] = useState("");
  const [focused, setFocused] = useState(false);
  const id = useId();
  const send = () => {
    const text = body.trim();
    if (!text) return;
    onSend(text);
    setBody("");
  };
  const expanded = focused || body.length > 0;
  return (
    <div className="shrink-0 border-t border-[color:var(--bjork-border)] bg-[var(--bjork-bg)] p-3 @2xl:px-5">
      <div
        className={cn(
          "mx-auto max-w-[760px] rounded-[14px] border bg-[var(--bjork-field)] shadow-[var(--bjork-shadow-soft)] transition-[border-color,box-shadow] duration-150",
          focused ? "border-[color:var(--bjork-accent)] ring-[3px] ring-[color:var(--bjork-accent-soft)]" : "border-[color:var(--bjork-border)]",
        )}
      >
        <label htmlFor={id} className="flex items-center gap-1.5 px-3.5 pt-2.5 text-[12px] text-[color:var(--bjork-text-muted)]">
          <Reply aria-hidden="true" className="size-3.5" />
          Reply to <span className="font-medium text-[color:var(--bjork-text-medium)]">{to.name}</span>
        </label>
        <textarea
          ref={replyRef}
          id={id}
          value={body}
          rows={expanded ? 4 : 1}
          onChange={(e) => setBody(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            } else if (e.key === "Escape") {
              e.stopPropagation();
              e.currentTarget.blur();
            }
          }}
          placeholder="Write a reply…"
          className="block w-full resize-none bg-transparent px-3.5 py-2 text-[13.5px] leading-[1.55] text-[color:var(--bjork-text)] outline-none placeholder:text-[color:var(--bjork-text-soft)]"
        />
        <div className={cn("flex items-center justify-between gap-2 px-2.5 pb-2.5", !expanded && "hidden")}>
          <span className="flex items-center gap-1 pl-1 text-[11.5px] text-[color:var(--bjork-text-soft)]">
            <Kbd>⌘</Kbd>
            <Kbd>↵</Kbd>
            <span className="ml-0.5">to send</span>
          </span>
          <BlockButton
            variant="primary"
            size="sm"
            disabled={!body.trim()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={send}
          >
            <Send aria-hidden="true" />
            Send
          </BlockButton>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------------------
 * Undo bar and dialogs
 * -------------------------------------------------------------------------------------------------------- */

function UndoBar({
  undo,
  onUndo,
  onDismiss,
}: {
  undo: { message: string } | null;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div
        inert={!undo}
        aria-hidden={!undo}
        className={cn(
          "flex max-w-full items-center gap-2 rounded-[12px] border border-[color:var(--bjork-border-strong)] bg-[var(--bjork-menu)] py-1.5 pl-3.5 pr-1.5 text-[12.5px] font-medium shadow-[var(--bjork-shadow-menu)] backdrop-blur-xl transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-opacity",
          undo ? "pointer-events-auto translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
      >
        <span className="truncate">{undo?.message}</span>
        <BlockButton size="sm" variant="ghost" onClick={onUndo} className="text-[color:var(--blk-accent-ink)]">
          Undo
          <Kbd>Z</Kbd>
        </BlockButton>
        <IconButton label="Dismiss" size="sm" onClick={onDismiss}>
          <X />
        </IconButton>
      </div>
    </div>
  );
}

function ComposeDialog({
  open,
  onClose,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  onSend: (draft: { to: string; subject: string; body: string }) => void;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bodyId = useId();
  const reset = () => {
    setTo("");
    setSubject("");
    setBody("");
    setError(null);
  };
  const submit = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to.trim())) {
      setError("Add a valid email address.");
      return;
    }
    onSend({ to: to.trim(), subject: subject.trim(), body: body.trim() });
    reset();
  };
  return (
    <BlockDialog
      open={open}
      onClose={() => {
        onClose();
      }}
      title="New message"
      className="max-w-[520px]"
      footer={
        <>
          <span className="mr-auto hidden items-center gap-1 text-[11.5px] text-[color:var(--bjork-text-soft)] @md:flex">
            <Kbd>⌘</Kbd>
            <Kbd>↵</Kbd>
          </span>
          <BlockButton
            size="sm"
            variant="ghost"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Discard
          </BlockButton>
          <BlockButton size="sm" variant="primary" onClick={submit}>
            <Send aria-hidden="true" />
            Send
          </BlockButton>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
      >
        <BlockField
          data-autofocus
          label="To"
          type="email"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setError(null);
          }}
          error={error}
          placeholder="name@company.com"
        />
        <BlockField label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={bodyId} className="text-[12.5px] font-medium text-[color:var(--bjork-text-medium)]">
            Message
          </label>
          <textarea id={bodyId} rows={6} value={body} onChange={(e) => setBody(e.target.value)} className={cn(inputClass, "h-auto resize-none py-2.5 leading-[1.55]")} />
        </div>
        <button type="submit" className="hidden" tabIndex={-1} aria-hidden="true" />
      </form>
    </BlockDialog>
  );
}

const SHORTCUTS: [string[], string][] = [
  [["J"], "Older conversation"],
  [["K"], "Newer conversation"],
  [["↑", "↓"], "Move through the list"],
  [["E"], "Archive"],
  [["#"], "Move to trash"],
  [["S"], "Star"],
  [["U"], "Mark as unread"],
  [["X"], "Select"],
  [["R"], "Reply"],
  [["C"], "Compose"],
  [["Z"], "Undo"],
  [["/"], "Search"],
  [["Esc"], "Clear selection or go back"],
];

function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BlockDialog
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      description="They work anywhere in the inbox except while you're typing."
      footer={
        <BlockButton size="sm" variant="secondary" onClick={onClose} data-autofocus>
          Done
        </BlockButton>
      }
    >
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-[13px]">
        {SHORTCUTS.map(([keys, what]) => (
          <div key={what} className="contents">
            <dt className="flex gap-1">
              {keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </dt>
            <dd className="text-[color:var(--bjork-text-medium)]">{what}</dd>
          </div>
        ))}
      </dl>
    </BlockDialog>
  );
}
