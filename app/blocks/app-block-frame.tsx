"use client";

import type { ReactNode } from "react";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import type { AppBlockTheme } from "@/components/bjork-ui/blocks/app-block-kit";
import { getGalleryItem } from "@/lib/bjork-gallery";
import { cn } from "@/lib/utils";

interface AppBlockFrameProps {
  slug: string;
  description: string;
  usageCode: string;
  dependencies?: string[];
  children: (context: { isPreview: boolean; theme: AppBlockTheme }) => ReactNode;
}

/**
 * Demo frame for the application blocks. On the docs page the block fills the preview column (and the whole
 * window in focus mode) so its own breakpoints show; in gallery capture it renders a fixed 1232 x 680 desktop
 * layout scaled into the card. `?frame=full` renders the block alone at window size.
 */
export function AppBlockFrame({ slug, description, usageCode, dependencies, children }: AppBlockFrameProps) {
  const item = getGalleryItem(slug);
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const theme: AppBlockTheme = previewTheme === "light" || previewTheme === "dark" ? previewTheme : "auto";
  const bare = usePreviewSearchParam("frame") === "full";

  // ?frame=full renders the block alone at the window size, for responsive checks and "open in a new tab".
  if (bare) {
    return <div className="h-dvh w-full">{children({ isPreview: false, theme })}</div>;
  }

  return (
    <SimpleComponentDemoPage
      item={item}
      description={description}
      usageCode={usageCode}
      dependencies={dependencies ?? ["framer-motion", "lucide-react"]}
      cliCommand={`npx shadcn@latest add https://ui.isaiahbjork.com/${slug}.json`}
      previewScaleClassName="w-[1280px] scale-[0.7]"
      previewLayout={isPreview ? "single" : "list"}
    >
      <div
        className={cn(
          "w-full overflow-hidden",
          isPreview
            ? "h-[680px] w-[1232px] rounded-[18px] border border-[color:var(--bjork-border)]"
            : "h-[min(860px,calc(100dvh-16px))] min-h-[620px] rounded-[24px] border border-[color:var(--bjork-border)] lg:h-[calc(100dvh-16px)]",
        )}
      >
        {children({ isPreview, theme })}
      </div>
    </SimpleComponentDemoPage>
  );
}
