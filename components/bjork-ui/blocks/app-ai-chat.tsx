"use client";

import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  FileText,
  Menu,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Pencil,
  RotateCcw,
  Search,
  Square,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";
import {
  BlockButton,
  BlockDrawer,
  IconButton,
  InitialsAvatar,
  Kbd,
  blockRoot,
  focusRing,
  useAnnouncer,
  useAppBlockTheme,
  useBlockReducedMotion,
  useElementWidth,
  type AppBlockTheme,
} from "@/components/bjork-ui/blocks/app-block-kit";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------------------------------------- */

export interface ChatAttachment {
  name: string;
  size: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  /** Markdown-lite: paragraphs, `- ` lists, `1. ` lists, **bold**, `code` and ``` fenced blocks. */
  content: string;
  attachments?: ChatAttachment[];
  /** Set when a reply was stopped part-way. */
  stopped?: boolean;
  feedback?: "up" | "down";
}

export interface ChatConversation {
  id: string;
  title: string;
  /** ISO date, for grouping in the sidebar. */
  updated: string;
  messages: ChatMessage[];
}

export interface ChatModel {
  id: string;
  name: string;
  hint: string;
}

export interface ChatRequest {
  conversationId: string;
  model: string;
  messages: ChatMessage[];
  signal: AbortSignal;
}

export interface AppAiChatProps {
  conversations?: ChatConversation[];
  models?: ChatModel[];
  defaultModel?: string;
  /** Conversation open on first render. Defaults to the most recent; pass null for a new chat. */
  defaultConversationId?: string | null;
  /**
   * Streams the assistant reply. Yield text chunks; stop when `signal` aborts. Defaults to a local
   * simulator so the block works without a backend.
   */
  respond?: (request: ChatRequest) => AsyncIterable<string>;
  onConversationsChange?: (conversations: ChatConversation[]) => void;
  onFeedback?: (messageId: string, feedback: "up" | "down" | undefined) => void;
  user?: { name: string };
  assistantName?: string;
  suggestions?: { title: string; prompt: string }[];
  /** "Now" for the Today / Previous 7 days grouping. Defaults to the newest conversation. */
  now?: string;
  theme?: AppBlockTheme;
  className?: string;
}

/* ----------------------------------------------------------------------------------------------------------
 * Sample data and the offline responder
 * -------------------------------------------------------------------------------------------------------- */

const SAMPLE_MODELS: ChatModel[] = [
  { id: "swift", name: "Swift", hint: "Fast answers for everyday questions" },
  { id: "deep", name: "Deep", hint: "Slower, thinks through multi-step problems" },
  { id: "code", name: "Code", hint: "Tuned for reading and writing code" },
];

const SAMPLE_SUGGESTIONS = [
  { title: "Explain a concept", prompt: "Explain how a debounce differs from a throttle, with a small example." },
  { title: "Draft a message", prompt: "Draft a short note to my team moving Thursday's review to 2pm." },
  { title: "Review some code", prompt: "What could go wrong with this?\n\nuseEffect(() => { setCount(count + 1) }, [count])" },
  { title: "Plan something", prompt: "Plan a three-step rollout for a new dashboard to 40 users." },
];

const SAMPLE_CONVERSATIONS: ChatConversation[] = [
  {
    id: "c1",
    title: "Debounce vs throttle for search",
    updated: "2026-10-08T15:20:00Z",
    messages: [
      { id: "c1m1", role: "user", content: "Should the dashboard search input be debounced or throttled?" },
      {
        id: "c1m2",
        role: "assistant",
        content:
          "**Debounce it.** You want one query after the person stops typing, not a query every N milliseconds while they type.\n\n- **Debounce** waits for a pause, then fires once. Right for search, autosave and resize-driven layout.\n- **Throttle** fires at most once per interval while events keep coming. Right for scroll position and pointer tracking.\n\nA small version:\n\n```ts\nfunction debounce<T extends unknown[]>(fn: (...args: T) => void, ms = 200) {\n  let timer: ReturnType<typeof setTimeout> | undefined;\n  return (...args: T) => {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn(...args), ms);\n  };\n}\n```\n\nFor a filter over data already in memory, skip both and filter on every keystroke; it's fast enough and feels more direct.",
        feedback: "up",
      },
    ],
  },
  {
    id: "c2",
    title: "Rollout plan for the Northwind pilot",
    updated: "2026-10-07T18:02:00Z",
    messages: [
      { id: "c2m1", role: "user", content: "Help me plan the Northwind pilot. 40 seats, two warehouses, starts Nov 3." },
      {
        id: "c2m2",
        role: "assistant",
        content:
          "Here's a three-phase plan that keeps risk low:\n\n1. **Week 1, one warehouse, 8 people.** Shadow two shifts, fix the top three papercuts.\n2. **Week 2, the rest of that warehouse.** Turn on scheduled CSV exports and per-store permissions.\n3. **Week 3, second warehouse.** Run a 20-minute training and keep a feedback channel open.\n\nDecide upfront what “success” means, for example 80% weekly active seats by the end of week 4.",
      },
    ],
  },
  { id: "c3", title: "Offer note for Kai", updated: "2026-10-06T10:00:00Z", messages: [{ id: "c3m1", role: "user", content: "Help me write two sentences for an offer note." }, { id: "c3m2", role: "assistant", content: "Kai's systems interview stood out for how calmly they reasoned about failure: every design came with a plan for the slow, partial and wrong cases. We think that instinct will make our dashboard sturdier from week one." }] },
  { id: "c4", title: "Colour contrast for chart lines", updated: "2026-10-02T09:00:00Z", messages: [{ id: "c4m1", role: "user", content: "Is 30% ink enough contrast for a comparison line?" }, { id: "c4m2", role: "assistant", content: "For a secondary series, yes, as long as it's not the only way to tell the series apart. Pair it with a dash pattern and a legend, and keep the primary line at full strength." }] },
  { id: "c5", title: "SQL for weekly active seats", updated: "2026-09-24T14:00:00Z", messages: [{ id: "c5m1", role: "user", content: "SQL for weekly active seats?" }, { id: "c5m2", role: "assistant", content: "```sql\nselect date_trunc('week', seen_at) as week,\n       count(distinct user_id) as active_seats\nfrom events\ngroup by 1\norder by 1;\n```" }] },
];

