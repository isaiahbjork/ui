"use client";

import { useState } from "react";
import { usePreviewMode } from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { LINK_PREVIEW_SAMPLE, LinkPreviewCard, type LinkMeta } from "@/components/bjork-ui/cards/link-preview-card";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("link-preview-card");

const COMPACT: LinkMeta = {
  title: "Tidewater 2.4 — offline sync and a faster command bar",
  description: "Release notes for the October update.",
  siteName: "Tidewater",
  themeColor: "#2f6f5e",
};

const resolveSample = (url: string) =>
  new Promise<LinkMeta>((resolve, reject) =>
    setTimeout(() => (url.includes("broken") ? reject(new Error("unreachable")) : resolve(LINK_PREVIEW_SAMPLE.meta)), 1200),
  );

export default function Page() {
  const isPreview = usePreviewMode();
  const [shown, setShown] = useState(true);
  return (
    <SimpleComponentDemoPage
      item={item}
      description="An Open Graph unfurl for chat, docs and composers. Loads with a matching skeleton, falls back to a plain link when the page can't be read, and stays a single link so it reads cleanly with a screen reader."
      dependencies={["framer-motion", "lucide-react", "next-themes"]}
      interactionRows={[
        { label: "Link", value: "Stretched link on the title; the whole card is one target" },
        { label: "Dismiss", value: "Separate button above the link, for composers" },
        { label: "States", value: "Loading skeleton per layout, fallback with retry, broken images degrade to a cover" },
      ]}
      usageCode={`import { LinkPreviewCard } from "@/components/bjork-ui/cards/link-preview-card";

<LinkPreviewCard
  url="https://fieldnotes.studio/essays/quiet-interfaces"
  resolve={(url) => fetch(\`/api/unfurl?url=\${encodeURIComponent(url)}\`).then((r) => r.json())}
  layout="large" // or "compact"
  onDismiss={() => removeAttachment(id)}
/>

// Already have the metadata:
<LinkPreviewCard url={url} meta={{ title, description, siteName, image }} layout="compact" />`}
      previewScaleClassName="w-[420px] scale-[0.9]"
    >
      {isPreview ? (
        <LinkPreviewCard meta={LINK_PREVIEW_SAMPLE.meta} />
      ) : (
        <div className="flex w-full max-w-[420px] flex-col gap-4">
          {shown ? (
            <LinkPreviewCard resolve={resolveSample} onDismiss={() => setShown(false)} />
          ) : (
            <button type="button" className="text-[13px] underline" onClick={() => setShown(true)}>
              Restore preview
            </button>
          )}
          <LinkPreviewCard url="https://tidewater.app/changelog/2-4" meta={COMPACT} layout="compact" />
          <LinkPreviewCard url="https://broken.example.org/post/481" resolve={resolveSample} layout="compact" />
        </div>
      )}
    </SimpleComponentDemoPage>
  );
}
