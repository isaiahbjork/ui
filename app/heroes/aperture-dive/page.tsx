"use client";

import { useMemo } from "react";
import { Aperture, MonitorSmartphone, ScrollText } from "lucide-react";
import { ComponentDemoShell } from "@/components/bjork-ui/component-demo-shell";
import {
  ApertureDive,
  ApertureDiveTarget,
  type ApertureDivePanel,
} from "@/components/bjork-ui/heroes/aperture-dive";
import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("aperture-dive");

const PHONE = { fit: "contain" as const, backdrop: "#000000", aspect: 480 / 998, inset: 0.02 };

function demoPanels(tone: "light" | "dark"): ApertureDivePanel[] {
  const shot = (slug: string) => `/component-previews/${slug}${tone === "light" ? "-light" : ""}.png`;
  return [
    {
      id: "glass",
      title: "Glass",
      meta: "iOS · Skin analysis",
      media: { type: "video", src: "/aperture-dive/glass-onboarding.mp4", poster: "/aperture-dive/glass-onboarding.jpg", ...PHONE },
    },
    { id: "hover-image-gallery", title: "Hover image gallery", media: { type: "image", src: shot("hover-image-gallery") } },
    { id: "voice-powered-orb", title: "Voice powered orb", media: { type: "image", src: shot("voice-powered-orb") } },
    {
      id: "betlytics-tracking",
      title: "Betlytics",
      meta: "iOS · Bet tracking",
      media: { type: "video", src: "/aperture-dive/betlytics-tracking.mp4", poster: "/aperture-dive/betlytics-tracking.jpg", ...PHONE },
    },
    { id: "bonuses", title: "Bonuses card", media: { type: "image", src: shot("bonuses-incentives-card") } },
    { id: "hud-frame", title: "HUD frame", media: { type: "image", src: shot("hud-frame") } },
    { id: "timer", title: "Timer", media: { type: "image", src: shot("timer") } },
    {
      id: "betlytics-chat",
      title: "Betlytics chat",
      meta: "iOS · AI analyst",
      media: { type: "video", src: "/aperture-dive/betlytics-ai-chat.mp4", poster: "/aperture-dive/betlytics-ai-chat.jpg", ...PHONE },
    },
    { id: "product-reveal", title: "Product reveal card", media: { type: "image", src: shot("product-reveal-card") } },
    { id: "radial-chart", title: "Animated radial chart", media: { type: "image", src: shot("animated-radial-chart") } },
  ];
}

function NextSection({ tone }: { tone: "light" | "dark" }) {
  const ink = tone === "light" ? "text-[#1a1815]" : "text-[#f2eee7]";
  const soft = tone === "light" ? "text-[#1a1815]/55" : "text-[#f2eee7]/55";
  const line = tone === "light" ? "border-[#1a1815]/12" : "border-[#f2eee7]/12";
  return (
    <section className={`relative px-5 pb-32 pt-24 sm:px-8 sm:pt-28 ${ink}`}>
      <div className="mx-auto max-w-[1120px]">
        <div className={`mb-10 flex items-baseline justify-between border-b pb-4 ${line}`}>
          <span className={`font-mono text-[11px] uppercase tracking-[0.16em] ${soft}`}>01 — Featured</span>
          <span className={`font-mono text-[11px] uppercase tracking-[0.16em] tabular-nums ${soft}`}>2026</span>
        </div>
        <div className="mx-auto w-full max-w-[680px]">
          <ApertureDiveTarget className="rounded-[22px]" />
        </div>
        <div className="mx-auto mt-10 grid max-w-[680px] gap-8 sm:grid-cols-[1fr_1.3fr]">
          <div>
            <h2 className="text-[34px] font-medium leading-none tracking-[-0.03em]">Glass</h2>
            <p className={`mt-3 font-mono text-[11px] uppercase tracking-[0.16em] ${soft}`}>iOS · Skin analysis</p>
          </div>
          <p className={`text-[15px] leading-relaxed ${soft}`}>
            A calm onboarding for a skin analysis app: one face, four numbers, nothing else on screen. The
            scan resolves into a score you can read at a glance.
          </p>
        </div>
      </div>
    </section>
  );
}

