"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { ArtifactPanel, SAMPLE_ARTIFACT, type ArtifactVersion } from "@/components/bjork-ui/ai/artifact-panel";
import { ShellActions, SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("artifact-panel");

const BASE = SAMPLE_ARTIFACT.versions[2];
// The next version: a yearly savings line. Streamed a few characters per frame.
const NEXT_CODE = BASE.code
  .replace(
    '{plan.interval === "year" ? `Billed ${plan.price} yearly` : "Billed monthly"}',
    '{plan.interval === "year" ? `Billed ${plan.price} yearly, save 20%` : "Billed monthly, cancel anytime"}',
  )
  .replace("// Yearly plans show", "// Yearly plans show a savings note and");
const POSED_CHARS = 560;

function Chat({ onOpen, open }: { onOpen: () => void; open: boolean }) {
  return (
    <div className="hidden w-[240px] shrink-0 flex-col gap-3 py-2 font-bjork-alpha @[640px]:flex">
      <div className="self-end rounded-[14px] rounded-br-[6px] bg-[color:var(--bjork-surface-active)] px-3 py-2 text-[13px] leading-5 text-[color:var(--bjork-text)]">
        Make a pricing card for the Studio plan. Yearly should show the monthly price.
      </div>
      <p className="text-[13px] leading-5 text-[color:var(--bjork-text-medium)]">
        Here is a pricing card that takes a plan and shows the monthly equivalent for yearly billing.
      </p>
      <button
        type="button"
        onClick={onOpen}
        aria-pressed={open}
        className="flex h-10 cursor-pointer items-center justify-between gap-2 rounded-[10px] border border-[color:var(--bjork-border)] px-3 text-left text-[13px] font-medium text-[color:var(--bjork-text)] outline-none transition-colors hover:bg-[color:var(--bjork-surface-active)] focus-visible:ring-2 focus-visible:ring-[color:var(--bjork-accent)]"
      >
        Pricing card
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--bjork-text-faint)]">
          {open ? "open" : "view"}
        </span>
      </button>
    </div>
  );
}

function Demo({ chars, setChars }: { chars: number | null; setChars: Dispatch<SetStateAction<number | null>> }) {
  const isPreview = usePreviewMode();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (isPreview || chars === null || chars >= NEXT_CODE.length) return;
    const id = window.setTimeout(() => setChars((c) => Math.min(NEXT_CODE.length, (c ?? 0) + 9)), 30);
    return () => window.clearTimeout(id);
  }, [isPreview, chars, setChars]);

  const shown = isPreview ? POSED_CHARS : chars;
  const streaming = shown !== null && shown < NEXT_CODE.length;
  const versions: ArtifactVersion[] =
    shown === null
      ? SAMPLE_ARTIFACT.versions
      : [
          ...SAMPLE_ARTIFACT.versions,
          {
            id: "v4",
            code: NEXT_CODE.slice(0, shown),
            language: "tsx",
            createdAt: 1_760_000_400_000,
            preview: streaming ? undefined : BASE.preview,
          },
        ];

  return (
    <div className="flex w-[min(720px,calc(100vw-56px))] flex-col items-stretch gap-5">
      <div className="@container w-full">
        <div className="flex h-[460px] gap-5">
          <Chat open={open} onOpen={() => setOpen(true)} />
          <div className="min-w-0 flex-1">
            {open ? (
              <ArtifactPanel
                title={SAMPLE_ARTIFACT.title}
                kind={SAMPLE_ARTIFACT.kind}
                versions={versions}
                streaming={streaming}
                onClose={() => setOpen(false)}
              />
            ) : (
              <div className="grid h-full place-items-center rounded-[14px] border border-dashed border-[color:var(--bjork-border)]">
                <BjorkButton variant="secondary" size="sm" onClick={() => setOpen(true)}>
                  Open artifact
                </BjorkButton>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const [chars, setChars] = useState<number | null>(null);
  const streaming = chars !== null && chars < NEXT_CODE.length;

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A side canvas for generated work: Code and Preview tabs, a version stepper, copy, download and expand. While a version streams, the code view follows new lines as long as you are at the bottom."
      dependencies={["lucide-react", "clsx", "tailwind-merge"]}
      usageCode={`import { ArtifactPanel, SAMPLE_ARTIFACT } from "@/components/bjork-ui/ai/artifact-panel";

export function Demo() {
  return (
    <div className="h-[480px]">
      <ArtifactPanel
        title={SAMPLE_ARTIFACT.title}
        kind={SAMPLE_ARTIFACT.kind}
        versions={SAMPLE_ARTIFACT.versions}
        onClose={() => {}}
      />
    </div>
  );
}`}
      previewScaleClassName="w-[380px]"
      previewCaptureScaleClassName="w-[720px] scale-[1.05]"
      optionsDefaultOpen={false}
      onReset={() => setChars(null)}
      controls={
        <ShellActions>
          <BjorkButton variant="secondary" size="sm" disabled={streaming} onClick={() => setChars(0)}>
            {chars === null ? "Write v4" : "Rewrite v4"}
          </BjorkButton>
        </ShellActions>
      }
    >
      <Demo chars={chars} setChars={setChars} />
    </SimpleComponentDemoPage>
  );
}
