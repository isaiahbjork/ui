"use client";

import { useState } from "react";
import {
  CitationGroup,
  CitedText,
  SAMPLE_CITED_ANSWER,
  SAMPLE_SOURCES,
  SourceList,
} from "@/components/bjork-ui/ai/citation-chips";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("citation-chips");

function Demo() {
  const isPreview = usePreviewMode();
  const [opened, setOpened] = useState<string | null>(null);

  return (
    <div className="flex w-[min(540px,calc(100vw-56px))] flex-col items-stretch gap-5">
      {/* Keyed by mode: the preview flag resolves after hydration, and the pose lives in initial state. */}
      <CitationGroup key={isPreview ? "pose" : "live"} defaultHighlighted={isPreview ? "s2" : null}>
        <CitedText
          sources={SAMPLE_SOURCES}
          text={SAMPLE_CITED_ANSWER}
          defaultOpenIndex={isPreview ? 1 : undefined}
          onOpenSource={isPreview ? undefined : (s) => setOpened(s.domain)}
        />
        <SourceList sources={SAMPLE_SOURCES} onOpenSource={isPreview ? undefined : (s) => setOpened(s.domain)} />
      </CitationGroup>
      {!isPreview && (
        <p className="min-h-4 font-mono text-[11px] text-[color:var(--bjork-text-faint)]">
          {opened ? `Would open ${opened}` : "Hover, focus or tap a citation"}
        </p>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <SimpleComponentDemoPage
      item={item}
      description="Inline citation chips and a source list that know about each other. Hover or focus any chip for a preview with the quoted passage marked; the matching chips light up on both sides."
      dependencies={["framer-motion", "lucide-react", "clsx", "tailwind-merge"]}
      usageCode={`import { CitationGroup, CitedText, SourceList, SAMPLE_SOURCES, SAMPLE_CITED_ANSWER } from "@/components/bjork-ui/ai/citation-chips";

export function Answer() {
  return (
    <CitationGroup>
      <CitedText sources={SAMPLE_SOURCES} text={SAMPLE_CITED_ANSWER} />
      <SourceList sources={SAMPLE_SOURCES} />
    </CitationGroup>
  );
}`}
      previewScaleClassName="w-[360px]"
      previewCaptureScaleClassName="w-[540px] scale-[1.12]"
    >
      <Demo />
    </SimpleComponentDemoPage>
  );
}