const delay = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });

/** Picks a canned answer for the prompt and streams it word by word. */
async function* simulateResponse({ messages, model, signal }: ChatRequest): AsyncIterable<string> {
  const prompt = messages[messages.length - 1]?.content.toLowerCase() ?? "";
  let answer: string;
  if (prompt.includes("debounce") || prompt.includes("throttle")) {
    answer =
      "A **debounce** waits until events stop for a set time, then runs once. A **throttle** runs at most once per interval while events keep arriving.\n\n- Typing in a search box: debounce, so you query once after the pause.\n- Tracking scroll position: throttle, so you update steadily without flooding.\n\n```ts\nconst onSearch = debounce((q: string) => fetchResults(q), 250);\n```\n\nRule of thumb: if only the final value matters, debounce. If the in-between values matter, throttle.";
  } else if (prompt.includes("draft") || prompt.includes("note") || prompt.includes("message")) {
    answer =
      "Here's a short version you can paste:\n\n> Hi all, I'm moving Thursday's design review to **2pm** so Theo can join from Lisbon. Same room, same doc. Agenda stays the same: chart legend, empty states, and the orders table on phones.\n\nWant it warmer, or shorter for Slack?";
  } else if (prompt.includes("useeffect") || prompt.includes("code") || prompt.includes("wrong")) {
    answer =
      "That effect runs **forever**. It sets `count`, which changes `count`, which is in the dependency list, so the effect runs again.\n\nIf you meant to bump it once on mount:\n\n```tsx\nuseEffect(() => {\n  setCount((c) => c + 1);\n}, []);\n```\n\nIf you meant to derive something from `count`, compute it during render instead of storing it in state.";
  } else if (prompt.includes("plan") || prompt.includes("rollout")) {
    answer =
      "A three-step rollout:\n\n1. **Pilot with 5 people** for a week. Watch them use it; fix the top three papercuts.\n2. **Expand to half** (about 20). Turn on feedback in the app and review it twice a week.\n3. **Everyone.** Send a two-minute walkthrough video and keep office hours open for the first week.\n\nSet the success metric before step one, for example *weekly active seats above 80%*.";
  } else {
    answer = `Good question. Here's how I'd think about it:\n\n- Start from what you need to decide, then work back to the information that would change the decision.\n- Prefer the smallest experiment that gives you a real answer.\n- Write the result down where the team will see it.\n\nTell me more about the context and I can get specific. (Answered by the **${model}** model, simulated locally.)`;
  }
  await delay(model === "deep" ? 900 : 380, signal);
  const tokens = answer.match(/\s*\S+/g) ?? [answer];
  for (const token of tokens) {
    if (signal.aborted) return;
    yield token;
    await delay(model === "swift" ? 14 : 26, signal);
  }
}

/* ----------------------------------------------------------------------------------------------------------
 * Markdown-lite rendering
 * -------------------------------------------------------------------------------------------------------- */

type MdBlock =
  | { kind: "p"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "code"; lang: string; code: string; open: boolean };

