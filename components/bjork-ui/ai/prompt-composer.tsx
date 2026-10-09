"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { motion } from "framer-motion";
import { Paperclip } from "lucide-react";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import { springs } from "@/components/bjork-ui/_core/motion";
import {
  FOCUS_RING,
  PRESS,
  formatBytes,
  formatTokens,
  useAiTone,
  useControllable,
  useReduceMotion,
  type BjorkTone,
} from "@/components/bjork-ui/ai/_shared";
import { StrokeMorphIcon } from "@/components/bjork-ui/utilities/stroke-morph-icon";
import { cn } from "@/lib/utils";

export interface ComposerAttachment {
  id: string;
  name: string;
  /** Size in bytes. */
  size: number;
  type?: string;
  /** The picked, pasted or dropped file. Absent for attachments restored from elsewhere. */
  file?: File;
}

export interface SlashCommand {
  /** Typed after the slash, without it: "summarize". */
  name: string;
  description: string;
  /** Argument hint shown in mono, such as "[language]". */
  hint?: string;
}

export interface PromptSubmission {
  /** The message without the leading command. */
  text: string;
  attachments: ComposerAttachment[];
  /** The slash command the message starts with, if any. */
  command?: SlashCommand;
}

export interface PromptComposerProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onSubmit?: (submission: PromptSubmission) => void;
  /** While `streaming`, the send button becomes a stop button that calls this. */
  onStop?: () => void;
  streaming?: boolean;
  /** Commands offered after a "/" at the start of a line. Defaults to SAMPLE_COMMANDS. Pass [] to turn the menu off. */
  commands?: SlashCommand[];
  attachments?: ComposerAttachment[];
  defaultAttachments?: ComposerAttachment[];
  onAttachmentsChange?: (attachments: ComposerAttachment[]) => void;
  /** Footer slot for a model picker or similar control. */
  modelSlot?: ReactNode;
  placeholder?: string;
  /** Rows the textarea grows to before it scrolls. Default 8. */
  maxRows?: number;
  /** Passed to the file input. */
  accept?: string;
  disabled?: boolean;
  /** Accessible name of the textarea. Default "Message". */
  label?: string;
  tone?: BjorkTone;
  className?: string;
}

export const SAMPLE_COMMANDS: SlashCommand[] = [
  { name: "summarize", description: "Condense the thread into key points", hint: "[length]" },
  { name: "rewrite", description: "Rewrite the selection in a new tone", hint: "[tone]" },
  { name: "translate", description: "Translate the message", hint: "[language]" },
  { name: "explain", description: "Explain step by step, for a beginner" },
  { name: "search", description: "Search connected sources first", hint: "[query]" },
  { name: "table", description: "Answer as a table" },
];

const LINE = 20;
const PAD_Y = 10;

/** The "/token" the caret sits in, when it starts a line. */
function slashAt(text: string, caret: number): { start: number; query: string } | null {
  const lineStart = text.lastIndexOf("\n", caret - 1) + 1;
  const before = text.slice(lineStart, caret);
  const m = /^\/([\w-]*)$/.exec(before);
  return m ? { start: lineStart, query: m[1].toLowerCase() } : null;
}

function filterCommands(commands: SlashCommand[], q: string): SlashCommand[] {
  if (!q) return commands;
  const starts = commands.filter((c) => c.name.toLowerCase().startsWith(q));
  const rest = commands.filter(
    (c) => !starts.includes(c) && (c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)),
  );
  return [...starts, ...rest];
}

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "file";
}

/**
 * A chat input. The textarea grows with its content, files arrive by button, paste or drop, a "/" at the start of
 * a line opens a command list, and the send button turns into stop while a reply streams.
 */
