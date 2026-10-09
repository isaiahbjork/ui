"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, Copy } from "lucide-react";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import {
  AI_WELL,
  FOCUS_RING,
  PRESS,
  useAiTone,
  useReduceMotion,
  type BjorkTone,
} from "@/components/bjork-ui/ai/_shared";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------------------------

export type StreamingMessageRole = "assistant" | "user";

export interface StreamingCodeProps {
  code: string;
  /** Language from the fence info string, lower-cased. Empty when the fence has none. */
  language: string;
  /** True while the closing fence has not arrived yet. */
  open: boolean;
}

export interface StreamingMessageComponents {
  /** Replaces the whole fenced code block, header included. */
  code?: (props: StreamingCodeProps) => ReactNode;
  /** Replaces inline `code` spans. */
  inlineCode?: (props: { children: string }) => ReactNode;
  /** Replaces links. `href` has already passed the safe-URL check. */
  link?: (props: { href: string; children: ReactNode }) => ReactNode;
}

export interface StreamingMessageProps {
  /** Markdown source. Pass the full text so far on every chunk; partial input is expected. */
  content: string;
  /** True while tokens are still arriving. Shows the caret and tolerates half-typed markup. */
  streaming?: boolean;
  /** "assistant" renders flat prose. "user" renders a quiet bubble. Default "assistant". */
  role?: StreamingMessageRole;
  /** Number the lines of fenced code blocks. Default false. */
  lineNumbers?: boolean;
  /** Called after a code block is copied to the clipboard. */
  onCopy?: (code: string, language: string) => void;
  /** Override the rendering of code blocks, inline code or links. */
  components?: StreamingMessageComponents;
  /** Accessible name for the message. Defaults to "Assistant message" or "Your message". */
  label?: string;
  tone?: BjorkTone;
  className?: string;
}

// ---------------------------------------------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------------------------------------------

export const SAMPLE_STREAMING_MARKDOWN = `Short answer: **debounce the writes, not the reads.** The editor already batches keystrokes, so the slow part is the \`persist()\` call that fires on every change.

### What to change

1. Wrap \`persist\` in a trailing debounce of about 400ms.
2. Flush on \`visibilitychange\` so a closed tab never loses the last edit.
3. Keep reads synchronous; the cache in \`draftStore\` is already warm.

\`\`\`ts
import { debounce } from "@/lib/timing";

const persistSoon = debounce(persist, 400);

editor.on("change", (doc) => persistSoon(doc));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") persistSoon.flush();
});
\`\`\`

> On the Kestrel Mini test rig this cut write volume by **~92%** with no lost drafts across 1,200 forced tab closes.

If you need cross-device sync later, the [fieldnotes.dev write-up](https://fieldnotes.dev/debounce-vs-throttle) compares this with a throttled queue.`;

// ---------------------------------------------------------------------------------------------------------------
// Block parser
// ---------------------------------------------------------------------------------------------------------------

interface ListItem {
  text: string;
  children: ListBlock | null;
}

interface ListBlock {
  type: "list";
  ordered: boolean;
  start: number;
  items: ListItem[];
}

type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "hr" }
  | { type: "code"; language: string; code: string; open: boolean }
  | { type: "table"; head: string[]; align: ("left" | "center" | "right")[]; rows: string[][] }
  | ListBlock;