function parseBlocks(src: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const lines = src.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      const open = i >= lines.length;
      blocks.push({ kind: "code", lang: fence[1] || "text", code: body.join("\n"), open });
      i += 1;
      continue;
    }
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const listKind = /^\s*[-*] /.test(line) ? "ul" : /^\s*\d+\. /.test(line) ? "ol" : null;
    if (listKind) {
      const items: string[] = [];
      const re = listKind === "ul" ? /^\s*[-*] (.*)$/ : /^\s*\d+\. (.*)$/;
      while (i < lines.length && re.test(lines[i])) items.push(lines[i++].replace(re, "$1"));
      blocks.push({ kind: listKind, items });
      continue;
    }
    if (line.startsWith("> ")) {
      const body: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) body.push(lines[i++].slice(2));
      blocks.push({ kind: "quote", text: body.join(" ") });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^```/.test(lines[i]) && !/^\s*([-*]|\d+\.) /.test(lines[i]) && !lines[i].startsWith("> ")) {
      para.push(lines[i++]);
    }
    blocks.push({ kind: "p", text: para.join(" ") });
  }
  return blocks;
}

function Inline({ text: raw }: { text: string }) {
  // Close a bold run that is still streaming, so a half-sent "**word" never shows raw asterisks.
  const text = (raw.split("**").length - 1) % 2 === 1 ? `${raw}**` : raw;
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return (
            <strong key={i} className="font-semibold text-[color:var(--bjork-text)]">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return (
            <code key={i} className="rounded-[5px] border border-[color:var(--bjork-border)] bg-[var(--bjork-field-inset)] px-1 py-px font-mono text-[0.88em]">
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <div className="my-3 overflow-hidden rounded-[12px] border border-[color:var(--bjork-border)] bg-[var(--bjork-field-inset)]">
      <div className="flex h-8 items-center justify-between border-b border-[color:var(--bjork-border)] pl-3 pr-1">
        <span className="font-mono text-[11px] text-[color:var(--bjork-text-soft)]">{lang}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(code);
            setCopied(true);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => setCopied(false), 1600);
          }}
          className={cn(
            "inline-flex h-6 items-center gap-1 rounded-[6px] px-1.5 text-[11.5px] text-[color:var(--bjork-text-muted)] transition-colors hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)]",
            focusRing,
          )}
        >
          {copied ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
          <span className="sr-only"> code</span>
        </button>
      </div>
      <pre className="overflow-x-auto px-3.5 py-3 font-mono text-[12.5px] leading-[1.6] text-[color:var(--bjork-text-strong)]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Markdown({ content }: { content: string }) {
  const blocks = useMemo(() => parseBlocks(content), [content]);
  return (
    <div className="text-[14px] leading-[1.7] text-[color:var(--bjork-text-strong)]">
      {blocks.map((b, i) => {
        const gap = i > 0 ? "mt-3" : "";
        if (b.kind === "code") return <CodeBlock key={i} lang={b.lang} code={b.code} />;
        if (b.kind === "quote") {
          return (
            <blockquote key={i} className={cn(gap, "border-l-2 border-[color:var(--bjork-accent)] pl-3.5 text-[color:var(--bjork-text-medium)]")}>
              <Inline text={b.text} />
            </blockquote>
          );
        }
        if (b.kind !== "p") {
          const List = b.kind;
          return (
            <List key={i} className={cn(gap, "flex flex-col gap-1.5 pl-5", b.kind === "ul" ? "list-disc marker:text-[color:var(--bjork-text-soft)]" : "list-decimal marker:font-mono marker:text-[12px] marker:text-[color:var(--bjork-text-soft)]")}>
              {b.items.map((item, j) => (
                <li key={j} className="pl-1">
                  <Inline text={item} />
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={i} className={gap}>
            <Inline text={b.text} />
          </p>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------------------
 * Helpers
 * -------------------------------------------------------------------------------------------------------- */

const DAY = 86_400_000;

function groupConversations(list: ChatConversation[], now: number) {
  const groups: { label: string; items: ChatConversation[] }[] = [
    { label: "Today", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Older", items: [] },
  ];
  const startOfToday = Math.floor(now / DAY) * DAY;
  for (const c of [...list].sort((a, b) => b.updated.localeCompare(a.updated))) {
    const t = new Date(c.updated).getTime();
    groups[t >= startOfToday ? 0 : t >= startOfToday - 7 * DAY ? 1 : 2].items.push(c);
  }
  return groups.filter((g) => g.items.length > 0);
}

let idCounter = 0;
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(idCounter += 1)}`;

function titleFrom(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 42 ? `${clean.slice(0, 40).trimEnd()}…` : clean || "New chat";
}

const DRAWER_BELOW = 760;

/* ----------------------------------------------------------------------------------------------------------
 * Block
 * -------------------------------------------------------------------------------------------------------- */

