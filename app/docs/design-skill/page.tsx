import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import type { ReactNode } from "react";

import { shareMetadata } from "@/lib/component-metadata";
import { docsCard } from "@/lib/og-cards";

import { CopyCommand } from "./copy-command";

const SKILL_URL = "https://ui.isaiahbjork.com/skills/bjork-ui-design/SKILL.md";
const INSTALL = `curl -fsSL ${SKILL_URL} --create-dirs -o .claude/skills/bjork-ui-design/SKILL.md`;

export const metadata = shareMetadata(
  {
    ...docsCard,
    title: "Design skill",
    description:
      "The rules behind Björk UI as an agent skill: surfaces, colour, type, motion, charts and fewest taps, with the real values from the library.",
    route: "/docs/design-skill",
  },
  "Design skill — Björk UI"
);

// The page renders the same SKILL.md that agents download, so the two can't drift.
async function loadSkill() {
  const file = await readFile(path.join(process.cwd(), "public/skills/bjork-ui-design/SKILL.md"), "utf8");
  return file.replace(/^---\n[\s\S]*?\n---\n/, "");
}

/** Inline markdown: `code`, **bold** and [links](url). */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/[^\s)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) {
      out.push(
        <code key={k++} className="rounded-[6px] bg-[color:var(--bjork-field-inset)] px-1.5 py-px font-mono text-[0.86em] text-[color:var(--bjork-text)]">
          {m[1]}
        </code>
      );
    } else if (m[2]) {
      out.push(
        <strong key={k++} className="font-medium text-[color:var(--bjork-text)]">
          {inline(m[2])}
        </strong>
      );
    } else {
      const href = m[4] ?? m[5];
      out.push(
        <a key={k++} href={href} className="text-[color:var(--bjork-text)] underline decoration-[color:var(--bjork-border-strong)] underline-offset-4 transition-colors hover:decoration-[color:var(--bjork-accent,#ec5c13)]">
          {m[3] ?? m[5]}
        </a>
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

function render(md: string): ReactNode[] {
  const lines = md.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
      i += 1;
      blocks.push(
        <pre key={k++} className="overflow-x-auto rounded-[16px] border border-[color:var(--bjork-border-muted)] bg-[color:var(--bjork-field-inset)] px-5 py-4 font-mono text-[12px] leading-[1.7] text-[color:var(--bjork-text-medium)] shadow-[var(--bjork-shadow-inset)]">
          {body.join("\n")}
        </pre>
      );
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      blocks.push(
        level === 1 ? null : level === 2 ? (
          <h2 key={k++} className="!mt-16 text-[22px] font-medium tracking-[-0.02em] text-[color:var(--bjork-text)]">
            {inline(h[2])}
          </h2>
        ) : (
          <h3 key={k++} className="!mt-10 font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--bjork-text-muted)]">
            {inline(h[2])}
          </h3>
        )
      );
      i += 1;
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
      const [head, , ...body] = rows;
      blocks.push(
        <div key={k++} className="overflow-x-auto rounded-[18px] border border-[color:var(--bjork-border-muted)] bg-[color:var(--bjork-surface)] shadow-[var(--bjork-shadow-surface)]">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr>
                {cells(head).map((c, j) => (
                  <th key={j} className="border-b border-[color:var(--bjork-border-muted)] px-4 py-3 font-mono text-[10px] font-normal uppercase tracking-[0.12em] text-[color:var(--bjork-text-muted)]">
                    {inline(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri} className="border-b border-[color:var(--bjork-border-muted)] last:border-0">
                  {cells(r).map((c, j) => (
                    <td key={j} className={j === 0 ? "px-4 py-3 align-top text-[color:var(--bjork-text)]" : "px-4 py-3 align-top text-[color:var(--bjork-text-medium)]"}>
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    const list = /^(\d+\.|-)\s+/;
    if (list.test(line)) {
      const ordered = /^\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && (list.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) {
        if (list.test(lines[i])) items.push(lines[i].replace(list, ""));
        else items[items.length - 1] += `\n${lines[i].trim().replace(/^-\s+/, "")}`;
        i += 1;
      }
      const Tag = ordered ? "ol" : "ul";
      blocks.push(
        <Tag key={k++} className={ordered ? "list-decimal space-y-2.5 pl-5 marker:font-mono marker:text-[12px] marker:text-[color:var(--bjork-text-soft)]" : "space-y-2.5"}>
          {items.map((it, j) => {
            const [first, ...sub] = it.split("\n");
            return (
              <li key={j} className={ordered ? "pl-1" : "relative pl-5 before:absolute before:left-0 before:top-[0.72em] before:h-px before:w-2.5 before:bg-[color:var(--bjork-text-soft)]"}>
                {inline(first)}
                {sub.length ? (
                  <ul className="mt-2 space-y-1.5">
                    {sub.map((s, si) => (
                      <li key={si} className="relative pl-4 before:absolute before:left-0 before:top-[0.72em] before:size-1 before:rounded-full before:bg-[color:var(--bjork-text-faint)]">
                        {inline(s)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </Tag>
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#|\||```|-\s|\d+\.\s)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={k++}>{inline(para.join(" "))}</p>);
  }
  return blocks;
}

export default async function DesignSkillPage() {
  const skill = await loadSkill();

  return (
    <main className="min-h-screen bg-[color:var(--bjork-bg)] text-[color:var(--bjork-text)]">
      <div className="mx-auto max-w-[760px] px-4 pb-32 pt-8 sm:px-6 md:pt-10">
        <nav className="flex items-center gap-2 text-[13px] text-[color:var(--bjork-text-muted)]">
          <Link href="/" className="transition-colors hover:text-[color:var(--bjork-text)]">
            Components
          </Link>
          <span aria-hidden="true" className="text-[color:var(--bjork-text-faint)]">
            ·
          </span>
          <span className="text-[color:var(--bjork-text-medium)]">Design skill</span>
        </nav>

        <header className="mt-20">
          <p className="font-mono text-[12px] uppercase leading-none tracking-[0.14em] text-[color:var(--bjork-text-muted)]">Design skill</p>
          <h1 className="mt-7 text-[28px] font-medium leading-[1.45] tracking-[-0.025em] md:text-[30px]">
            The rules behind Björk UI, written for your coding agent. Drop it in and new components come out dark, lit and good to touch.
          </h1>
        </header>

        <section className="mt-16 space-y-5">
          <p className="font-mono text-[12px] uppercase leading-none tracking-[0.14em] text-[color:var(--bjork-text-muted)]">Install for Claude Code</p>
          <CopyCommand command={INSTALL} />
          <p className="text-[14px] leading-[1.7] text-[color:var(--bjork-text-muted)]">
            Or read the{" "}
            <a href="/skills/bjork-ui-design/SKILL.md" className="text-[color:var(--bjork-text)] underline decoration-[color:var(--bjork-border-strong)] underline-offset-4">
              raw SKILL.md
            </a>{" "}
            and paste it into any agent&apos;s instructions.
          </p>
        </section>

        <article className="mt-20 space-y-6 text-[15px] leading-[1.75] text-[color:var(--bjork-text-medium)]">{render(skill)}</article>
      </div>
    </main>
  );
}