interface ParsedBlock {
  /** The exact source this block came from. Unchanged source means an unchanged render. */
  raw: string;
  block: Block;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^ {0,3}([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
// Lines that are only the start of a markup token. While streaming they are held back so "##" never shows as text.
const BARE_MARKER = /^\s*(#{1,6}|[-*+>]|[-*_]{2}|\d{1,9}[.)]?|`{1,2}|~{1,2}|\|)\s*$/;

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

function isBlockStart(line: string): boolean {
  return FENCE.test(line) || HEADING.test(line) || HR.test(line) || QUOTE.test(line) || LIST_ITEM.test(line);
}

function buildList(rows: { depth: number; ordered: boolean; start: number; text: string }[]): ListBlock {
  const root: ListBlock = { type: "list", ordered: rows[0].ordered, start: rows[0].start, items: [] };
  const stack: { depth: number; list: ListBlock }[] = [{ depth: rows[0].depth, list: root }];
  for (const row of rows) {
    while (stack.length > 1 && row.depth < stack[stack.length - 1].depth) stack.pop();
    let top = stack[stack.length - 1];
    if (row.depth > top.depth && top.list.items.length > 0) {
      const parent = top.list.items[top.list.items.length - 1];
      if (!parent.children) parent.children = { type: "list", ordered: row.ordered, start: row.start, items: [] };
      top = { depth: row.depth, list: parent.children };
      stack.push(top);
    }
    top.list.items.push({ text: row.text, children: null });
  }
  return root;
}

/** Splits markdown into blocks. With `partial`, a trailing half-typed marker line is held back. */
export function parseMarkdownBlocks(source: string, partial = false): ParsedBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  if (partial && lines.length > 0 && BARE_MARKER.test(lines[lines.length - 1])) lines.pop();
  const out: ParsedBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1];
      const body: string[] = [];
      let j = i + 1;
      let open = true;
      while (j < lines.length) {
        const t = lines[j].trim();
        if (t.startsWith(marker[0].repeat(marker.length)) && t.replace(new RegExp(`\\${marker[0]}`, "g"), "") === "") {
          open = false;
          break;
        }
        body.push(lines[j]);
        j++;
      }
      out.push({
        raw: lines.slice(i, open ? j : j + 1).join("\n") + (open ? "\u0000open" : ""),
        block: { type: "code", language: fence[2].toLowerCase(), code: body.join("\n"), open },
      });
      i = open ? j : j + 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = Math.min(3, heading[1].length) as 1 | 2 | 3;
      out.push({ raw: line, block: { type: "heading", level, text: heading[2] } });
      i++;
      continue;
    }

    if (HR.test(line)) {
      out.push({ raw: line, block: { type: "hr" } });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      let j = i;
      while (j < lines.length && QUOTE.test(lines[j])) {
        body.push(QUOTE.exec(lines[j])![1]);
        j++;
      }
      out.push({ raw: lines.slice(i, j).join("\n"), block: { type: "quote", text: body.join("\n") } });
      i = j;
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const rows: { depth: number; ordered: boolean; start: number; text: string }[] = [];
      let j = i;
      while (j < lines.length) {
        const m = LIST_ITEM.exec(lines[j]);
        if (m) {
          const ordered = /\d/.test(m[2]);
          rows.push({
            depth: Math.floor(m[1].replace(/\t/g, "  ").length / 2),
            ordered,
            start: ordered ? parseInt(m[2], 10) : 1,
            text: m[3],
          });
          j++;
        } else if (lines[j].trim() !== "" && /^\s{2,}/.test(lines[j]) && rows.length > 0) {
          rows[rows.length - 1].text += ` ${lines[j].trim()}`; // lazy continuation line
          j++;
        } else break;
      }
      out.push({ raw: lines.slice(i, j).join("\n"), block: buildList(rows) });
      i = j;
      continue;
    }

    // A table needs a header row and a separator. While streaming, a lone pipe row is shown as a header so the
    // later separator does not flip a paragraph into a table.
    const next = lines[i + 1];
    const pipeRow = line.trim().startsWith("|");
    const isTable = line.includes("|") && next !== undefined && TABLE_SEP.test(next);
    const pendingTable = partial && pipeRow && i === lines.length - 1;
    if (isTable || pendingTable) {
      const head = splitRow(line);
      const align = isTable
        ? splitRow(next).map((c) =>
            c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : ("left" as const),
          )
        : head.map(() => "left" as const);
      const rows: string[][] = [];
      let j = isTable ? i + 2 : i + 1;
      while (j < lines.length && lines[j].includes("|") && lines[j].trim() !== "") {
        rows.push(splitRow(lines[j]));
        j++;
      }
      out.push({ raw: lines.slice(i, j).join("\n"), block: { type: "table", head, align, rows } });
      i = j;
      continue;
    }

    const body: string[] = [line];
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== "" && !isBlockStart(lines[j])) {
      body.push(lines[j]);
      j++;
    }
    out.push({ raw: body.join("\n"), block: { type: "paragraph", text: body.join("\n") } });
    i = j;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Inline parser
// ---------------------------------------------------------------------------------------------------------------

type Inline =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "link"; href: string | null; c: Inline[] }
  | { t: "br" };