export function AppAiChat({
  conversations: initial = SAMPLE_CONVERSATIONS,
  models = SAMPLE_MODELS,
  defaultModel,
  defaultConversationId,
  respond = simulateResponse,
  onConversationsChange,
  onFeedback,
  user = { name: "Rhea Castillo" },
  assistantName = "Assistant",
  suggestions = SAMPLE_SUGGESTIONS,
  now,
  theme = "auto",
  className,
}: AppAiChatProps) {
  const { style } = useAppBlockTheme(theme);
  const reduce = useBlockReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(rootRef);
  const narrow = width > 0 && width < DRAWER_BELOW;
  const { announce, region } = useAnnouncer();

  const [conversations, setConversations] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(() =>
    defaultConversationId === undefined
      ? ([...initial].sort((a, b) => b.updated.localeCompare(a.updated))[0]?.id ?? null)
      : defaultConversationId,
  );
  const [model, setModel] = useState(defaultModel ?? models[0]?.id ?? "default");
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Latest list, for code that runs after an await and must not read a stale closure.
  const latest = useRef(initial);
  useEffect(() => {
    latest.current = conversations;
  }, [conversations]);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const nowMs = useMemo(
    () => (now ? new Date(now).getTime() : Math.max(0, ...initial.map((c) => new Date(c.updated).getTime()))),
    [now, initial],
  );
  const active = conversations.find((c) => c.id === activeId) ?? null;
  const streaming = streamingId !== null;

  const commit = (next: ChatConversation[]) => {
    setConversations(next);
    onConversationsChange?.(next);
  };

  useEffect(() => () => abortRef.current?.abort(), []);

  /** Streams a reply into `conversationId`, given the history it should answer. */
  const stream = async (conversationId: string, history: ChatMessage[], base: ChatConversation[]) => {
    const controller = new AbortController();
    abortRef.current = controller;
    const replyId = newId("a");
    const reply: ChatMessage = { id: replyId, role: "assistant", content: "" };
    const working = base.map((c) =>
      c.id === conversationId ? { ...c, messages: [...history, reply], updated: new Date(Math.max(Date.now(), nowMs)).toISOString() } : c,
    );
    latest.current = working;
    setConversations(working);
    setStreamingId(replyId);
    setError(null);
    let text = "";
    let frame = 0;
    const flush = () => {
      frame = 0;
      setConversations((list) =>
        list.map((c) =>
          c.id === conversationId ? { ...c, messages: c.messages.map((m) => (m.id === replyId ? { ...m, content: text } : m)) } : c,
        ),
      );
    };
    try {
      for await (const chunk of respond({ conversationId, model, messages: history, signal: controller.signal })) {
        if (controller.signal.aborted) break;
        text += chunk;
        // Batch chunks into one render per frame.
        if (!frame) frame = window.requestAnimationFrame(flush);
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "The reply failed. Try again.");
    } finally {
      if (frame) window.cancelAnimationFrame(frame);
      const stopped = controller.signal.aborted;
      const next = latest.current.map((c) =>
        c.id === conversationId
          ? { ...c, messages: c.messages.map((m) => (m.id === replyId ? { ...m, content: text, stopped: stopped || undefined } : m)) }
          : c,
      );
      latest.current = next;
      commit(next);
      setStreamingId(null);
      if (abortRef.current === controller) abortRef.current = null;
      announce(stopped ? "Response stopped" : `${assistantName} replied`);
    }
  };

  const send = (text: string) => {
    const content = text.trim();
    if (!content || streaming) return;
    const message: ChatMessage = { id: newId("u"), role: "user", content, attachments: attachments.length ? attachments : undefined };
    let id = active?.id;
    let base = conversations;
    if (!id) {
      id = newId("c");
      base = [{ id, title: titleFrom(content), updated: new Date(Math.max(Date.now(), nowMs)).toISOString(), messages: [] }, ...conversations];
      setActiveId(id);
    }
    const history = [...(base.find((c) => c.id === id)?.messages ?? []), message];
    setDraft("");
    setAttachments([]);
    void stream(id, history, base);
  };

  const stop = () => abortRef.current?.abort();

  const regenerate = () => {
    if (!active || streaming) return;
    const lastUser = active.messages.map((m) => m.role).lastIndexOf("user");
    if (lastUser < 0) return;
    void stream(active.id, active.messages.slice(0, lastUser + 1), conversations);
  };

  const editLast = () => {
    if (!active || streaming) return;
    const lastUser = active.messages.map((m) => m.role).lastIndexOf("user");
    if (lastUser < 0) return;
    setDraft(active.messages[lastUser].content);
    commit(conversations.map((c) => (c.id === active.id ? { ...c, messages: c.messages.slice(0, lastUser) } : c)));
    window.requestAnimationFrame(() => {
      const el = composerRef.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    });
  };

  const newChat = () => {
    if (streaming) stop();
    setActiveId(null);
    setDrawerOpen(false);
    setDraft("");
    setError(null);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  };

  const selectConversation = (id: string) => {
    if (streaming) stop();
    setActiveId(id);
    setDrawerOpen(false);
    setError(null);
  };

  const deleteConversation = (id: string) => {
    const target = conversations.find((c) => c.id === id);
    if (id === activeId) {
      if (streaming) stop();
      setActiveId(null);
    }
    commit(conversations.filter((c) => c.id !== id));
    announce(`Deleted “${target?.title ?? "conversation"}”`);
  };

  const setFeedback = (messageId: string, value: "up" | "down") => {
    if (!active) return;
    const current = active.messages.find((m) => m.id === messageId)?.feedback;
    const next = current === value ? undefined : value;
    commit(
      conversations.map((c) =>
        c.id === active.id ? { ...c, messages: c.messages.map((m) => (m.id === messageId ? { ...m, feedback: next } : m)) } : c,
      ),
    );
    onFeedback?.(messageId, next);
    announce(next ? "Thanks for the feedback" : "Feedback removed");
  };

  const onRootKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.shiftKey && event.key.toLowerCase() === "o") {
      event.preventDefault();
      newChat();
    } else if (event.key === "Escape" && streaming) {
      event.preventDefault();
      stop();
    }
  };

  const sidebar = (mode: "rail" | "drawer") => (
    <ChatSidebar
      mode={mode}
      collapsed={mode === "rail" && collapsed}
      conversations={conversations}
      activeId={activeId}
      now={nowMs}
      onSelect={selectConversation}
      onNew={newChat}
      onDelete={deleteConversation}
      onToggleCollapsed={() => setCollapsed((v) => !v)}
      onClose={() => setDrawerOpen(false)}
      user={user}
    />
  );

  return (
    <div ref={rootRef} className={cn(blockRoot, "h-full", className)} style={style} onKeyDown={onRootKeyDown}>
      {!narrow && (
        <aside
          aria-label="Chat history"
          className={cn(
            "relative z-20 flex h-full shrink-0 flex-col border-r border-[color:var(--bjork-border)] bg-[var(--bjork-panel)] transition-[width] duration-[260ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
            collapsed ? "w-[60px]" : "w-[264px]",
          )}
        >
          {sidebar("rail")}
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col" inert={narrow && drawerOpen}>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[color:var(--bjork-border)] px-3 @3xl:px-4">
          {narrow && (
            <IconButton label="Open chat history" onClick={() => setDrawerOpen(true)} aria-expanded={drawerOpen}>
              <Menu />
            </IconButton>
          )}
          <ModelPicker models={models} value={model} onChange={setModel} disabled={streaming} />
          <h1 className="sr-only">{active ? active.title : "New chat"}</h1>
          <p aria-hidden="true" className="hidden min-w-0 flex-1 truncate text-center text-[13px] text-[color:var(--bjork-text-muted)] @2xl:block">
            {active?.title}
          </p>
          <div className="ml-auto flex items-center gap-1 @2xl:ml-0">
            {narrow && (
              <IconButton label="New chat" onClick={newChat}>
                <MessageSquarePlus />
              </IconButton>
            )}
          </div>
        </header>

        <Thread
          key={active?.id ?? "new"}
          conversation={active}
          streamingId={streamingId}
          reduce={reduce}
          user={user}
          assistantName={assistantName}
          suggestions={suggestions}
          error={error}
          onSuggestion={(prompt) => send(prompt)}
          onRetry={regenerate}
          onRegenerate={regenerate}
          onEditLast={editLast}
          onFeedback={setFeedback}
          onCopied={() => announce("Copied to clipboard")}
        />

        <Composer
          inputRef={composerRef}
          value={draft}
          onChange={setDraft}
          attachments={attachments}
          onAttach={(files) => setAttachments((a) => [...a, ...files])}
          onRemoveAttachment={(name) => setAttachments((a) => a.filter((x) => x.name !== name))}
          streaming={streaming}
          onSend={() => send(draft)}
          onStop={stop}
          canEditLast={Boolean(active?.messages.some((m) => m.role === "user"))}
          onEditLast={editLast}
          assistantName={assistantName}
        />
      </div>

      {narrow && (
        <BlockDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} label="Chat history">
          {sidebar("drawer")}
        </BlockDrawer>
      )}
      {region}
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------------------
 * Sidebar
 * -------------------------------------------------------------------------------------------------------- */

function ChatSidebar({
  mode,
  collapsed,
  conversations,
  activeId,
  now,
  onSelect,
  onNew,
  onDelete,
  onToggleCollapsed,
  onClose,
  user,
}: {
  mode: "rail" | "drawer";
  collapsed: boolean;
  conversations: ChatConversation[];
  activeId: string | null;
  now: number;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onToggleCollapsed: () => void;
  onClose: () => void;
  user: { name: string };
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) => c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q)),
    );
  }, [conversations, query]);
  const groups = groupConversations(filtered, now);

  return (
    <>
      <div className={cn("flex h-14 shrink-0 items-center gap-1.5 border-b border-[color:var(--bjork-border)]", collapsed ? "justify-center px-2" : "px-3")}>
        {collapsed ? (
          <IconButton label="New chat" onClick={onNew}>
            <MessageSquarePlus />
          </IconButton>
        ) : (
          <>
            <BlockButton variant="secondary" size="md" className="flex-1 justify-start" onClick={onNew}>
              <MessageSquarePlus aria-hidden="true" />
              New chat
              <span className="ml-auto flex gap-0.5">
                <Kbd>⌘</Kbd>
                <Kbd>⇧</Kbd>
                <Kbd>O</Kbd>
              </span>
            </BlockButton>
            {mode === "drawer" && (
              <IconButton label="Close chat history" size="sm" onClick={onClose}>
                <X />
              </IconButton>
            )}
          </>
        )}
      </div>

      {!collapsed && (
        <div className="px-3 pt-3">
          <label className="relative flex items-center">
            <span className="sr-only">Search chats</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 size-[14px] text-[color:var(--bjork-text-soft)]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && query) {
                  e.stopPropagation();
                  setQuery("");
                }
              }}
              placeholder="Search chats"
              className="h-8 w-full rounded-[9px] border border-[color:var(--bjork-border)] bg-[var(--bjork-field)] pl-8 pr-2 text-[12.5px] text-[color:var(--bjork-text)] outline-none transition-[border-color,box-shadow] placeholder:text-[color:var(--bjork-text-soft)] focus-visible:border-[color:var(--bjork-accent)] focus-visible:ring-[3px] focus-visible:ring-[color:var(--bjork-accent-soft)] [&::-webkit-search-cancel-button]:hidden"
            />
          </label>
        </div>
      )}

      <nav aria-label="Conversations" className={cn("hide-scrollbar flex-1 overflow-y-auto py-3", collapsed ? "hidden" : "px-2")}>
        {groups.length === 0 && (
          <p className="px-3 py-6 text-center text-[12.5px] text-[color:var(--bjork-text-muted)]">
            {query ? `No chats match “${query}”.` : "No chats yet."}
          </p>
        )}
        {groups.map((g, gi) => (
          <div key={g.label} className={cn(gi > 0 && "mt-4")}>
            <h2 className="mb-1 px-2.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-[color:var(--bjork-text-soft)]">{g.label}</h2>
            <ul className="flex flex-col gap-px">
              {g.items.map((c) => {
                const isActive = c.id === activeId;
                return (
                  <li key={c.id} className="group relative">
                    <a
                      href={`#${c.id}`}
                      aria-current={isActive ? "page" : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        onSelect(c.id);
                      }}
                      className={cn(
                        "flex h-8 items-center rounded-[8px] pl-2.5 pr-8 text-[13px] transition-colors duration-150",
                        isActive
                          ? "bg-[var(--bjork-surface)] font-medium text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-soft),0_0_0_1px_var(--bjork-border)]"
                          : "text-[color:var(--bjork-text-medium)] hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)]",
                        focusRing,
                      )}
                    >
                      <span className="truncate">{c.title}</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => onDelete(c.id)}
                      aria-label={`Delete “${c.title}”`}
                      title="Delete chat"
                      className={cn(
                        "absolute right-1 top-1 grid size-6 place-items-center rounded-[6px] text-[color:var(--bjork-text-soft)] opacity-0 transition-[opacity,color] hover:text-[color:var(--blk-error)] focus-visible:opacity-100 group-hover:opacity-100",
                        isActive && "opacity-100",
                        focusRing,
                      )}
                    >
                      <Trash2 aria-hidden="true" className="size-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      {collapsed && <div className="flex-1" />}

      <div className={cn("flex shrink-0 items-center gap-1 border-t border-[color:var(--bjork-border)] p-2.5", collapsed && "flex-col px-2")}>
        <span className={cn("flex min-w-0 items-center gap-2.5 p-1", !collapsed && "flex-1")} title={collapsed ? user.name : undefined}>
          <InitialsAvatar name={user.name} size={28} />
          {!collapsed && <span className="truncate text-[12.5px] font-medium">{user.name}</span>}
          {collapsed && <span className="sr-only">{user.name}</span>}
        </span>
        {mode === "rail" && (
          <IconButton label={collapsed ? "Expand sidebar" : "Collapse sidebar"} size="sm" onClick={onToggleCollapsed} aria-expanded={!collapsed}>
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </IconButton>
        )}
      </div>
    </>
  );
}

/* ----------------------------------------------------------------------------------------------------------
 * Model picker: a menu button with a radio list.
 * -------------------------------------------------------------------------------------------------------- */

function ModelPicker({
  models,
  value,
  onChange,
  disabled,
}: {
  models: ChatModel[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const current = models.find((m) => m.id === value) ?? models[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    const index = Math.max(0, models.findIndex((m) => m.id === value));
    itemRefs.current[index]?.focus();
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, models, value]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const onMenuKey = (event: ReactKeyboardEvent, i: number) => {
    let next = -1;
    if (event.key === "ArrowDown") next = (i + 1) % models.length;
    else if (event.key === "ArrowUp") next = (i - 1 + models.length) % models.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = models.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    } else if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (next < 0) return;
    event.preventDefault();
    itemRefs.current[next]?.focus();
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-[9px] px-2.5 text-[14px] font-semibold tracking-[-0.01em] transition-colors hover:bg-[var(--bjork-surface-hover)] disabled:opacity-60",
          focusRing,
        )}
      >
        <span className="sr-only">Model: </span>
        {current?.name}
        <ChevronDown aria-hidden="true" className={cn("size-3.5 text-[color:var(--bjork-text-muted)] transition-transform duration-150", open && "rotate-180")} />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Model"
          className="absolute left-0 top-[calc(100%+6px)] z-40 w-[260px] rounded-[14px] border border-[color:var(--bjork-border)] bg-[var(--bjork-menu)] p-1.5 shadow-[var(--bjork-shadow-menu)] backdrop-blur-xl"
        >
          {models.map((m, i) => {
            const checked = m.id === value;
            return (
              <button
                key={m.id}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                tabIndex={-1}
                onKeyDown={(e) => onMenuKey(e, i)}
                onClick={() => {
                  onChange(m.id);
                  close();
                }}
                className="flex w-full items-start gap-2.5 rounded-[9px] px-2.5 py-2 text-left outline-none transition-colors hover:bg-[var(--bjork-surface-hover)] focus-visible:bg-[var(--bjork-surface-active)]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium">{m.name}</span>
                  <span className="block text-[12px] leading-[1.4] text-[color:var(--bjork-text-muted)]">{m.hint}</span>
                </span>
                <Check aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0 text-[color:var(--blk-accent-ink)]", !checked && "invisible")} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------------------
 * Thread
 * -------------------------------------------------------------------------------------------------------- */

function Thread({
  conversation,
  streamingId,
  reduce,
  user,
  assistantName,
  suggestions,
  error,
  onSuggestion,
  onRetry,
  onRegenerate,
  onEditLast,
  onFeedback,
  onCopied,
}: {
  conversation: ChatConversation | null;
  streamingId: string | null;
  reduce: boolean;
  user: { name: string };
  assistantName: string;
  suggestions: { title: string; prompt: string }[];
  error: string | null;
  onSuggestion: (prompt: string) => void;
  onRetry: () => void;
  onRegenerate: () => void;
  onEditLast: () => void;
  onFeedback: (id: string, value: "up" | "down") => void;
  onCopied: () => void;
}) {
  const scrollRef = useRef<HTMLElement>(null);
  const pinned = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const messages = conversation?.messages ?? [];
  const lastContent = messages[messages.length - 1]?.content;

  // Follow the stream while the reader is at the bottom; stop following once they scroll up.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinned.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, lastContent, streamingId]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    pinned.current = near;
    setAtBottom(near);
  };

  const jump = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinned.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  };

  if (!conversation || messages.length === 0) {
    return (
      <div className="@container/thread flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8">
        <div className="w-full max-w-[640px]">
          <AssistantMark className="mx-auto size-11" />
          <h2 className="mt-4 text-center font-bjork-display text-[26px] font-bold italic leading-tight tracking-[-0.02em] @xl/thread:text-[30px]">
            What are we working on?
          </h2>
          <p className="mt-2 text-center text-[13.5px] text-[color:var(--bjork-text-muted)]">
            Ask anything, or start from one of these.
          </p>
          <ul className="mt-7 grid grid-cols-1 gap-2 @xl/thread:grid-cols-2">
            {suggestions.map((s) => (
              <li key={s.title}>
                <button
                  type="button"
                  onClick={() => onSuggestion(s.prompt)}
                  className={cn(
                    "group flex h-full w-full flex-col items-start gap-1 rounded-[14px] border border-[color:var(--bjork-border)] bg-[var(--bjork-surface)] p-3.5 text-left shadow-[var(--bjork-shadow-soft)] transition-[border-color,background-color,transform] duration-150 hover:border-[color:var(--bjork-border-strong)] hover:bg-[var(--bjork-surface-hover)] active:scale-[0.99] motion-reduce:active:scale-100",
                    focusRing,
                  )}
                >
                  <span className="text-[13px] font-medium">{s.title}</span>
                  <span className="line-clamp-2 text-[12.5px] leading-[1.45] text-[color:var(--bjork-text-muted)]">{s.prompt.split("\n")[0]}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");

  return (
    <div className="relative min-h-0 flex-1">
      <section
        ref={scrollRef}
        onScroll={onScroll}
        className="@container/thread h-full overflow-y-auto overscroll-contain"
        aria-label="Conversation"
        aria-busy={streamingId !== null}
      >
        <ol className="mx-auto flex w-full max-w-[760px] flex-col gap-7 px-4 pb-8 pt-6 @2xl/thread:px-6">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <li key={m.id} className="group flex flex-col items-end gap-1.5">
                <h3 className="sr-only">{user.name} said</h3>
                {m.attachments && m.attachments.length > 0 && (
                  <ul className="flex flex-wrap justify-end gap-1.5" aria-label="Attachments">
                    {m.attachments.map((a) => (
                      <li key={a.name}>
                        <AttachmentChip file={a} />
                      </li>
                    ))}
                  </ul>
                )}
                <div className="max-w-[85%] whitespace-pre-wrap rounded-[18px] rounded-br-[6px] border border-[color:var(--bjork-border)] bg-[var(--bjork-surface-active)] px-4 py-2.5 text-[14px] leading-[1.6]">
                  {m.content}
                </div>
                {i === lastUserIndex && streamingId === null && (
                  <button
                    type="button"
                    onClick={onEditLast}
                    className={cn(
                      "inline-flex h-7 items-center gap-1 rounded-[7px] px-2 text-[12px] text-[color:var(--bjork-text-muted)] opacity-0 transition-opacity hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)] focus-visible:opacity-100 group-hover:opacity-100",
                      focusRing,
                    )}
                  >
                    <Pencil aria-hidden="true" className="size-3.5" />
                    Edit
                  </button>
                )}
              </li>
            ) : (
              <li key={m.id} className="flex gap-3">
                <AssistantMark className="mt-0.5 size-7 shrink-0" pulsing={m.id === streamingId && !reduce} />
                <div className="min-w-0 flex-1">
                  <h3 className="sr-only">{assistantName} said</h3>
                  {m.id === streamingId && !m.content ? (
                    <TypingDots reduce={reduce} />
                  ) : (
                    <>
                      <Markdown content={m.content} />
                      {m.id === streamingId && (
                        <span aria-hidden="true" className="ml-0.5 inline-block h-[1.05em] w-[7px] translate-y-[3px] animate-pulse rounded-[2px] bg-[var(--bjork-accent)] motion-reduce:animate-none" />
                      )}
                    </>
                  )}
                  {m.stopped && (
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-[7px] bg-[var(--bjork-surface-active)] px-2 py-0.5 text-[11.5px] text-[color:var(--bjork-text-muted)]">
                      <Square aria-hidden="true" className="size-2.5 fill-current" />
                      Stopped
                    </p>
                  )}
                  {m.id !== streamingId && m.content && (
                    <MessageActions
                      message={m}
                      canRegenerate={m.id === lastAssistant?.id && streamingId === null}
                      onRegenerate={onRegenerate}
                      onFeedback={onFeedback}
                      onCopied={onCopied}
                    />
                  )}
                </div>
              </li>
            ),
          )}
          {error && (
            <li role="alert" className="flex items-center justify-between gap-3 rounded-[12px] border border-[color:color-mix(in_oklab,var(--blk-error)_35%,var(--bjork-border))] bg-[var(--blk-error-soft)] px-3.5 py-2.5 text-[13px] text-[color:var(--blk-error)]">
              {error}
              <BlockButton size="sm" variant="secondary" onClick={onRetry}>
                <RotateCcw aria-hidden="true" />
                Retry
              </BlockButton>
            </li>
          )}
        </ol>
      </section>
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-3 flex justify-center transition-[opacity,transform] duration-200 motion-reduce:transition-opacity",
          atBottom ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100",
        )}
      >
        <button
          type="button"
          onClick={jump}
          tabIndex={atBottom ? -1 : 0}
          aria-hidden={atBottom}
          aria-label="Scroll to latest"
          className={cn(
            "grid size-8 place-items-center rounded-full border border-[color:var(--bjork-border-strong)] bg-[var(--bjork-menu)] text-[color:var(--bjork-text-medium)] shadow-[var(--bjork-shadow-menu)] backdrop-blur-xl hover:text-[color:var(--bjork-text)]",
            !atBottom && "pointer-events-auto",
            focusRing,
          )}
        >
          <ArrowDown aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  );
}

function MessageActions({
  message,
  canRegenerate,
  onRegenerate,
  onFeedback,
  onCopied,
}: {
  message: ChatMessage;
  canRegenerate: boolean;
  onRegenerate: () => void;
  onFeedback: (id: string, value: "up" | "down") => void;
  onCopied: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <div role="group" aria-label="Message actions" className="-ml-1.5 mt-2 flex items-center gap-0.5">
      <IconButton
        label={copied ? "Copied" : "Copy response"}
        size="sm"
        onClick={() => {
          void navigator.clipboard?.writeText(message.content);
          setCopied(true);
          onCopied();
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setCopied(false), 1600);
        }}
      >
        {copied ? <Check /> : <Copy />}
      </IconButton>
      <IconButton label="Good response" size="sm" pressed={message.feedback === "up"} onClick={() => onFeedback(message.id, "up")}>
        <ThumbsUp fill={message.feedback === "up" ? "currentColor" : "none"} fillOpacity={0.18} />
      </IconButton>
      <IconButton label="Bad response" size="sm" pressed={message.feedback === "down"} onClick={() => onFeedback(message.id, "down")}>
        <ThumbsDown fill={message.feedback === "down" ? "currentColor" : "none"} fillOpacity={0.18} />
      </IconButton>
      {canRegenerate && (
        <IconButton label="Regenerate response" size="sm" onClick={onRegenerate}>
          <RotateCcw />
        </IconButton>
      )}
    </div>
  );
}

function AssistantMark({ className, pulsing }: { className?: string; pulsing?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid place-items-center rounded-[9px] bg-[var(--blk-accent-fill)] shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_1px_2px_rgba(0,0,0,0.2)]",
        className,
      )}
    >
      <svg viewBox="0 0 20 20" className="size-[62%]" fill="none">
        <path
          d="M10 2.5c.5 3.6 1.9 5 5.5 5.5-3.6.5-5 1.9-5.5 5.5-.5-3.6-1.9-5-5.5-5.5 3.6-.5 5-1.9 5.5-5.5Z"
          fill="var(--blk-accent-fill-ink)"
          className={cn(pulsing && "origin-center animate-[spin_2.4s_linear_infinite]")}
          style={{ transformBox: "fill-box" }}
        />
        <circle cx="15.5" cy="15" r="1.5" fill="var(--blk-accent-fill-ink)" opacity="0.7" />
      </svg>
    </span>
  );
}

function TypingDots({ reduce }: { reduce: boolean }) {
  return (
    <span className="inline-flex h-6 items-center gap-1" aria-label="Thinking" role="img">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn("size-1.5 rounded-full bg-[var(--bjork-text-muted)]", !reduce && "animate-bounce")}
          style={{ animationDelay: `${i * 140}ms`, animationDuration: "900ms" }}
        />
      ))}
    </span>
  );
}