function FullDemo({ tone, renderer }: { tone: "light" | "dark"; renderer: "auto" | "css" | "webgl" }) {
  const panels = useMemo(() => demoPanels(tone), [tone]);
  return (
    <ApertureDive
      panels={panels}
      focusIndex={0}
      tone={tone}
      renderer={renderer}
      eyebrowLeft="Isaiah Bjorklund"
      eyebrowRight="Selected work"
      headline="Interfaces, in orbit."
    >
      <NextSection tone={tone} />
    </ApertureDive>
  );
}

export default function ApertureDivePage() {
  const isPreview = usePreviewMode();
  const isFull = usePreviewSearchParam("full") === "1";
  const themeParam = usePreviewSearchParam("theme");
  const rendererParam = usePreviewSearchParam("renderer");
  const resolved = useBjorkTone();
  const tone = themeParam === "light" ? "light" : themeParam === "dark" ? "dark" : resolved;

  if (isPreview) {
    return (
      <div className={tone === "light" ? "light" : "dark"}>
        <ApertureDive
          panels={demoPanels(tone)}
          tone={tone}
          staticProgress={0}
          scrollHint="Scroll to dive"
          headline="Interfaces, in orbit."
        />
      </div>
    );
  }

  if (isFull) return <FullDemo tone={tone} renderer={rendererParam === "css" ? "css" : "auto"} />;

  if (!item) return null;

  return (
    <ComponentDemoShell
      item={item}
      description="A hero that starts straight above a ring of screens, an eclipse, and dives into it on native scroll. It lands square on one screen, then hands that screen to a real element in the next section."
      dependencies={["three", "next-themes"]}
      interactionRows={[
        {
          icon: <ScrollText className="size-5" />,
          label: "Native scroll",
          value: "A sticky track drives an authored keyframe table. No scroll hijack, and it plays backwards too.",
        },
        {
          icon: <Aperture className="size-5" />,
          label: "Real handoff",
          value: "The landed screen flies out of the scene as a DOM element and becomes the card below.",
        },
        {
          icon: <MonitorSmartphone className="size-5" />,
          label: "Fallbacks",
          value: "CSS 3D without WebGL, a still poster under reduced motion, a lighter path on phones.",
        },
      ]}
      cliCommand="npx shadcn add https://ui.isaiahbjork.com/aperture-dive.json"
      usageCode={`import { ApertureDive, ApertureDiveTarget } from "@/components/bjork-ui/heroes/aperture-dive";

const panels = [
  { id: "glass", title: "Glass", media: { type: "video", src: "/glass.mp4", poster: "/glass.jpg", fit: "contain" } },
  { id: "orb", title: "Voice orb", media: { type: "image", src: "/orb.png" } },
  // ...6 to 12 screens
];

export function Hero() {
  return (
    <ApertureDive panels={panels} headline="Interfaces, in orbit." eyebrowLeft="Studio" eyebrowRight="Selected work">
      <section className="mx-auto max-w-[680px] py-24">
        <ApertureDiveTarget className="rounded-[22px]" />
      </section>
    </ApertureDive>
  );
}`}
      previewClassName="p-0"
    >
      <div className="relative h-[620px] w-full overflow-hidden rounded-[18px]">
        <iframe
          key={tone}
          title="Aperture Dive demo"
          src={`/heroes/aperture-dive?full=1&theme=${tone}`}
          className="absolute inset-0 h-full w-full border-0"
        />
        <a
          href={`/heroes/aperture-dive?full=1&theme=${tone}`}
          target="_blank"
          rel="noreferrer"
          className="absolute right-3 top-3 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-white/80 backdrop-blur-md transition-colors hover:text-white"
        >
          Open full screen
        </a>
      </div>
    </ComponentDemoShell>
  );
}
