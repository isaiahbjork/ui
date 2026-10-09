"use client";

import { useEffect, useRef, useState } from "react";
import {
  SAMPLE_FOLLOWUPS,
  SAMPLE_STARTERS,
  SAMPLE_STARTERS_ALT,
  SuggestedPrompts,
} from "@/components/bjork-ui/ai/suggested-prompts";
import { ShellActions, SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { BjorkButton } from "@/components/bjork-ui/primitives/button";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("suggested-prompts");
const SETS = [SAMPLE_STARTERS, SAMPLE_STARTERS_ALT];

function Demo({ loading }: { loading: boolean }) {
  const isPreview = usePreviewMode();
  const [set, setSet] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <div className="flex w-[min(600px,calc(100vw-56px))] flex-col gap-8">
      <SuggestedPrompts
        label="Try asking"
        prompts={isPreview ? SAMPLE_STARTERS : SETS[set]}
        loading={!isPreview && loading}
        onShuffle={isPreview ? undefined : () => setSet((s) => (s + 1) % SETS.length)}
        onSelect={(p) => setPicked(p.title)}
      />
      <SuggestedPrompts
        variant="chips"
        label="Follow up"
        prompts={SAMPLE_FOLLOWUPS}
        loading={!isPreview && loading}
        onSelect={(p) => setPicked(p.title)}
      />
      {!isPreview && (
        <p className="min-h-4 max-w-full truncate text-center font-mono text-[11px] text-[color:var(--bjork-text-faint)]">
          {picked ? `onSelect → ${picked}` : "Pick a prompt, or use the arrow keys"}
        </p>
      )}
    </div>
  );
}

export default function Page() {
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const reload = () => {
    setLoading(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLoading(false), 1400);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="Starter prompts for an empty chat and follow-up chips after an answer. Arrow keys move through the set, it blurs in quickly, shows skeletons while suggestions stream in, and Shuffle crossfades to a new set."
      dependencies={["framer-motion", "lucide-react", "clsx", "tailwind-merge"]}
      usageCode={`import { SuggestedPrompts, SAMPLE_STARTERS, SAMPLE_FOLLOWUPS } from "@/components/bjork-ui/ai/suggested-prompts";

export function EmptyChat({ send }: { send: (text: string) => void }) {
  return (
    <>
      <SuggestedPrompts label="Try asking" prompts={SAMPLE_STARTERS} onSelect={(p) => send(p.prompt ?? p.title)} />
      <SuggestedPrompts variant="chips" prompts={SAMPLE_FOLLOWUPS} onSelect={(p) => send(p.title)} />
    </>
  );
}`}
      previewScaleClassName="w-[360px]"
      previewCaptureScaleClassName="w-[600px] scale-[1.05]"
      optionsDefaultOpen={false}
      onReset={() => {
        window.clearTimeout(timer.current);
        setLoading(false);
      }}
      controls={
        <ShellActions>
          <BjorkButton variant="secondary" size="sm" onClick={reload}>
            Stream in again
          </BjorkButton>
        </ShellActions>
      }
    >
      <Demo loading={loading} />
    </SimpleComponentDemoPage>
  );
}