export function PromptComposer({
  value,
  defaultValue = "",
  onValueChange,
  onSubmit,
  onStop,
  streaming = false,
  commands = SAMPLE_COMMANDS,
  attachments,
  defaultAttachments = [],
  onAttachmentsChange,
  modelSlot,
  placeholder = "Ask anything. Type / for commands",
  maxRows = 8,
  accept,
  disabled = false,
  label = "Message",
  tone: toneProp,
  className,
}: PromptComposerProps) {
  const { style } = useAiTone(toneProp);
  const reduce = useReduceMotion();
  const [text, setText] = useControllable(value, defaultValue, onValueChange);
  const [files, setFiles] = useControllable(attachments, defaultAttachments, onAttachmentsChange);
  const [caret, setCaret] = useState(defaultValue.length);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [announce, setAnnounce] = useState("");

  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const dragDepth = useRef(0);
  const idSeq = useRef(0);
  const baseId = useId();
  const menuId = `${baseId}-commands`;
  const hintId = `${baseId}-hint`;

  const slash = commands.length > 0 ? slashAt(text, caret) : null;
  const matches = slash ? filterCommands(commands, slash.query) : [];
  const menuOpen = slash !== null && dismissedAt !== slash.start && !disabled;
  const active = matches.length ? Math.min(activeIndex, matches.length - 1) : -1;

  const trimmed = text.trim();
  const canSend = !disabled && !streaming && (trimmed.length > 0 || files.length > 0);
  const tokens = Math.ceil(text.length / 4);

  // Autosize: grow with the content up to maxRows, then scroll.
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const max = maxRows * LINE + PAD_Y * 2;
    el.style.height = "auto";
    const h = Math.min(el.scrollHeight, max);
    el.style.height = `${h}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [text, maxRows]);

  // Restore the caret after a command is inserted.
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el || pendingCaret.current === null) return;
    el.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  }, [text]);

  const addFiles = (list: FileList | File[]) => {
    const picked = Array.from(list);
    if (!picked.length || disabled) return;
    const next = picked.map((f) => {
      idSeq.current += 1;
      return { id: `${baseId}-f${idSeq.current}`, name: f.name || "pasted-image.png", size: f.size, type: f.type, file: f };
    });
    setFiles([...files, ...next]);
    setAnnounce(next.length === 1 ? `Attached ${next[0].name}` : `Attached ${next.length} files`);
  };

  const removeFile = (file: ComposerAttachment) => {
    setFiles(files.filter((f) => f.id !== file.id));
    setAnnounce(`Removed ${file.name}`);
    areaRef.current?.focus();
  };

  const insertCommand = (cmd: SlashCommand) => {
    if (!slash) return;
    const insert = `/${cmd.name} `;
    const next = text.slice(0, slash.start) + insert + text.slice(caret);
    const at = slash.start + insert.length;
    pendingCaret.current = at;
    setCaret(at);
    setText(next);
    setActiveIndex(0);
  };

  const submit = () => {
    if (!canSend) return;
    const m = /^\/([\w-]+)\s*/.exec(trimmed);
    const command = m ? commands.find((c) => c.name === m[1]) : undefined;
    onSubmit?.({ text: command && m ? trimmed.slice(m[0].length) : trimmed, attachments: files, command });
    setText("");
    setCaret(0);
    setFiles([]);
    setAnnounce("Message sent");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // IME composition owns Enter and the arrows until it commits.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (menuOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!matches.length) return;
        const delta = e.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((active + delta + matches.length) % matches.length);
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey && active >= 0) {
        e.preventDefault();
        insertCommand(matches[active]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDismissedAt(slash.start);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      submit();
    }
  };

  const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    setCaret(e.target.selectionStart);
    setActiveIndex(0);
    // Leaving the slash token clears an Escape, so the next "/" opens the menu again.
    if (!slashAt(e.target.value, e.target.selectionStart)) setDismissedAt(null);
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.files.length === 0) return;
    e.preventDefault();
    addFiles(e.clipboardData.files);
  };

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  const dragHandlers = {
    onDragEnter: (e: DragEvent<HTMLDivElement>) => {
      if (!hasFiles(e) || disabled) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    },
    onDragOver: (e: DragEvent<HTMLDivElement>) => {
      if (!hasFiles(e) || disabled) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    },
    onDrop: (e: DragEvent<HTMLDivElement>) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      addFiles(e.dataTransfer.files);
    },
  };

  return (
    <div
      className={cn("@container relative w-full max-w-[680px] font-bjork-alpha text-[color:var(--bjork-text)]", className)}
      style={style}
    >
      {menuOpen && (
        <div
          className={cn(
            "absolute inset-x-0 bottom-[calc(100%+8px)] z-30 overflow-hidden rounded-[14px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-menu)] shadow-[var(--bjork-shadow-menu)] backdrop-blur-md",
            !reduce && "origin-bottom motion-safe:animate-[bjork-composer-pop_160ms_cubic-bezier(0.23,1,0.32,1)]",
          )}
        >
          <style href="bjork-composer-pop" precedence="default">
            {"@keyframes bjork-composer-pop{from{opacity:0;transform:translateY(4px) scale(0.98)}to{opacity:1;transform:none}}"}
          </style>
          <div className="flex h-8 items-center justify-between gap-3 border-b border-[color:var(--bjork-border)] px-3 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--bjork-text-faint)]">
            <span>Commands</span>
            <span aria-hidden="true" className="hidden normal-case tracking-normal @[380px]:inline">
              ↑↓ · ↵ or tab to insert · esc
            </span>
          </div>
          <ul id={menuId} role="listbox" aria-label="Commands" className="max-h-[232px] overflow-y-auto p-1.5">
            {matches.length === 0 && (
              <li role="presentation" className="px-2.5 py-3 text-[13px] text-[color:var(--bjork-text-muted)]">
                No command matches “/{slash?.query}”
              </li>
            )}
            {matches.map((cmd, i) => (
              <li
                key={cmd.name}
                id={`${menuId}-${cmd.name}`}
                role="option"
                aria-selected={i === active}
                onPointerMove={() => setActiveIndex(i)}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => insertCommand(cmd)}
                className={cn(
                  "flex h-9 cursor-pointer items-center gap-3 rounded-[8px] px-2.5 transition-colors duration-100",
                  i === active && "bg-[color:var(--bjork-surface-active)]",
                )}
              >
                <span className="w-[84px] shrink-0 truncate font-mono text-[12px] text-[color:var(--bjork-text)]">
                  <span className="text-[color:var(--bjork-accent-ink)]">/</span>
                  {cmd.name}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-[color:var(--bjork-text-muted)]">
                  {cmd.description}
                </span>
                {cmd.hint && (
                  <span className="hidden shrink-0 font-mono text-[11px] text-[color:var(--bjork-text-faint)] @[420px]:inline">
                    {cmd.hint}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div
        {...dragHandlers}
        className={cn(
          "relative rounded-[18px] border bg-[color:var(--bjork-field)] shadow-[var(--bjork-shadow-surface)] transition-[border-color,opacity] duration-150",
          "border-[color:var(--bjork-border)] focus-within:border-[color:var(--bjork-border-strong)]",
          disabled && "opacity-55",
        )}
      >
        {files.length > 0 && (
          <ul aria-label="Attachments" className="flex flex-wrap gap-1.5 px-2.5 pt-2.5">
            {files.map((f) => (
              <motion.li
                key={f.id}
                initial={reduce ? false : { opacity: 0, y: 4, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={reduce ? { duration: 0 } : springs.blurIn}
                className="flex h-9 max-w-full items-center gap-2 rounded-[10px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-surface)] pl-1.5 pr-0.5"
              >
                <span
                  aria-hidden="true"
                  className="grid h-6 min-w-6 place-items-center rounded-[6px] bg-[color:var(--bjork-surface-active)] px-1 font-mono text-[8.5px] font-semibold uppercase text-[color:var(--bjork-text-medium)]"
                >
                  {extOf(f.name).slice(0, 4)}
                </span>
                <span className="max-w-[150px] truncate text-[12.5px] leading-4">{f.name}</span>
                <span className="font-mono text-[11px] tabular-nums text-[color:var(--bjork-text-faint)]">
                  {formatBytes(f.size)}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => removeFile(f)}
                  aria-label={`Remove ${f.name}`}
                  className={cn(
                    "grid size-7 cursor-pointer place-items-center rounded-full text-[color:var(--bjork-text-faint)] transition-colors duration-150 hover:bg-[color:var(--bjork-surface-active)] hover:text-[color:var(--bjork-text)]",
                    FOCUS_RING,
                    PRESS,
                  )}
                >
                  <StrokeMorphIcon name="close" size={11} strokeWidth={1.75} />
                </button>
              </motion.li>
            ))}
          </ul>
        )}

        <textarea
          ref={areaRef}
          rows={1}
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={label}
          aria-describedby={hintId}
          aria-controls={menuOpen ? menuId : undefined}
          aria-autocomplete={commands.length ? "list" : undefined}
          aria-activedescendant={menuOpen && active >= 0 ? `${menuId}-${matches[active].name}` : undefined}
          onChange={onChange}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => slash && setDismissedAt(slash.start)}
          onFocus={() => setDismissedAt(null)}
          className="block w-full resize-none bg-transparent px-4 text-[14px] leading-5 text-[color:var(--bjork-text)] outline-none placeholder:text-[color:var(--bjork-text-soft)] disabled:cursor-not-allowed"
          style={{ paddingTop: PAD_Y, paddingBottom: PAD_Y, minHeight: LINE + PAD_Y * 2 }}
        />

        <div className="flex items-center gap-1.5 px-2 pb-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={accept}
            tabIndex={-1}
            aria-hidden="true"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
            aria-label="Attach files"
            className={cn(
              "grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-[color:var(--bjork-text-muted)] transition-colors duration-150 hover:bg-[color:var(--bjork-surface-active)] hover:text-[color:var(--bjork-text)] disabled:cursor-not-allowed",
              FOCUS_RING,
              PRESS,
            )}
          >
            <Paperclip aria-hidden="true" size={16} strokeWidth={1.75} />
          </button>
          {modelSlot && <div className="flex min-w-0 shrink items-center">{modelSlot}</div>}
          <span
            id={hintId}
            className="ml-auto hidden whitespace-nowrap font-mono text-[11px] tabular-nums text-[color:var(--bjork-text-faint)] @[400px]:inline"
          >
            {text.length > 0 ? (
              <>
                <span className="inline-block min-w-[3ch] text-right">{text.length.toLocaleString("en-US")}</span> chars · ~
                {formatTokens(tokens)} tok
              </>
            ) : (
              "⇧↵ new line"
            )}
          </span>
          <button
            type="button"
            onClick={streaming ? onStop : submit}
            disabled={streaming ? disabled : !canSend}
            aria-label={streaming ? "Stop generating" : "Send message"}
            className={cn(
              "ml-auto grid size-8 shrink-0 cursor-pointer place-items-center rounded-full disabled:cursor-not-allowed @[400px]:ml-1",
              streaming
                ? "bg-[color:var(--bjork-text)] text-[color:var(--bjork-ring-offset)]"
                : canSend
                  ? "bg-[color:var(--bjork-accent)] text-[color:var(--bjork-accent-foreground)]"
                  : "bg-[color:var(--bjork-surface-active)] text-[color:var(--bjork-text-faint)]",
              FOCUS_RING,
              PRESS,
            )}
          >
            <StrokeMorphIcon name={streaming ? "pause" : "arrow-up"} size={16} strokeWidth={2} />
          </button>
        </div>

        {dragging && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-1 grid place-items-center rounded-[14px] border border-dashed border-[color:var(--bjork-accent)] text-[13px] font-medium text-[color:var(--bjork-accent-ink)]"
            style={{ background: "color-mix(in srgb, var(--bjork-field) 86%, var(--bjork-accent))" }}
          >
            Drop files to attach
          </div>
        )}
      </div>
      <LiveRegion message={announce} />
    </div>
  );
}
