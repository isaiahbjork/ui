"use client";

import { useState } from "react";
import { Check, Clipboard } from "lucide-react";

export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(command).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        });
      }}
      aria-label={copied ? "Copied" : "Copy install command"}
      className="flex min-h-[54px] w-full items-center justify-between gap-4 rounded-[16px] border border-[color:var(--bjork-border-muted)] bg-[color:var(--bjork-surface)] px-5 text-left font-mono text-[12px] text-[color:var(--bjork-text-medium)] shadow-[var(--bjork-shadow-surface)] transition-[background-color,border-color] duration-150 hover:border-[color:var(--bjork-border)] hover:bg-[color:var(--bjork-surface-hover)] active:scale-[0.995]"
    >
      <code className="min-w-0 truncate">{command}</code>
      {copied ? (
        <Check className="size-4 shrink-0 text-[color:var(--bjork-accent,#ec5c13)]" />
      ) : (
        <Clipboard className="size-4 shrink-0 text-[color:var(--bjork-text-muted)]" />
      )}
    </button>
  );
}
