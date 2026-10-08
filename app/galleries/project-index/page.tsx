"use client";

import {
  usePreviewMode,
  usePreviewSearchParam,
} from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import {
  ProjectIndex,
  type ProjectIndexItem,
} from "@/components/bjork-ui/galleries/project-index";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("project-index");

const work: ProjectIndexItem[] = [
  {
    id: "silt",
    title: "Silt",
    href: "https://isaiahbjork.com/silt",
    year: 2026,
    role: "Particle type playground",
    services: [
      "Type sampling",
      "Particle physics",
      "Palette system",
      "PNG export",
    ],
    outcome: { value: "20k", label: "particles set as live type" },
    category: { label: "Studio", color: "#f0705a" },
    media: {
      type: "image",
      src: "/images/project-index/silt.webp",
      alt: "The word Silt drawn in coral particles",
      focal: [0.42, 0.55],
    },
    accent: "#f0705a",
  },
  {
    id: "intaglio",
    title: "Intaglio",
    href: "https://isaiahbjork.com/intaglio",
    year: 2026,
    role: "Engraved stamp shader studio",
    services: [
      "Line engraving",
      "Perforated stamp edge",
      "Image upload",
      "Export",
    ],
    outcome: { value: "4", label: "engraving patterns" },
    category: { label: "Studio", color: "#3fa463" },
    media: {
      type: "image",
      src: "/images/project-index/intaglio.webp",
      alt: "A green engraved postage stamp of a sun over hills",
    },
    accent: "#3fa463",
  },
  {
    id: "phosphor",
    title: "Phosphor",
    href: "https://isaiahbjork.com/phosphor",
    year: 2026,
    role: "CRT shader studio",
    services: [
      "Scanlines and phosphor mask",
      "Screen curvature",
      "3D television",
      "Video input",
    ],
    outcome: { value: "12", label: "tuned display presets" },
    category: { label: "Studio", color: "#f2a541" },
    media: {
      type: "image",
      src: "/images/project-index/phosphor.webp",
      alt: "A synthwave sunset on an old television",
    },
    accent: "#f2a541",
  },
  {
    id: "sumi",
    title: "Sumi",
    href: "https://isaiahbjork.com/sumi",
    year: 2026,
    role: "Watercolor koi pond",
    services: [
      "Schooling koi",
      "Watercolor bleed",
      "Ink palettes",
      "PNG export",
    ],
    outcome: { value: "5", label: "ink palettes" },
    category: { label: "Studio", color: "#4a5fe0" },
    media: {
      type: "video",
      src: "/images/project-index/sumi-loop.webm",
      poster: "/images/project-index/sumi-poster.webp",
      alt: "Blue watercolor koi swimming",
      focal: [0.7, 0.4],
    },
    accent: "#4a5fe0",
  },
  {
    id: "periodic-table",
    title: "Periodic table",
    href: "/tables/periodic-table",
    year: 2026,
    role: "Data table component",
    services: ["Category colour system", "Hover detail", "Keyboard grid"],
    outcome: { value: "118", label: "elements in one grid" },
    category: { label: "Component", color: "#8fb6c9" },
    media: {
      type: "image",
      src: "/images/project-index/periodic-table.webp",
      alt: "The periodic table in muted category colours",
    },
    accent: "#7fb0c6",
  },
  {
    id: "timer",
    title: "Timer",
    href: "/misc/timer",
    year: 2026,
    role: "Countdown instrument",
    services: [
      "Rolling digits",
      "Drag to set dial",
      "Presets",
      "Keyboard control",
    ],
    category: { label: "Component", color: "#ec5c13" },
    media: {
      type: "image",
      src: "/images/project-index/timer.webp",
      alt: "A countdown timer reading 25:00 on a hairline dial",
    },
  },
  {
    id: "message-dock",
    title: "Message dock",
    href: "/hud/message-dock",
    year: 2025,
    role: "Messaging component",
    services: ["Spring layout", "Expanding composer", "Avatar rail"],
    category: { label: "Component", color: "#c49a4a" },
    media: {
      type: "image",
      src: "/images/project-index/message-dock.webp",
      alt: "A pill dock of three emoji avatars",
    },
    accent: "#c49a4a",
  },
  {
    id: "ruler-carousel",
    title: "Ruler carousel",
    href: "/galleries/ruler-carousel",
    year: 2025,
    role: "Gallery component",
    services: ["Scroll snapping", "Tick ruler", "Drag with momentum"],
    category: { label: "Component", color: "#9a9a9a" },
    media: {
      type: "image",
      src: "/images/project-index/ruler-carousel.webp",
      alt: "A carousel over a ruler of ticks",
    },
  },
];

const usage = `import { ProjectIndex, type ProjectIndexItem } from "@/components/bjork-ui/galleries/project-index";

const items: ProjectIndexItem[] = [
  {
    id: "silt",
    title: "Silt",
    href: "/work/silt",
    year: 2026,
    role: "Particle type playground",
    services: ["Type sampling", "Particle physics"],
    outcome: { value: "20k", label: "particles set as live type" },
    category: { label: "Studio", color: "#f0705a" },
    media: { type: "image", src: "/silt.webp", alt: "Silt" },
  },
  {
    id: "sumi",
    title: "Sumi",
    href: "/work/sumi",
    year: 2026,
    role: "Watercolor koi pond",
    services: ["Schooling koi", "Watercolor bleed"],
    media: { type: "video", src: "/sumi.mp4", poster: "/sumi.webp", alt: "Koi" },
  },
];

export function Work() {
  return <ProjectIndex heading="Selected work" items={items} />;
}`;

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
        <div className="w-[1080px] origin-center scale-[0.78]">
          <ProjectIndex
            heading="Tools and components"
            items={work}
            tone={previewTone}
            layout="hover"
            defaultActiveId="sumi"
          />
        </div>
      </div>
    );
  }

  if (!item) return null;

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A ledger of work. Titles sit on the left; on hover a dossier card rises from the bottom right and holds still while you move between rows, dissolving its media and swapping only what changes. The rules catch a soft light under the pointer. Touch screens get an expanding list."
      dependencies={["framer-motion", "next-themes", "clsx", "tailwind-merge"]}
      usageCode={usage}
      previewLayout="list"
      interactionRows={[
        {
          label: "Hover",
          value: "Card rises after a short, speed-gated dwell",
        },
        { label: "Arrow keys", value: "Move between rows; Home and End jump" },
        { label: "Esc", value: "Closes the card" },
      ]}
    >
      <div className="mx-auto w-full max-w-[1080px] px-2 py-10 sm:px-6">
        <ProjectIndex heading="Tools and components" items={work} />
      </div>
    </SimpleComponentDemoPage>
  );
}
