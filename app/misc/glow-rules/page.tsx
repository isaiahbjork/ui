"use client";

import { useEffect, useRef } from "react";
import {
  usePreviewMode,
  usePreviewSearchParam,
} from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import {
  GlowRules,
  type GlowRulesHandle,
} from "@/components/bjork-ui/misc/glow-rules";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import type { BjorkTone } from "@/components/bjork-ui/_core/palette";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("glow-rules");

const writing = [
  { title: "Trading a soft line off a sharp book", date: "2026-09-28" },
  { title: "Sizing risk on event contracts", date: "2026-07-22" },
  {
    title: "Building a high-confidence OCR + vision verification pipeline",
    date: "2026-06-08",
  },
  { title: "Self-hosting Expo updates on Cloudflare", date: "2026-05-31" },
  { title: "The physical layer of mobile automation", date: "2026-05-31" },
  { title: "Building a machine-native arena", date: "2026-05-30" },
];

const tools = [
  "Silt",
  "Intaglio",
  "Phosphor",
  "Sumi",
  "Emulsion",
  "Timer",
  "Periodic table",
  "Message dock",
];

function WritingList({
  tone,
  lit,
  large,
}: {
  tone?: BjorkTone;
  lit?: number;
  large?: boolean;
}) {
  const resolved = useBjorkTone(tone);
  const dark = resolved === "dark";
  const ref = useRef<GlowRulesHandle>(null);

  // Previews have no pointer, so park the light on a row.
  useEffect(() => {
    if (lit == null) return;
    const raf = requestAnimationFrame(() => {
      const root = ref.current?.element;
      const row = root?.querySelectorAll<HTMLElement>("li")[lit];
      if (row)
        ref.current?.pointAt(
          row.offsetWidth * 0.4,
          row.offsetTop + row.offsetHeight / 2,
        );
    });
    return () => cancelAnimationFrame(raf);
  }, [lit]);

  return (
    <GlowRules ref={ref} tone={tone} radius={[0.38, 90]}>
      <ul className="m-0 list-none p-0">
        {writing.map((post) => (
          <li key={post.title}>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className={`flex items-center justify-between gap-6 px-1 no-underline outline-none focus-visible:underline ${large ? "h-[68px] text-[19px]" : "h-14 text-[15px]"}`}
              style={{ color: dark ? "#ededed" : "#171717" }}
            >
              <span className="truncate">{post.title}</span>
              <span
                className="shrink-0 font-mono text-[12px] tabular-nums"
                style={{
                  color: dark ? "rgba(237,237,237,0.6)" : "rgba(23,23,23,0.64)",
                }}
              >
                {post.date}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </GlowRules>
  );
}

function ToolGrid({ tone }: { tone?: BjorkTone }) {
  const resolved = useBjorkTone(tone);
  const dark = resolved === "dark";
  return (
    <GlowRules
      axis="grid"
      selector="[data-cell]"
      tone={tone}
      radius={[0.3, 120]}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4">
        {tools.map((name, i) => (
          <div
            key={name}
            data-cell=""
            className="flex h-24 items-end p-3 text-[14px]"
            style={{ color: dark ? "#ededed" : "#171717" }}
          >
            <span className="mr-2 font-mono text-[11px] tabular-nums opacity-60">
              {String(i + 1).padStart(2, "0")}
            </span>
            {name}
          </div>
        ))}
      </div>
    </GlowRules>
  );
}

const usage = `import { GlowRules } from "@/components/bjork-ui/misc/glow-rules";

export function Writing({ posts }) {
  return (
    <GlowRules selector="li">
      <ul>
        {posts.map((p) => (
          <li key={p.slug}><a href={p.href}>{p.title}</a></li>
        ))}
      </ul>
    </GlowRules>
  );
}

// Grids light both axes.
<GlowRules axis="grid" selector="[data-cell]">…</GlowRules>`;

export default function Page() {
  const isPreview = usePreviewMode();
  const previewTone =
    usePreviewSearchParam("theme") === "light" ? "light" : "dark";

  if (isPreview) {
    return (
      <div
        className={
          previewTone === "light"
            ? "flex min-h-screen items-center justify-center overflow-hidden bg-[#f7f5ef]"
            : "flex min-h-screen items-center justify-center overflow-hidden bg-[#111]"
        }
      >
        <div className="w-[820px]">
          <WritingList tone={previewTone} lit={2} large />
        </div>
      </div>
    );
  }

  if (!item) return null;

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Hairline rules that catch a soft light under the pointer. One overlay draws every rule from the items' edges, so it drops onto any list, table or grid. Keyboard focus moves the light too."
      dependencies={["next-themes", "clsx", "tailwind-merge"]}
      usageCode={usage}
      previewLayout="list"
    >
      <div className="mx-auto grid w-full max-w-[880px] gap-16 px-2 py-10 sm:px-6">
        <WritingList />
        <ToolGrid />
      </div>
    </SimpleComponentDemoPage>
  );
}
