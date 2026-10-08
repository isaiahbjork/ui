"use client";

import { useState } from "react";
import { Archive, CopyPlus, Copy, Hand, Keyboard, MessageSquare, MousePointer2, Pencil, Pin, Share2, Trash2 } from "lucide-react";
import { ComponentDemoShell, ShellSegmented } from "@/components/bjork-ui/component-demo-shell";
import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { BJORK_PALETTE, type BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import {
  RadialCommandRing,
  type RadialCommandItem,
  type RadialCommandOpenOn,
} from "@/components/bjork-ui/navigation/radial-command-ring";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("radial-command-ring");

const ALL_ITEMS: RadialCommandItem[] = [
  { id: "copy", label: "Copy", icon: <Copy />, shortcut: "⌘C" },
  { id: "duplicate", label: "Duplicate", icon: <CopyPlus />, shortcut: "⌘D" },
  { id: "comment", label: "Comment", icon: <MessageSquare />, shortcut: "C" },
  { id: "share", label: "Share", icon: <Share2 />, shortcut: "S" },
  { id: "pin", label: "Pin", icon: <Pin />, shortcut: "P" },
  { id: "archive", label: "Archive", icon: <Archive />, shortcut: "A" },
  { id: "delete", label: "Delete", icon: <Trash2 />, shortcut: "⌫" },
  { id: "rename", label: "Rename", icon: <Pencil />, shortcut: "R" },
];

const usageSnippet = `import { RadialCommandRing } from "@/components/bjork-ui/navigation/radial-command-ring";

export function Demo() {
  return (
    <RadialCommandRing
      items={[
        { id: "copy", label: "Copy", icon: <Copy /> },
        { id: "share", label: "Share", icon: <Share2 /> },
        { id: "delete", label: "Delete", icon: <Trash2 /> },
      ]}
      onSelect={(id) => console.log(id)}
      openOn="both"
    >
      <Canvas />
    </RadialCommandRing>
  );
}`;

function RingSurface({
  tone,
  count,
  openOn,
  haptics,
  onPick,
  posed,
}: {
  tone: BjorkTone;
  count: number;
  openOn: RadialCommandOpenOn;
  haptics: boolean;
  onPick: (id: string, index: number) => void;
  posed: boolean;
}) {
  const p = BJORK_PALETTE[tone];
  const items = ALL_ITEMS.slice(0, count);

  if (posed) {
    // Preview pose: open at the centre, Duplicate highlighted, no chrome.
    return (
      <RadialCommandRing
        items={items}
        onSelect={() => {}}
        open
        anchor={{ x: 320, y: 200 }}
        highlightedId="duplicate"
        tone={tone}
        className="h-[400px] w-[640px]"
      >
        <span />
      </RadialCommandRing>
    );
  }

  return (
    <RadialCommandRing
      items={items}
      onSelect={(id) => onPick(id, items.findIndex((it) => it.id === id))}
      openOn={openOn}
      haptics={haptics}
      tone={tone}
      className="h-[400px] w-full overflow-hidden rounded-[20px]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[20px] border"
        style={{
          backgroundColor: p.surface,
          borderColor: p.border,
          backgroundImage: `radial-gradient(circle, ${p.hair} 1px, transparent 1.2px)`,
          backgroundSize: "16px 16px",
        }}
      />
      <p
        className="pointer-events-none absolute inset-0 grid place-items-center text-[13px]"
        style={{ color: p.textSoft }}
      >
        Hold anywhere · or right-click
      </p>
    </RadialCommandRing>
  );
}

export default function RadialCommandRingPage() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const resolvedTone = useBjorkTone();
  const tone: BjorkTone = isPreview ? (previewTheme === "light" ? "light" : "dark") : resolvedTone;
  const p = BJORK_PALETTE[tone];
  const [openOn, setOpenOn] = useState<RadialCommandOpenOn>("both");
  const [haptics, setHaptics] = useState(true);
  const [count, setCount] = useState("8");
  const [last, setLast] = useState<string | null>(null);

  if (isPreview) {
    return (
      <div className="flex min-h-screen items-center justify-center overflow-hidden" style={{ background: p.bg }}>
        <div className="scale-[1.5]">
          <RingSurface tone={tone} count={7} openOn="both" haptics={false} onPick={() => {}} posed />
        </div>
      </div>
    );
  }

  if (!item) return null;

  const demo = (
    <div className="flex h-full w-full items-center justify-center p-3 sm:p-6 lg:pt-24">
      <div className="flex w-[min(640px,calc(100vw-56px))] flex-col gap-3">
        <RingSurface
          tone={tone}
          count={Number(count)}
          openOn={openOn}
          haptics={haptics}
          onPick={(id, index) => setLast(`${id} · items[${index}]`)}
          posed={false}
        />
        <p className="font-mono text-[12px] leading-5 tabular-nums" style={{ color: p.textMuted }}>
          Last action: {last ?? "—"}
        </p>
      </div>
    </div>
  );

  return (
    <ComponentDemoShell
      item={item}
      description="Hold anywhere and flick toward an action. You choose by direction, not by hitting a target. Release inside the centre to cancel."
      dependencies={["framer-motion", "clsx"]}
      interactionRows={[
        {
          icon: <MousePointer2 className="size-5" />,
          label: "Hold and flick",
          value: "Hold for 220ms to open. Move toward a slice and release on it. The centre cancels.",
        },
        {
          icon: <Keyboard className="size-5" />,
          label: "Keyboard",
          value: "Enter opens. Arrows move, digits pick, letters jump, Escape closes.",
        },
        {
          icon: <Hand className="size-5" />,
          label: "Reduced motion",
          value: "The ring fades in place. The highlight jumps and the icons do not stagger.",
        },
      ]}
      cliCommand="npx shadcn add @bjork-ui/radial-command-ring"
      usageCode={usageSnippet}
      controls={
        <>
          <ShellSegmented
            label="Open on"
            value={openOn}
            options={[
              { value: "hold", label: "Hold" },
              { value: "contextmenu", label: "Right-click" },
              { value: "both", label: "Both" },
            ]}
            onChange={(v) => setOpenOn(v as RadialCommandOpenOn)}
          />
          <ShellSegmented
            label="Items"
            value={count}
            options={[
              { value: "4", label: "4" },
              { value: "6", label: "6" },
              { value: "8", label: "8" },
            ]}
            onChange={setCount}
          />
          <div className="flex justify-end">
            <button
              type="button"
              aria-pressed={haptics}
              onClick={() => setHaptics((v) => !v)}
              className="rounded-[10px] border px-3 py-1 font-mono text-[12px] transition active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)] focus-visible:outline-none"
              style={{ background: p.raised, borderColor: p.borderStrong, color: p.text }}
            >
              Haptics {haptics ? "on" : "off"}
            </button>
          </div>
        </>
      }
    >
      {demo}
    </ComponentDemoShell>
  );
}
