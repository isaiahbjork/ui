"use client";

import { useEffect, useState } from "react";
import {
  ShellActions,
  ShellSegmented,
  SimpleComponentDemoPage,
} from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { BjorkSelect } from "@/components/bjork-ui/primitives/select";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import {
  StrokeMorphIcon,
  strokeIcons,
  type StrokeIconName,
} from "@/components/bjork-ui/utilities/stroke-morph-icon";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("stroke-morph-icon");

const ALL_NAMES = Object.keys(strokeIcons) as StrokeIconName[];

// Each cell toggles between its names on click. The arrow cell cycles through all four.
const CELLS: StrokeIconName[][] = [
  ["menu", "close"],
  ["play", "pause"],
  ["chevron-down", "chevron-up"],
  ["plus", "minus"],
  ["arrow-right", "arrow-down", "arrow-left", "arrow-up"],
  ["dot", "check"],
  ["busy", "check"],
  ["equal", "close"],
];

const STROKE_WIDTHS = [1.25, 2, 2.75];
const SPRINGS = {
  standard: { stiffness: 380, damping: 30, mass: 0.7 },
  snappy: { stiffness: 400, damping: 25, mass: 1 },
  soft: { stiffness: 200, damping: 25, mass: 1.2 },
} as const;
type SpringPreset = keyof typeof SPRINGS;

const DEFAULT_HERO: StrokeIconName = "close";
const DEFAULT_CELL_STEPS: number[] = CELLS.map(() => 0);
const DEFAULT_STROKE = 2;
const DEFAULT_SPRING: SpringPreset = "standard";

// Preview-only attract loop. The hero holds `close` for the first 3s so the 2.6s capture is posed.
const ATTRACT: StrokeIconName[] = [
  "menu",
  "close",
  "plus",
  "minus",
  "check",
  "play",
  "pause",
  "arrow-right",
  "arrow-down",
  "busy",
];

function randomNameOtherThan(current: StrokeIconName): StrokeIconName {
  const pool = ALL_NAMES.filter((name) => name !== current);
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function Page() {
  const isPreview = usePreviewMode();
  const [heroName, setHeroName] = useState<StrokeIconName>(DEFAULT_HERO);
  const [cellStep, setCellStep] = useState<number[]>(DEFAULT_CELL_STEPS);
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_STROKE);
  const [springPreset, setSpringPreset] = useState<SpringPreset>(DEFAULT_SPRING);

  useEffect(() => {
    if (!isPreview) return;
    let index = 0;
    let timer = 0;
    const tick = () => {
      setHeroName(ATTRACT[index % ATTRACT.length]);
      index += 1;
      timer = window.setTimeout(tick, 900);
    };
    timer = window.setTimeout(tick, 3000);
    return () => window.clearTimeout(timer);
  }, [isPreview]);

  const spring = SPRINGS[springPreset];

  const stepCell = (cell: number) => {
    setCellStep((steps) =>
      steps.map((step, i) => (i === cell ? (step + 1) % CELLS[cell].length : step)),
    );
  };

  const reset = () => {
    setHeroName(DEFAULT_HERO);
    setCellStep(DEFAULT_CELL_STEPS);
    setStrokeWidth(DEFAULT_STROKE);
    setSpringPreset(DEFAULT_SPRING);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="An icon set where every glyph is three lines, so any icon can become any other as one object."
      dependencies={["framer-motion", "clsx", "tailwind-merge"]}
      usageCode={`import { StrokeMorphIcon } from "@/components/bjork-ui/utilities/stroke-morph-icon";

export function Demo() {
  const [open, setOpen] = useState(false);

  return (
    <button type="button" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)}>
      <StrokeMorphIcon name={open ? "close" : "menu"} />
    </button>
  );
}`}
      previewScaleClassName="w-[420px]"
      previewCaptureScaleClassName="w-[420px] scale-[1.7]"
      onReset={reset}
      controls={
        <>
          <ShellActions label="Morph">
            <label className="inline-flex items-center">
              <span className="sr-only">Morph the hero icon to</span>
              <BjorkSelect
                options={ALL_NAMES.map((name) => ({ value: name, label: name }))}
                value={heroName}
                onValueChange={(value) => setHeroName(value as StrokeIconName)}
              />
            </label>
            <BjorkButton variant="secondary" size="sm" onClick={() => setHeroName((n) => randomNameOtherThan(n))}>
              Random
            </BjorkButton>
          </ShellActions>
          <ShellSegmented
            label="Stroke"
            value={strokeWidth}
            options={STROKE_WIDTHS.map((width) => ({ value: width, label: String(width) }))}
            onChange={setStrokeWidth}
          />
          <ShellSegmented
            label="Spring"
            value={springPreset}
            options={(Object.keys(SPRINGS) as SpringPreset[]).map((preset) => ({ value: preset, label: preset }))}
            onChange={setSpringPreset}
          />
        </>
      }
    >
      <div className="flex w-full flex-col items-center gap-7">
        <StrokeMorphIcon
          name={heroName}
          size={96}
          strokeWidth={strokeWidth}
          spring={spring}
          label={heroName}
        />

        <div className="grid grid-cols-4 gap-3">
          {CELLS.map((names, cell) => {
            const current = names[cellStep[cell]];
            const next = names[(cellStep[cell] + 1) % names.length];
            return (
              <button
                key={cell}
                type="button"
                aria-label={`Morph ${current} to ${next}`}
                onClick={() => stepCell(cell)}
                className="flex size-[72px] cursor-pointer items-center justify-center rounded-[14px] border border-[var(--bjork-border,#232323)] bg-[var(--bjork-surface,#121212)] outline-none transition-[border-color] duration-150 ease-out hover:border-[var(--bjork-border-strong,#343434)] focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bjork-ring-offset,#050505)] active:scale-[0.97]"
              >
                <StrokeMorphIcon name={current} size={28} strokeWidth={strokeWidth} spring={spring} />
              </button>
            );
          })}
        </div>
      </div>
    </SimpleComponentDemoPage>
  );
}