const SAFE_URL = /^(https?:\/\/|mailto:|\/(?!\/)|#|\.{1,2}\/)/i;

function findClose(s: string, marker: string, from: number): number {
  let k = from;
  while (k < s.length) {
    const at = s.indexOf(marker, k);
    if (at === -1) return -1;
    // A single "*" closer must not be half of a "**".
    if (marker.length === 1 && (s[at + 1] === marker || s[at - 1] === marker) && marker === "*") {
      k = at + 2;
      continue;
    }
    if (at > from && s[at - 1] !== " ") return at;
    k = at + 1;
  }
  return -1;
}

/**
 * Parses inline markdown. With `partial`, an unclosed marker styles the rest of the text instead of printing
 * the raw asterisks, so "**bol" renders as bold "bol" rather than flashing "**bol".
 */
function parseInline(s: string, partial: boolean): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ t: "text", v: buf });
    buf = "";
  };
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    const rest = s.length - i;

    if (ch === "\\" && rest > 1 && /[\\`*_[\]()#|>-]/.test(s[i + 1])) {
      buf += s[i + 1];
      i += 2;
      continue;
    }
    if (ch === "\n") {
      // Markdown hard break: two trailing spaces. Otherwise a soft break is a space.
      if (buf.endsWith("  ")) {
        buf = buf.trimEnd();
        flush();
        out.push({ t: "br" });
      } else buf = `${buf.trimEnd()} `;
      i++;
      continue;
    }
    if (ch === "`") {
      const end = s.indexOf("`", i + 1);
      if (end !== -1) {
        flush();
        out.push({ t: "code", v: s.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
      if (partial) {
        flush();
        if (rest > 1) out.push({ t: "code", v: s.slice(i + 1) });
        return out;
      }
    }
    const double = s.startsWith("**", i) || s.startsWith("__", i);
    if (double && rest > 2 && s[i + 2] !== " ") {
      const marker = s.slice(i, i + 2);
      const end = s.indexOf(marker, i + 2);
      if (end !== -1) {
        flush();
        out.push({ t: "strong", c: parseInline(s.slice(i + 2, end), false) });
        i = end + 2;
        continue;
      }
      if (partial) {
        flush();
        out.push({ t: "strong", c: parseInline(s.slice(i + 2), true) });
        return out;
      }
    }
    if (double && rest === 2 && partial) return (flush(), out);
    const wordUnderscore = ch === "_" && /\w/.test(s[i - 1] ?? "");
    if ((ch === "*" || ch === "_") && !double && !wordUnderscore && rest > 1 && s[i + 1] !== " ") {
      const end = findClose(s, ch, i + 1);
      if (end !== -1) {
        flush();
        out.push({ t: "em", c: parseInline(s.slice(i + 1, end), false) });
        i = end + 1;
        continue;
      }
      if (partial) {
        flush();
        out.push({ t: "em", c: parseInline(s.slice(i + 1), true) });
        return out;
      }
    }
    if ((ch === "*" || ch === "_") && rest === 1 && partial && !wordUnderscore) return (flush(), out);
    if (ch === "[") {
      const close = s.indexOf("]", i + 1);
      if (close !== -1 && s[close + 1] === "(") {
        const end = s.indexOf(")", close + 2);
        if (end !== -1) {
          flush();
          const url = s.slice(close + 2, end).trim().split(/\s+/)[0] ?? "";
          out.push({ t: "link", href: SAFE_URL.test(url) ? url : null, c: parseInline(s.slice(i + 1, close), false) });
          i = end + 1;
          continue;
        }
        if (partial) {
          // "[label](https://fie" shows the label while the URL is still arriving.
          flush();
          out.push({ t: "link", href: null, c: parseInline(s.slice(i + 1, close), false) });
          return out;
        }
      }
      if (partial && (close === -1 || close === s.length - 1)) {
        flush();
        out.push(...parseInline(s.slice(i + 1, close === -1 ? undefined : close), true));
        return out;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------------------------

const CSS =
  "@keyframes bjork-sm-caret{0%,45%{opacity:1}55%,100%{opacity:.2}}" +
  "@keyframes bjork-sm-in{from{opacity:0;filter:blur(3px);transform:translateY(4px)}to{opacity:1;filter:blur(0);transform:none}}" +
  ".bjork-sm-caret{animation:bjork-sm-caret 1.05s ease-in-out infinite}" +
  ".bjork-sm-in{animation:bjork-sm-in 320ms cubic-bezier(0.23,1,0.32,1) both}" +
  "@media (prefers-reduced-motion: reduce){.bjork-sm-caret{animation:none}.bjork-sm-in{animation:none}}";

function Caret() {
  // 7 x 15 block; 2px down so it sits on the baseline of 14px text instead of the line box top.
  return (
    <span
      aria-hidden="true"
      data-caret=""
      className="bjork-sm-caret ml-0.5 inline-block h-[15px] w-[7px] translate-y-[2px] rounded-[1.5px] bg-[color:var(--bjork-accent)]"
    />
  );
}

interface RenderCtx {
  components?: StreamingMessageComponents;
  lineNumbers: boolean;
  onCopy?: (code: string, language: string) => void;
}

function renderInline(nodes: Inline[], ctx: RenderCtx, keyPrefix = ""): ReactNode[] {
  return nodes.map((n, idx) => {
    const key = `${keyPrefix}${idx}`;
    switch (n.t) {
      case "text":
        return n.v;
      case "br":
        return <br key={key} />;
      case "code":
        return ctx.components?.inlineCode ? (
          <span key={key}>{ctx.components.inlineCode({ children: n.v })}</span>
        ) : (
          <code
            key={key}
            className="rounded-[5px] border border-[color:var(--bjork-hair)] bg-[var(--bjork-field-inset)] px-[5px] py-px font-mono text-[12.5px] text-[color:var(--bjork-text)] [overflow-wrap:anywhere]"
          >
            {n.v}
          </code>
        );
      case "strong":
        return (
          <strong key={key} className="font-semibold text-[color:var(--bjork-text)]">
            {renderInline(n.c, ctx, `${key}.`)}
          </strong>
        );
      case "em":
        return (
          <em key={key} className="italic">
            {renderInline(n.c, ctx, `${key}.`)}
          </em>
        );
      case "link": {
        const children = renderInline(n.c, ctx, `${key}.`);
        if (!n.href) return <span key={key}>{children}</span>;
        if (ctx.components?.link) return <span key={key}>{ctx.components.link({ href: n.href, children })}</span>;
        const external = /^https?:/i.test(n.href);
        return (
          <a
            key={key}
            href={n.href}
            target={external ? "_blank" : undefined}
            rel={external ? "noreferrer noopener" : undefined}
            className={cn(
              "rounded-[3px] font-medium text-[color:var(--bjork-accent-ink)] underline decoration-[color:var(--bjork-accent-muted)] decoration-1 underline-offset-[3px] transition-colors hover:decoration-[color:var(--bjork-accent)]",
              FOCUS_RING,
            )}
          >
            {children}
          </a>
        );
      }
    }
  });
}

function Inlines({ text, partial, ctx, caret }: { text: string; partial: boolean; ctx: RenderCtx; caret: boolean }) {
  return (
    <>
      {renderInline(parseInline(text, partial), ctx)}
      {caret && <Caret />}
    </>
  );
}

function CodeBlock({
  code,
  language,
  open,
  caret,
  ctx,
}: StreamingCodeProps & { caret: boolean; ctx: RenderCtx }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      return;
    }
    ctx.onCopy?.(code, language);
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1600);
  };

  if (ctx.components?.code) return <>{ctx.components.code({ code, language, open })}</>;

  const lines = code.split("\n");
  return (
    <figure className={cn(AI_WELL, "my-4 overflow-hidden rounded-[10px]")}>
      <figcaption className="flex h-9 items-center justify-between gap-3 border-b border-[color:var(--bjork-border)] pl-3 pr-1">
        <span className="flex min-w-0 items-center gap-2 font-mono text-[10px] uppercase leading-none tracking-[0.08em] text-[color:var(--bjork-text-soft)]">
          {language || "text"}
          {open && (
            <span className="normal-case tracking-normal text-[color:var(--bjork-text-faint)]">· writing</span>
          )}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : `Copy ${language || "code"}`}
          className={cn(
            "flex h-7 cursor-pointer items-center gap-1.5 rounded-[7px] px-2 font-mono text-[11px] text-[color:var(--bjork-text-muted)] transition-colors hover:bg-[var(--bjork-surface-active)] hover:text-[color:var(--bjork-text)]",
            FOCUS_RING,
            PRESS,
          )}
        >
          <span className="relative grid size-3.5 place-items-center">
            <Copy
              size={13}
              strokeWidth={1.75}
              className={cn("absolute transition-[background-color,border-color,color,opacity] duration-150", copied ? "scale-50 opacity-0" : "opacity-100")}
            />
            <Check
              size={13}
              strokeWidth={2}
              className={cn(
                "absolute text-[color:var(--bjork-accent-ink)] transition-[background-color,border-color,color,opacity] duration-150",
                copied ? "opacity-100" : "scale-50 opacity-0",
              )}
            />
          </span>
          <span className="min-w-[6ch] text-left">{copied ? "Copied" : "Copy"}</span>
        </button>
      </figcaption>
      <pre className="overflow-x-auto py-3 font-mono text-[12.5px] leading-5 text-[color:var(--bjork-text-medium)] [scrollbar-width:thin]">
        <code className="grid min-w-max">
          {lines.map((ln, idx) => (
            <span key={idx} className="flex pr-4">
              {ctx.lineNumbers && (
                <span
                  aria-hidden="true"
                  className="sticky left-0 w-9 shrink-0 select-none bg-[var(--bjork-field-inset)] pr-3 text-right tabular-nums text-[color:var(--bjork-text-faint)]"
                >
                  {idx + 1}
                </span>
              )}
              <span className={cn("whitespace-pre", !ctx.lineNumbers && "pl-3.5")}>
                {ln || (idx === lines.length - 1 && caret ? "" : "​")}
                {caret && idx === lines.length - 1 && <Caret />}
              </span>
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}

function ListView({ list, ctx, caretPath, partial }: { list: ListBlock; ctx: RenderCtx; caretPath: boolean; partial: boolean }) {
  const Tag = list.ordered ? "ol" : "ul";
  return (
    <Tag
      start={list.ordered && list.start !== 1 ? list.start : undefined}
      className={cn("my-3 grid gap-1.5 pl-0", list.ordered ? "list-none" : "list-none")}
    >
      {list.items.map((item, idx) => {
        const last = idx === list.items.length - 1;
        const caretHere = caretPath && last && !item.children;
        return (
          <li key={idx} className="relative pl-6">
            <span
              aria-hidden="true"
              className={cn(
                "absolute left-0 top-0 flex h-[22px] w-[18px] items-center justify-end pr-1.5 text-[color:var(--bjork-text-soft)]",
                list.ordered && "font-mono text-[12px] tabular-nums",
              )}
            >
              {list.ordered ? (
                `${list.start + idx}.`
              ) : (
                <span className="size-[5px] rounded-full bg-[color:var(--bjork-text-faint)]" />
              )}
            </span>
            <Inlines text={item.text} partial={partial && last} ctx={ctx} caret={caretHere} />
            {item.children && (
              <ListView list={item.children} ctx={ctx} caretPath={caretPath && last} partial={partial && last} />
            )}
          </li>
        );
      })}
    </Tag>
  );
}

interface BlockViewProps {
  block: Block;
  raw: string;
  /** The last block while streaming: it tolerates half-typed markup and carries the caret. */
  tail: boolean;
  enter: boolean;
  ctx: RenderCtx;
}

const BlockView = memo(
  function BlockView({ block, tail, enter, ctx }: BlockViewProps) {
    const wrap = (node: ReactNode) => <div className={cn(enter && "bjork-sm-in")}>{node}</div>;
    switch (block.type) {
      case "heading": {
        const cls =
          block.level === 1
            ? "mt-6 mb-2 text-[19px] leading-7 font-semibold tracking-[-0.015em]"
            : block.level === 2
              ? "mt-6 mb-2 text-[16px] leading-6 font-semibold tracking-[-0.01em]"
              : "mt-5 mb-1.5 text-[14px] leading-[22px] font-semibold";
        const H = `h${block.level + 1}` as "h2" | "h3" | "h4";
        return wrap(
          <H className={cn(cls, "text-[color:var(--bjork-text)] first:mt-0")}>
            <Inlines text={block.text} partial={tail} ctx={ctx} caret={tail} />
          </H>,
        );
      }
      case "paragraph":
        return wrap(
          <p className="my-3">
            <Inlines text={block.text} partial={tail} ctx={ctx} caret={tail} />
          </p>,
        );
      case "quote":
        return wrap(
          <blockquote className="my-4 border-l border-[color:var(--bjork-border-strong)] pl-4 text-[color:var(--bjork-text-muted)]">
            <Inlines text={block.text} partial={tail} ctx={ctx} caret={tail} />
          </blockquote>,
        );
      case "hr":
        return wrap(<hr className="my-6 border-0 border-t border-[color:var(--bjork-border)]" />);
      case "list":
        return wrap(<ListView list={block} ctx={ctx} caretPath={tail} partial={tail} />);
      case "code":
        return wrap(<CodeBlock code={block.code} language={block.language} open={block.open} caret={tail && block.open} ctx={ctx} />);
      case "table":
        return wrap(
          <div className="my-4 overflow-x-auto rounded-[10px] border border-[color:var(--bjork-border)]">
            <table className="w-full border-collapse text-left text-[13px] leading-5">
              <thead>
                <tr className="border-b border-[color:var(--bjork-border)]">
                  {block.head.map((h, idx) => (
                    <th
                      key={idx}
                      style={{ textAlign: block.align[idx] ?? "left" }}
                      className="px-3 py-2 font-mono text-[10px] font-normal uppercase tracking-[0.08em] text-[color:var(--bjork-text-soft)]"
                    >
                      {renderInline(parseInline(h, false), ctx)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={r} className="border-b border-[color:var(--bjork-border)] last:border-0">
                    {block.head.map((_, c) => (
                      <td key={c} style={{ textAlign: block.align[c] ?? "left" }} className="px-3 py-2 tabular-nums">
                        {renderInline(parseInline(row[c] ?? "", tail && r === block.rows.length - 1), ctx)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
    }
  },
  // Finished blocks keep the same source on every chunk, so only the tail block re-renders.
  (a, b) => a.raw === b.raw && a.tail === b.tail && a.ctx === b.ctx,
);

// ---------------------------------------------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------------------------------------------

/**
 * An assistant message that renders markdown as it streams. A small, safe parser (no HTML injection) handles
 * half-typed input, finished blocks are memoised, and a caret rides the end of the text while tokens arrive.
 */
export function StreamingMessage({
  content,
  streaming = false,
  role = "assistant",
  lineNumbers = false,
  onCopy,
  components,
  label,
  tone: toneProp,
  className,
}: StreamingMessageProps) {
  const { style } = useAiTone(toneProp);
  const reduce = useReduceMotion();
  const blocks = useMemo(() => parseMarkdownBlocks(content, streaming), [content, streaming]);

  const onCopyRef = useRef(onCopy);
  useEffect(() => {
    onCopyRef.current = onCopy;
  });
  const handleCopy = useCallback((code: string, language: string) => onCopyRef.current?.(code, language), []);
  const ctx = useMemo<RenderCtx>(
    () => ({ components, lineNumbers, onCopy: handleCopy }),
    [components, lineNumbers, handleCopy],
  );

  // Announce the start and the end of a response, never individual tokens.
  const [announce, setAnnounce] = useState({ streaming, message: "" });
  if (announce.streaming !== streaming) {
    setAnnounce({ streaming, message: streaming ? "Response started" : "Response complete" });
  }

  const isUser = role === "user";
  const name = label ?? (isUser ? "Your message" : "Assistant message");

  return (
    <article
      aria-label={name}
      aria-busy={streaming || undefined}
      className={cn(
        "@container w-full font-bjork-alpha text-[14px] leading-[22px] text-[color:var(--bjork-text-medium)] [overflow-wrap:break-word]",
        isUser && "flex justify-end",
        className,
      )}
      style={style}
    >
      <style href="bjork-streaming-message" precedence="default">
        {CSS}
      </style>
      <div
        className={cn(
          "min-w-0 [&>div:first-child>*]:mt-0 [&>div:last-child>*]:mb-0",
          isUser
            ? "max-w-[85%] rounded-[16px] rounded-br-[6px] bg-[var(--bjork-raised)] px-3.5 py-2.5 text-[color:var(--bjork-text)]"
            : "w-full",
        )}
      >
        {blocks.map((b, idx) => (
          <BlockView
            key={`${idx}:${b.block.type}`}
            block={b.block}
            raw={b.raw}
            tail={streaming && idx === blocks.length - 1}
            enter={streaming && !reduce}
            ctx={ctx}
          />
        ))}
        {streaming && blocks.length === 0 && (
          <div>
            <p className="my-0 h-[22px]">
              <Caret />
            </p>
          </div>
        )}
      </div>
      <LiveRegion message={announce.message} />
    </article>
  );
}