function AttachmentChip({ file, onRemove }: { file: ChatAttachment; onRemove?: () => void }) {
  return (
    <span className="inline-flex max-w-[220px] items-center gap-2 rounded-[10px] border border-[color:var(--bjork-border)] bg-[var(--bjork-surface)] py-1.5 pl-2 pr-2.5 text-[12px] shadow-[var(--bjork-shadow-soft)]">
      <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-[6px] bg-[var(--bjork-accent-soft)] text-[color:var(--blk-accent-ink)]">
        <FileText className="size-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{file.name}</span>
        <span className="block font-mono text-[10.5px] text-[color:var(--bjork-text-soft)]">{file.size}</span>
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${file.name}`}
          className={cn("-mr-1 grid size-5 shrink-0 place-items-center rounded-[5px] text-[color:var(--bjork-text-soft)] hover:text-[color:var(--bjork-text)]", focusRing)}
        >
          <X aria-hidden="true" className="size-3" />
        </button>
      )}
    </span>
  );
}

/* ----------------------------------------------------------------------------------------------------------
 * Composer
 * -------------------------------------------------------------------------------------------------------- */

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Composer({
  inputRef,
  value,
  onChange,
  attachments,
  onAttach,
  onRemoveAttachment,
  streaming,
  onSend,
  onStop,
  canEditLast,
  onEditLast,
  assistantName,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  attachments: ChatAttachment[];
  onAttach: (files: ChatAttachment[]) => void;
  onRemoveAttachment: (name: string) => void;
  streaming: boolean;
  onSend: () => void;
  onStop: () => void;
  canEditLast: boolean;
  onEditLast: () => void;
  assistantName: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [dragging, setDragging] = useState(false);

  // Grow with the text up to a cap, then scroll.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value, inputRef]);

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onAttach(Array.from(list).map((f) => ({ name: f.name, size: formatSize(f.size) })));
  };

  return (
    <div className="shrink-0 px-3 pb-3 @2xl:px-6 @2xl:pb-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "mx-auto w-full max-w-[760px] rounded-[20px] border bg-[var(--bjork-surface)] p-2 shadow-[var(--bjork-shadow-surface)] transition-[border-color,box-shadow] duration-150 focus-within:border-[color:var(--bjork-border-strong)]",
          dragging ? "border-dashed border-[color:var(--bjork-accent)] ring-[3px] ring-[color:var(--bjork-accent-soft)]" : "border-[color:var(--bjork-border)]",
        )}
      >
        {attachments.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 px-1 pb-2 pt-1" aria-label="Attached files">
            {attachments.map((a) => (
              <li key={a.name}>
                <AttachmentChip file={a} onRemove={() => onRemoveAttachment(a.name)} />
              </li>
            ))}
          </ul>
        )}
        <label className="sr-only" htmlFor={`${hintId}-input`}>
          Message {assistantName}
        </label>
        <textarea
          ref={inputRef}
          id={`${hintId}-input`}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onSend();
            } else if (e.key === "ArrowUp" && !value && canEditLast && !streaming) {
              e.preventDefault();
              onEditLast();
            }
          }}
          onPaste={(e) => {
            if (e.clipboardData.files.length > 0) {
              e.preventDefault();
              addFiles(e.clipboardData.files);
            }
          }}
          aria-describedby={hintId}
          placeholder={`Message ${assistantName}`}
          className="block max-h-[220px] min-h-[44px] w-full resize-none bg-transparent px-2.5 py-2.5 text-[14.5px] leading-[1.55] text-[color:var(--bjork-text)] outline-none placeholder:text-[color:var(--bjork-text-soft)]"
        />
        <div className="flex items-center gap-1.5">
          <IconButton label="Attach files" size="sm" onClick={() => fileRef.current?.click()}>
            <Paperclip />
          </IconButton>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <p id={hintId} className="hidden min-w-0 flex-1 truncate text-[11.5px] text-[color:var(--bjork-text-soft)] @xl:block">
            <Kbd>↵</Kbd> send · <Kbd>⇧</Kbd> <Kbd>↵</Kbd> new line · <Kbd>↑</Kbd> edit last
          </p>
          <span className="flex-1 @xl:hidden" />
          {streaming ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop generating (Esc)"
              title="Stop generating (Esc)"
              className={cn(
                "grid size-9 place-items-center rounded-full bg-[var(--bjork-text)] text-[color:var(--bjork-bg)] transition-transform active:scale-95 motion-reduce:active:scale-100",
                focusRing,
              )}
            >
              <Square aria-hidden="true" className="size-3 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!value.trim()}
              aria-label="Send message"
              title="Send (Enter)"
              className={cn(
                "grid size-9 place-items-center rounded-full bg-[var(--blk-accent-fill)] text-[color:var(--blk-accent-fill-ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-[transform,opacity,filter] hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 motion-reduce:active:scale-100",
                focusRing,
              )}
            >
              <ArrowUp aria-hidden="true" className="size-[18px]" strokeWidth={2.2} />
            </button>
          )}
        </div>
      </form>
      <p className="mx-auto mt-2 max-w-[760px] text-center text-[11px] text-[color:var(--bjork-text-soft)]">
        Answers can be wrong. Check anything important.
      </p>
    </div>
  );
}
