"use client";

import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Code2,
  Copy,
  Download,
  Grip,
  Home,
  Maximize2,
  Minimize2,
  Moon,
  RefreshCcw,
  RotateCw,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
} from "framer-motion";
import { cn } from "@/lib/utils";
import { galleryItems, type GalleryItem } from "@/lib/bjork-gallery";
import { BjorkSlider } from "@/components/bjork-ui/primitives/slider";
import { WebsiteShaderCanvas } from "@/components/bjork-ui/shaders/website-shader";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";

interface InfoRow {
  icon?: ReactNode;
  label: string;
  value: string;
}

interface ComponentDemoShellProps {
  item: GalleryItem;
  children: ReactNode;
  controls?: ReactNode;
  description: string;
  dependencies?: string[];
  interactionRows?: InfoRow[];
  cliCommand?: string;
  usageCode?: string;
  details?: ReactNode;
  note?: ReactNode;
  onReset?: () => void;
  showOptionsReset?: boolean;
  previewTone?: "dark" | "light";
  previewClassName?: string;
  previewInnerClassName?: string;
  previewLayout?: "single" | "list";
}

interface SimpleComponentDemoPageProps {
  item: GalleryItem | undefined;
  children: ReactNode;
  description?: string;
  dependencies?: string[];
  interactionRows?: InfoRow[];
  cliCommand?: string;
  usageCode?: string;
  details?: ReactNode;
  note?: ReactNode;
  previewScaleClassName?: string;
  previewCaptureScaleClassName?: string;
  previewClassName?: string;
  previewInnerClassName?: string;
  previewLayout?: "single" | "list";
}

const shellPalettes = {
  dark: {
    mode: "dark",
    root: "bg-[#080808] text-[#ededed] selection:bg-[#ec5c13]/24 selection:text-[#fff2ea]",
    wash:
      "bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.04),transparent_34%),linear-gradient(to_bottom,#080808,#050505)]",
    preview: "bg-[#111] text-[#ededed]",
    previewInner: "bg-[#111]",
    toolbar:
      "border-[#232323] bg-[#181818]/90 shadow-[inset_0_7px_14px_rgba(255,255,255,0.03),inset_0_0.5px_0.5px_rgba(255,255,255,0.06),0_14px_20px_-6px_rgba(0,0,0,0.45)]",
    options:
      "border-[#202020] bg-[linear-gradient(180deg,rgba(24,24,24,0.96),rgba(15,15,15,0.94))]",
    optionsMuted: "text-[#ededed]/35 hover:bg-[#232323] hover:text-[#ededed]/65",
    optionsText: "text-[#ededed]/50",
    optionsButton: "text-[#ededed]/35 hover:text-[#ededed]",
  },
  light: {
    mode: "light",
    root: "bg-[#f4f2ec] text-[#171717] selection:bg-[#ec5c13]/18 selection:text-[#111111]",
    wash:
      "bg-[radial-gradient(circle_at_68%_18%,rgba(10,10,10,0.045),transparent_34%),linear-gradient(to_bottom,#f7f5ef,#ece8df)]",
    preview: "border-0 bg-[#f7f5ef] text-[#151515] shadow-none",
    previewInner: "bg-[#f7f5ef]",
    toolbar:
      "border-[#eee6db] bg-[#fffcf6]/92 shadow-[inset_0_7px_14px_rgba(88,72,49,0.045),inset_0_0.5px_0.5px_rgba(255,255,255,0.92),inset_1px_0_0_rgba(88,72,49,0.026),inset_-1px_0_0_rgba(255,255,255,0.68),0_14px_22px_-9px_rgba(66,52,33,0.11)]",
    options:
      "border-[#eee6db] bg-[#fffcf6]/92 shadow-[inset_0_7px_14px_rgba(88,72,49,0.045),inset_0_0.5px_0.5px_rgba(255,255,255,0.92),inset_1px_0_0_rgba(88,72,49,0.026),inset_-1px_0_0_rgba(255,255,255,0.68),0_14px_22px_-9px_rgba(66,52,33,0.11)]",
    optionsMuted: "text-[#171717]/34 hover:bg-[#f1ece3] hover:text-[#171717]/62",
    optionsText: "text-[#171717]/46",
    optionsButton: "text-[#171717]/34 hover:text-[#171717]/70",
  },
} as const;

type ShellPalette = (typeof shellPalettes)[keyof typeof shellPalettes];
const sidebarStorageKey = "bjork-ui-component-index-open";
const sidebarScrollStorageKey = "bjork-ui-component-index-scroll-top";
const desktopSidebarMediaQuery = "(min-width: 1024px)";
const docsScrollStorageKey = "bjork-ui-docs-scroll-top";
const sidebarSortStorageKey = "bjork-ui-component-index-sort-mode";
type SidebarSortMode = "collection" | "id";

const sidebarCollectionOrder = [
  "UI",
  "Charts",
  "Interactive",
  "AI",
  "Galleries",
  "Heroes",
  "Shaders",
  "Tables",
  "Cards",
  "Scheduling",
  "Badges",
  "Buttons",
  "Controls",
  "Navigation",
  "Utilities",
  "HUD",
] as const;

function getSidebarCollectionRank(collection: string) {
  const index = sidebarCollectionOrder.findIndex((entry) => entry === collection);

  return index === -1 ? sidebarCollectionOrder.length : index;
}

function isMobileComponentIndexViewport() {
  return (
    typeof window !== "undefined" &&
    !window.matchMedia(desktopSidebarMediaQuery).matches
  );
}

export function ComponentDemoShell({
  item,
  children,
  controls,
  description,
  dependencies = [],
  cliCommand,
  usageCode,
  details,
  note,
  onReset,
  showOptionsReset = true,
  previewTone = "dark",
  previewClassName,
  previewInnerClassName,
  previewLayout = "single",
}: ComponentDemoShellProps) {
  const [sidebarOpen, setSidebarOpenState] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<GalleryItem | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [themeMounted, setThemeMounted] = useState(false);
  const [documentTheme, setDocumentTheme] = useState<"light" | "dark" | null>(null);
  const [source, setSource] = useState("");
  const [sourcePath, setSourcePath] = useState(item.sourcePath);
  const [sourceSlug, setSourceSlug] = useState("");
  const [sourceLoading, setSourceLoading] = useState(false);
  const previewSurfaceRef = useRef<HTMLDivElement>(null);
  const optionsDragControls = useDragControls();
  const shouldReduceMotion = useReducedMotion();
  const { resolvedTheme, setTheme, theme } = useTheme();

  const setSidebarOpen = useCallback((open: boolean) => {
    setSidebarOpenState(open);

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(sidebarStorageKey, open ? "true" : "false");
    }
  }, []);

  useEffect(() => {
    setSidebarOpenState(
      window.sessionStorage.getItem(sidebarStorageKey) === "true"
    );
  }, []);

  const sortedItems = useMemo(() => {
    return [...galleryItems].sort((a, b) => {
      const aNumber = Number(a.id.replace(/\D/g, ""));
      const bNumber = Number(b.id.replace(/\D/g, ""));
      return aNumber - bNumber;
    });
  }, []);

  useEffect(() => {
    if (!showCode) return;
    if (sourceSlug === item.slug && source) return;

    let mounted = true;

    async function loadSource() {
      setSourceLoading(true);
      try {
        const response = await fetch(`/api/component-source?slug=${item.slug}`);
        const payload = (await response.json()) as {
          source?: string;
          path?: string;
          error?: string;
        };

        if (!mounted) return;

        setSource(payload.source ?? payload.error ?? "Source unavailable");
        setSourcePath(payload.path ?? item.sourcePath);
        setSourceSlug(item.slug);
      } catch {
        if (!mounted) return;
        setSource("Source unavailable");
        setSourcePath(item.sourcePath);
        setSourceSlug(item.slug);
      } finally {
        if (mounted) setSourceLoading(false);
      }
    }

    loadSource();

    return () => {
      mounted = false;
    };
  }, [item.slug, item.sourcePath, showCode, source, sourceSlug]);

  useEffect(() => {
    const syncDocumentTheme = () => {
      const root = document.documentElement;

      setDocumentTheme(
        root.classList.contains("light")
          ? "light"
          : root.classList.contains("dark")
            ? "dark"
            : null
      );
    };

    syncDocumentTheme();
    setThemeMounted(true);

    const observer = new MutationObserver(syncDocumentTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  const showLeftPanel = !isFocusMode;
  const activeTheme = documentTheme ?? (theme === "system" ? resolvedTheme : (theme ?? resolvedTheme));
  const isLightTheme = themeMounted && activeTheme === "light";
  const palette = isLightTheme ? shellPalettes.light : shellPalettes.dark;
  const isLightPreview = previewTone === "light" || isLightTheme;
  const isListPreview = previewLayout === "list";
  const layoutTransition = shouldReduceMotion
    ? ({ duration: 0.12, ease: "easeOut" } as const)
    : ({
        type: "spring",
        stiffness: 260,
        damping: 32,
        mass: 0.82,
      } as const);

  const resetPreview = () => {
    setPreviewKey((value) => value + 1);
    onReset?.();
  };

  return (
    <div className={cn("relative min-h-dvh lg:h-screen lg:overflow-hidden", palette.root)}>
      <div className={cn("pointer-events-none fixed inset-0", palette.wash)} />

      <ComponentIndexOverlay
        open={sidebarOpen}
        setOpen={setSidebarOpen}
        item={item}
        items={sortedItems}
        hoveredItem={hoveredItem}
        setHoveredItem={setHoveredItem}
        shouldReduceMotion={Boolean(shouldReduceMotion)}
        palette={palette}
      />

      <motion.main
        layout
        transition={layoutTransition}
        className={cn(
          "relative z-10 grid min-h-dvh w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)] overflow-visible p-2 lg:h-screen lg:overflow-hidden",
          showLeftPanel ? "gap-2" : "gap-0",
          showLeftPanel
            ? "lg:grid-cols-[minmax(420px,1fr)_minmax(520px,1fr)]"
            : "lg:grid-cols-[0_minmax(0,1fr)]"
        )}
      >
        <MobileComponentBreadcrumb
          item={item}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          shouldReduceMotion={Boolean(shouldReduceMotion)}
          palette={palette}
        />

        <motion.section
          layout
          transition={layoutTransition}
          className={cn(
            "relative order-3 min-h-0 w-full min-w-0 max-w-full overflow-visible lg:order-1 lg:overflow-hidden",
            !showLeftPanel && "pointer-events-none opacity-0"
          )}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {showLeftPanel && (
              <motion.div
                key="docs-panel"
                layout
                initial={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, x: -12, filter: "blur(3px)" }
                }
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                exit={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, x: -10, filter: "blur(3px)" }
                }
                transition={layoutTransition}
                className="h-auto will-change-transform lg:h-full"
              >
                <DocsPanel
                  item={item}
                  sidebarOpen={sidebarOpen}
                  setSidebarOpen={setSidebarOpen}
                  shouldReduceMotion={Boolean(shouldReduceMotion)}
                  description={description}
                  dependencies={dependencies}
                  cliCommand={cliCommand}
                  usageCode={usageCode}
                  details={details}
                  note={note}
                  palette={palette}
                />
              </motion.div>
            )}
          </AnimatePresence>

        </motion.section>

        <motion.section
          layout
          transition={layoutTransition}
          className={cn(
            "order-2 w-full min-w-0 max-w-full lg:order-2 lg:min-h-0",
            isListPreview
              ? "min-h-0 overflow-visible lg:overflow-hidden"
              : "min-h-[520px] overflow-hidden",
            isFocusMode && "lg:col-start-2"
          )}
        >
          <motion.div
            layout
            transition={layoutTransition}
            ref={previewSurfaceRef}
            style={{ willChange: "transform" }}
            className={cn(
              "relative flex w-full min-w-0 max-w-full",
              isListPreview
                ? "hide-scrollbar h-auto min-h-0 items-start justify-center overflow-visible rounded-none bg-transparent p-0 lg:h-full lg:overflow-y-auto"
                : cn(
                    "h-full min-h-0 items-center justify-center overflow-hidden rounded-[24px] p-2",
                    isLightPreview ? shellPalettes.light.preview : palette.preview,
                  ),
              previewClassName
            )}
          >
            {!isListPreview && (
              <div className={cn("absolute right-6 top-6 z-30 flex rounded-[18px] border p-1.5 backdrop-blur-sm", palette.toolbar)}>
                <ToolbarButton
                  label={isFocusMode ? "Minimize preview" : "Maximize preview"}
                  onClick={() => setIsFocusMode((value) => !value)}
                  active={isFocusMode}
                >
                  {isFocusMode ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                </ToolbarButton>
                <ToolbarButton label="Reset" onClick={resetPreview}>
                  <RotateCw className="size-4" />
                </ToolbarButton>
                <ToolbarButton label="Source" onClick={() => setShowCode((value) => !value)} active={showCode}>
                  <Code2 className="size-4" />
                </ToolbarButton>
                <ToolbarButton
                  label={isLightTheme ? "Use dark mode" : "Use light mode"}
                  onClick={() => setTheme(isLightTheme ? "dark" : "light")}
                >
                  {isLightTheme ? <Moon className="size-4" /> : <Sun className="size-4" />}
                </ToolbarButton>
              </div>
            )}

            {controls && (
              <motion.aside
                drag
                dragControls={optionsDragControls}
                dragConstraints={previewSurfaceRef}
                dragElastic={0.04}
                dragListener={false}
                dragMomentum={false}
                className={cn("absolute right-7 top-[104px] z-20 hidden w-[286px] rounded-[22px] border p-3 backdrop-blur-sm xl:block", palette.options)}
              >
                <div className="mb-4 flex items-center justify-between text-sm">
                  <button
                    type="button"
                    aria-label="Drag options panel"
                    onPointerDown={(event) => optionsDragControls.start(event)}
                    className={cn("cursor-grab rounded-md p-1 transition active:cursor-grabbing", palette.optionsMuted)}
                  >
                    <Grip className="size-4" />
                  </button>
                  <div className={cn("flex items-center gap-2", palette.optionsText)}>
                    <span>Options</span>
                    {showOptionsReset && (
                      <button
                        type="button"
                        aria-label="Reset options"
                        onClick={resetPreview}
                        className={cn("rounded-md transition active:scale-95", palette.optionsButton)}
                      >
                        <RefreshCcw className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-4">{controls}</div>
              </motion.aside>
            )}

            <div
              className={cn(
                "relative z-10 flex w-full min-w-0",
                isListPreview
                  ? "h-auto items-start justify-center overflow-visible p-0 lg:h-full"
                  : cn(
                      "h-full items-center justify-center overflow-hidden rounded-[18px] p-3 sm:p-6",
                      isLightPreview ? "bg-[#f7f5ef]" : palette.previewInner,
                    ),
                previewInnerClassName
              )}
            >
              <div
                key={previewKey}
                className={cn(
                  "bjork-shell-preview-stage relative flex w-full min-w-0",
                  isListPreview
                    ? "h-auto items-start justify-center overflow-visible"
                    : "h-full min-h-[520px] items-center justify-center overflow-hidden",
                )}
              >
                {children}
              </div>
            </div>
          </motion.div>
        </motion.section>
      </motion.main>

      <SourceCodeDrawer
        open={showCode}
        onOpenChange={setShowCode}
        source={source}
        sourcePath={sourcePath}
        loading={sourceLoading}
      />
    </div>
  );
}

export function SimpleComponentDemoPage({
  ...props
}: SimpleComponentDemoPageProps) {
  return (
    <Suspense fallback={null}>
      <SimpleComponentDemoPageContent {...props} />
    </Suspense>
  );
}

function SimpleComponentDemoPageContent({
  item,
  children,
  description,
  dependencies = ["framer-motion", "clsx"],
  interactionRows,
  cliCommand,
  usageCode,
  details,
  note,
  previewScaleClassName = "w-[760px] scale-[0.72]",
  previewCaptureScaleClassName,
  previewClassName,
  previewInnerClassName,
  previewLayout = "single",
}: SimpleComponentDemoPageProps) {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const isPreviewLight = previewTheme === "light";
  const { setTheme } = useTheme();

  useEffect(() => {
    if (!isPreview || (previewTheme !== "light" && previewTheme !== "dark")) {
      return;
    }

    setTheme(previewTheme);
  }, [isPreview, previewTheme, setTheme]);

  if (!item) return null;

  const isListPreview = previewLayout === "list";
  const previewFrameClassName =
    isPreview && previewCaptureScaleClassName
      ? previewCaptureScaleClassName
      : previewScaleClassName;

  const demo = isListPreview ? (
    <div className="w-full min-w-0">{children}</div>
  ) : (
    <div className="flex h-full w-full min-w-0 items-center justify-center overflow-hidden p-3 sm:p-6">
      <div
        className="bjork-shell-demo-fit flex origin-center items-center justify-center lg:contents"
        style={
          {
            "--bjork-demo-base-width": previewFrameClassName.match(/w-\[(\d+)px\]/)?.[1] ?? "760",
          } as CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );

  if (isPreview) {
    return (
      <div
        data-preview-mode="true"
        style={{ colorScheme: isPreviewLight ? "light" : "dark" }}
        className={cn(
          "flex min-h-screen items-center justify-center overflow-hidden",
          isPreviewLight
            ? "light bg-[#f7f5ef] text-[#171717]"
            : "dark bg-[#111] text-[#ededed]"
        )}
      >
        <div className={isListPreview ? "w-[900px]" : previewFrameClassName}>
          {demo}
        </div>
      </div>
    );
  }

  return (
    <ComponentDemoShell
      item={item}
      description={
        description ??
        `${item.title} is part of the Bjork UI component gallery. This page uses the shared preview shell so the component can be inspected, reloaded, themed, and copied from the same layout as the rest of the library.`
      }
      dependencies={dependencies}
      interactionRows={interactionRows}
      cliCommand={cliCommand ?? `npx shadcn add @bjork-ui/${item.slug}`}
      usageCode={
        usageCode ??
        `import { ${toPascalCase(item.slug)} } from "@/components/bjork-ui/${item.collection.toLowerCase()}/${item.slug}";\n\nexport function Demo() {\n  return <${toPascalCase(item.slug)} />;\n}`
      }
      details={details}
      note={note}
      previewClassName={previewClassName}
      previewInnerClassName={previewInnerClassName}
      previewLayout={previewLayout}
    >
      {demo}
    </ComponentDemoShell>
  );
}

function toPascalCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function MobileComponentBreadcrumb({
  item,
  sidebarOpen,
  setSidebarOpen,
  shouldReduceMotion,
  palette,
}: {
  item: GalleryItem;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  shouldReduceMotion: boolean;
  palette: ShellPalette;
}) {
  const isLight = palette.mode === "light";

  return (
    <div className="order-1 flex min-w-0 items-center gap-2 px-3 pb-1 pt-3 text-sm lg:hidden">
      <AnimatePresence initial={false}>
        {!sidebarOpen && (
          <IndexMotionButton
            key="mobile-breadcrumb-index-toggle"
            label="Open component index"
            onClick={() => setSidebarOpen(true)}
            shouldReduceMotion={shouldReduceMotion}
            variant="inline"
            filled
            palette={palette}
          />
        )}
      </AnimatePresence>
      <span className={cn("shrink-0", isLight ? "text-[#171717]/45" : "text-[#ededed]/42")}>
        Components
      </span>
      <span className={cn("shrink-0", isLight ? "text-[#171717]/28" : "text-[#ededed]/24")}>
        •
      </span>
      <span className={cn("min-w-0 truncate", isLight ? "text-[#171717]/64" : "text-[#ededed]/58")}>
        {item.title}
      </span>
    </div>
  );
}

function DocsPanel({
  item,
  sidebarOpen,
  setSidebarOpen,
  shouldReduceMotion,
  description,
  dependencies,
  cliCommand,
  usageCode,
  details,
  note,
  palette,
}: {
  item: GalleryItem;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  shouldReduceMotion: boolean;
  description: string;
  dependencies: string[];
  cliCommand?: string;
  usageCode?: string;
  details?: ReactNode;
  note?: ReactNode;
  palette: ShellPalette;
}) {
  const isLight = palette.mode === "light";
  const scrollRef = useRef<HTMLDivElement>(null);
  const sortedItems = useMemo(() => {
    return [...galleryItems].sort((a, b) => {
      const aNumber = Number(a.id.replace(/\D/g, ""));
      const bNumber = Number(b.id.replace(/\D/g, ""));
      return aNumber - bNumber;
    });
  }, []);
  const currentIndex = sortedItems.findIndex((entry) => entry.slug === item.slug);
  const previousItem =
    sortedItems[(currentIndex - 1 + sortedItems.length) % sortedItems.length];
  const nextItem = sortedItems[(currentIndex + 1) % sortedItems.length];

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const savedScrollTop = Number(
      window.sessionStorage.getItem(docsScrollStorageKey) ?? 0
    );

    requestAnimationFrame(() => {
      node.scrollTop = Number.isFinite(savedScrollTop) ? savedScrollTop : 0;
    });
  }, [item.slug]);

  const handleDocsScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    window.sessionStorage.setItem(
      docsScrollStorageKey,
      String(node.scrollTop)
    );
  }, []);

  return (
    <div className="h-auto overflow-visible rounded-[24px] border border-transparent bg-transparent p-0 lg:h-full lg:overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={handleDocsScroll}
        className="hide-scrollbar h-auto overflow-visible px-2 pb-20 pt-7 sm:px-3 lg:h-full lg:overflow-y-auto lg:px-4 xl:px-5"
      >
        <div className="w-full min-w-0 max-w-[760px]">
          <div className={cn("mb-24 hidden items-center gap-2 text-sm lg:flex", isLight ? "text-[#171717]/45" : "text-[#ededed]/42")}>
            <AnimatePresence initial={false}>
              {!sidebarOpen && (
                <IndexMotionButton
                  key="breadcrumb-index-toggle"
                  label="Open component index"
                  onClick={() => setSidebarOpen(true)}
                  shouldReduceMotion={shouldReduceMotion}
                  variant="inline"
                  filled
                  palette={palette}
                />
              )}
            </AnimatePresence>
            <span>Components</span>
            <span>•</span>
            <span>{item.title}</span>
          </div>

          <div className="space-y-9">
            <div>
              <p className={cn("mb-5 font-mono text-xs uppercase tracking-[0.08em]", isLight ? "text-[#171717]/38" : "text-[#ededed]/34")}>
                {item.title}
              </p>
              <p className={cn("max-w-[760px] text-[19px] leading-8 tracking-[-0.03em] md:text-[21px] md:leading-9", isLight ? "text-[#171717]/76" : "text-[#ededed]/78")}>
                {description}
              </p>
            </div>

            {getVisibleDependencies(dependencies).length > 0 && (
              <InfoSection title="Dependencies">
                <div className="flex flex-wrap gap-2">
                  {getVisibleDependencies(dependencies).map((dependency) => (
                    <DependencyBadge
                      key={dependency}
                      dependency={dependency}
                      palette={palette}
                    />
                  ))}
                </div>
              </InfoSection>
            )}

            {cliCommand && (
              <InfoSection title="Copy below cli">
                <CopyBlock code={cliCommand} palette={palette} />
              </InfoSection>
            )}

            {usageCode && (
              <InfoSection title="How to use">
                <CodeBlock code={usageCode} palette={palette} />
              </InfoSection>
            )}

            {details}

            {note && <InfoSection title="Keep in mind">{note}</InfoSection>}
          </div>

          <ComponentPager
            previousItem={previousItem}
            nextItem={nextItem}
            palette={palette}
          />
        </div>
      </div>
    </div>
  );
}

function ComponentPager({
  previousItem,
  nextItem,
  palette,
}: {
  previousItem: GalleryItem;
  nextItem: GalleryItem;
  palette: ShellPalette;
}) {
  const isLight = palette.mode === "light";
  const borderClass = isLight ? "border-[#ded9cc]" : "border-[#1c1c1c]";
  const labelClass = isLight ? "text-[#171717]/38" : "text-[#ededed]/36";
  const titleClass = isLight ? "text-[#171717]/82" : "text-[#ededed]/88";
  const hoverClass = isLight ? "hover:text-[#171717]" : "hover:text-[#ededed]";

  return (
    <nav
      aria-label="Component navigation"
      className={cn("mt-28 grid grid-cols-2 border-t pt-10", borderClass)}
    >
      <Link
        href={previousItem.route}
        scroll={false}
        className={cn("group flex min-h-[112px] flex-col items-start justify-start pr-5 transition", hoverClass)}
      >
        <span className={cn("mb-5 flex items-center gap-2 font-mono text-[15px] uppercase tracking-[-0.04em]", labelClass)}>
          <ChevronLeft className="size-5 transition-transform group-hover:-translate-x-1" />
          Previous
        </span>
        <span className={cn("text-[26px] leading-tight tracking-[-0.055em] transition", titleClass)}>
          {previousItem.title}
        </span>
      </Link>

      <Link
        href={nextItem.route}
        scroll={false}
        className={cn("group flex min-h-[112px] flex-col items-end justify-start pl-5 text-right transition", hoverClass)}
      >
        <span className={cn("mb-5 flex items-center gap-2 font-mono text-[15px] uppercase tracking-[-0.04em]", labelClass)}>
          Next
          <ChevronRight className="size-5 transition-transform group-hover:translate-x-1" />
        </span>
        <span className={cn("text-[26px] leading-tight tracking-[-0.055em] transition", titleClass)}>
          {nextItem.title}
        </span>
      </Link>
    </nav>
  );
}

function IndexMotionButton({
  label,
  onClick,
  shouldReduceMotion,
  variant = "floating",
  filled = false,
  className,
  layoutId = "component-index-toggle",
  palette = shellPalettes.dark,
}: {
  label: string;
  onClick: () => void;
  shouldReduceMotion: boolean;
  variant?: "inline" | "floating";
  filled?: boolean;
  className?: string;
  layoutId?: string;
  palette?: ShellPalette;
}) {
  const isLight = palette?.mode === "light";

  return (
    <motion.button
      layoutId={layoutId}
      type="button"
      aria-label={label}
      onClick={onClick}
      initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.88 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.88 }}
      transition={
        shouldReduceMotion
          ? { duration: 0.1 }
          : { type: "spring", stiffness: 430, damping: 34, mass: 0.72 }
      }
      className={cn(
        "flex shrink-0 items-center justify-center transition active:scale-95",
        isLight ? "text-[#171717]/56 hover:text-[#171717]" : "text-[#ededed]/58 hover:text-[#ededed]",
        variant === "inline" &&
          "size-4 rounded-none border-0 bg-transparent p-0 shadow-none",
        variant === "floating" &&
          cn("size-9 rounded-[12px]", isLight ? "hover:bg-[#171717]/8" : "hover:bg-[#ededed]/6"),
        className
      )}
    >
      <ComponentIndexGlyph filled={filled} className={variant === "inline" ? "size-4" : "size-[18px]"} palette={palette} />
    </motion.button>
  );
}

function ComponentIndexGlyph({
  filled,
  className,
  palette = shellPalettes.dark,
}: {
  filled?: boolean;
  className?: string;
  palette?: ShellPalette;
}) {
  const isLight = palette.mode === "light";

  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={className}
      fill="none"
    >
      <rect
        x="2.25"
        y="3"
        width="11.5"
        height="10"
        rx="2.1"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.35"
      />
      <rect
        x="5.1"
        y="5.55"
        width="2"
        height="4.9"
        rx="0.55"
        fill={filled ? (isLight ? "#f4f2ec" : "#080808") : "currentColor"}
      />
    </svg>
  );
}

function ComponentIndexOverlay({
  open,
  setOpen,
  item,
  items,
  hoveredItem,
  setHoveredItem,
  shouldReduceMotion,
  palette,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  item: GalleryItem;
  items: GalleryItem[];
  hoveredItem: GalleryItem | null;
  setHoveredItem: (item: GalleryItem | null) => void;
  shouldReduceMotion: boolean;
  palette: ShellPalette;
}) {
  const isLight = palette.mode === "light";
  const router = useRouter();
  const asideRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const prefetchedRoutesRef = useRef(new Set<string>());
  const [previewPoint, setPreviewPoint] = useState({ x: 390, y: 132 });
  const [sortMode, setSortMode] = useState<SidebarSortMode>("collection");
  const groupedItems = useMemo(() => {
    if (sortMode === "id") {
      return [
        {
          collection: "By ID",
          entries: [...items].sort((a, b) => {
            const aNumber = Number(a.id.replace(/\D/g, ""));
            const bNumber = Number(b.id.replace(/\D/g, ""));

            return aNumber - bNumber;
          }),
        },
      ];
    }

    const groups = new Map<string, GalleryItem[]>();

    items.forEach((entry) => {
      const groupItems = groups.get(entry.collection) ?? [];
      groupItems.push(entry);
      groups.set(entry.collection, groupItems);
    });

    return Array.from(groups.entries())
      .map(([collection, entries]) => ({
        collection,
        entries,
      }))
      .sort(
        (a, b) =>
          getSidebarCollectionRank(a.collection) -
            getSidebarCollectionRank(b.collection) ||
          a.collection.localeCompare(b.collection)
      );
  }, [items, sortMode]);

  useEffect(() => {
    setSortMode(
      window.sessionStorage.getItem(sidebarSortStorageKey) === "id"
        ? "id"
        : "collection"
    );
  }, []);

  useEffect(() => {
    const node = navRef.current;
    if (!node) return;

    const savedScrollTop = Number(
      window.sessionStorage.getItem(sidebarScrollStorageKey) ?? 0
    );

    requestAnimationFrame(() => {
      node.scrollTop = Number.isFinite(savedScrollTop) ? savedScrollTop : 0;
    });
  }, [item.slug]);

  const handleSidebarScroll = useCallback(() => {
    const node = navRef.current;
    if (!node) return;

    window.sessionStorage.setItem(
      sidebarScrollStorageKey,
      String(node.scrollTop)
    );
  }, []);

  const persistSidebarScroll = useCallback(() => {
    handleSidebarScroll();
  }, [handleSidebarScroll]);

  const prefetchIndexRoute = useCallback(
    (route: string) => {
      if (prefetchedRoutesRef.current.has(route)) return;

      prefetchedRoutesRef.current.add(route);
      router.prefetch(route);
    },
    [router],
  );

  const handleIndexNavigate = useCallback(() => {
    persistSidebarScroll();

    if (isMobileComponentIndexViewport()) {
      setOpen(false);
    }
  }, [persistSidebarScroll, setOpen]);

  const toggleSortMode = useCallback(() => {
    setSortMode((currentMode) => {
      const nextMode = currentMode === "collection" ? "id" : "collection";

      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(sidebarSortStorageKey, nextMode);
      }

      requestAnimationFrame(() => {
        navRef.current?.scrollTo({ top: 0, behavior: shouldReduceMotion ? "auto" : "smooth" });
      });

      return nextMode;
    });
  }, [shouldReduceMotion]);

  const updatePreviewPoint = useCallback((event: ReactMouseEvent) => {
    const aside = asideRef.current;
    if (!aside) return;

    const rect = aside.getBoundingClientRect();
    setPreviewPoint({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  }, []);

  return (
    <motion.aside
      ref={asideRef}
      initial={false}
      animate={{
        x: open ? 0 : "calc(-100vw - 24px)",
        opacity: open ? 1 : 0,
      }}
      transition={
        shouldReduceMotion
          ? { duration: 0.12 }
          : { type: "spring", stiffness: 340, damping: 36, mass: 0.85 }
      }
      aria-hidden={!open}
      className={cn(
        "fixed bottom-2 left-2 top-2 z-[60] w-[calc(100vw-16px)] rounded-[24px] border px-4 pb-10 pt-20 backdrop-blur-xl sm:w-[min(460px,calc(100vw-16px))] sm:px-5",
        open ? "pointer-events-auto" : "pointer-events-none",
        isLight
          ? "border-[#d8d3c7] bg-[#f4f1e9]/96 shadow-[inset_0_7px_14px_rgba(255,255,255,0.65),0_24px_110px_rgba(64,55,41,0.18)]"
          : "border-[#181818] bg-[#121212]/96 shadow-[inset_0_7px_14px_rgba(255,255,255,0.025),0_24px_110px_rgba(0,0,0,0.72)]"
      )}
    >
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="sidebar-actions"
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <IndexMotionButton
              label="Close component index"
              onClick={() => setOpen(false)}
              shouldReduceMotion={shouldReduceMotion}
              className="absolute left-5 top-5 z-20"
              palette={palette}
            />
            <SidebarHomeButton
              shouldReduceMotion={shouldReduceMotion}
              className="absolute right-5 top-5 z-20"
              palette={palette}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-[24px] bg-gradient-to-b to-transparent", isLight ? "from-[#f4f1e9]" : "from-[#121212]")} />
      <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-24 rounded-b-[24px] bg-gradient-to-t to-transparent", isLight ? "from-[#f4f1e9]" : "from-[#121212]")} />

      <div className="relative z-10 flex h-full min-h-0 flex-col pt-10">
        <nav
          ref={navRef}
          onScroll={handleSidebarScroll}
          className="hide-scrollbar relative min-h-0 flex-1 space-y-8 overflow-y-auto pb-16 pr-1"
        >
          <IndexLink
            active
            label="All Components"
            lineClassName={cn("w-[62px]", isLight ? "bg-[#171717]/72" : "bg-[#ededed]/78")}
            onClick={toggleSortMode}
            palette={palette}
          />

          {groupedItems.map((group) => (
            <div key={group.collection} className="space-y-[8px]">
              <div className={cn("flex items-center gap-6 pt-1 font-mono text-[11px] uppercase tracking-[0.12em]", isLight ? "text-[#171717]/32" : "text-[#ededed]/30")}>
                <span className={cn("h-px w-[62px] shrink-0", isLight ? "bg-[#171717]/12" : "bg-[#ededed]/12")} />
                <span>{group.collection}</span>
                <span className={cn("text-[10px]", isLight ? "text-[#171717]/24" : "text-[#ededed]/22")}>
                  {group.entries.length}
                </span>
              </div>

              {group.entries.map((entry) => {
                const active = entry.slug === item.slug;

                return (
                  <Link
                    key={entry.slug}
                    href={entry.route}
                    scroll={false}
                    onClick={handleIndexNavigate}
                    onFocus={() => prefetchIndexRoute(entry.route)}
                    onMouseEnter={(event) => {
                      prefetchIndexRoute(entry.route);
                      updatePreviewPoint(event);
                      setHoveredItem(entry);
                    }}
                    onMouseMove={updatePreviewPoint}
                    onMouseLeave={() => setHoveredItem(null)}
                    className={cn(
                      "group flex h-[30px] items-center gap-4 rounded-md text-[22px] leading-none tracking-[-0.055em] outline-none transition sm:h-[28px] sm:gap-6 sm:text-[26px]",
                      active ? "text-[#ec5c13]" : isLight ? "text-[#171717]/30 hover:text-[#171717]/78" : "text-[#ededed]/27 hover:text-[#ededed]/78"
                    )}
                  >
                    <span
                      className={cn(
                        "h-px w-[38px] shrink-0 transition sm:w-[62px]",
                        isLight ? "bg-[#171717]/18" : "bg-[#ededed]/18",
                        active && "w-[68px] bg-[linear-gradient(90deg,#ec5c13,#ff9a4d)] sm:w-[106px]",
                        !active && (isLight ? "group-hover:w-[58px] group-hover:bg-[#171717]/45 sm:group-hover:w-[92px]" : "group-hover:w-[58px] group-hover:bg-[#ededed]/45 sm:group-hover:w-[92px]")
                      )}
                    />
                <span className="truncate pb-1 leading-[1.14]">
                      {entry.id.replace("bjork", "").padStart(2, "0")} {entry.title}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}

        </nav>
      </div>

      <AnimatePresence>
        {hoveredItem && (
          <ComponentHoverPreview
            key={hoveredItem.slug}
            item={hoveredItem}
            isLight={isLight}
            previewPoint={previewPoint}
            shouldReduceMotion={shouldReduceMotion}
          />
        )}
      </AnimatePresence>
    </motion.aside>
  );
}

function ComponentHoverPreview({
  item,
  isLight,
  previewPoint,
  shouldReduceMotion,
}: {
  item: GalleryItem;
  isLight: boolean;
  previewPoint: { x: number; y: number };
  shouldReduceMotion: boolean;
}) {
  const previewWidth = 238;
  const previewHeight = 132;
  const previewInset = 18;
  const [viewportSize, setViewportSize] = useState(() => {
    if (typeof window === "undefined") {
      return { width: 1280, height: 720 };
    }

    return {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  });

  useEffect(() => {
    const updateViewportSize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    updateViewportSize();
    window.addEventListener("resize", updateViewportSize);

    return () => window.removeEventListener("resize", updateViewportSize);
  }, []);

  const sidebarWidth = Math.min(460, Math.max(0, viewportSize.width - 16));
  const sidebarHeight = Math.max(0, viewportSize.height - 16);
  const maxPreviewX = Math.max(148, sidebarWidth - previewWidth - previewInset);
  const maxPreviewY = Math.max(
    previewInset,
    sidebarHeight - previewHeight - previewInset
  );
  const previewX = Math.max(148, Math.min(previewPoint.x + 28, maxPreviewX));
  const previewY = Math.max(
    previewInset,
    Math.min(previewPoint.y - previewHeight / 2, maxPreviewY)
  );

  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 0, x: previewX, y: previewY } : { opacity: 0, x: previewX - 10, y: previewY, scale: 0.98 }}
      animate={{ opacity: 1, x: previewX, y: previewY, scale: 1 }}
      exit={shouldReduceMotion ? { opacity: 0, x: previewX, y: previewY } : { opacity: 0, x: previewX - 8, y: previewY, scale: 0.98 }}
      transition={
        shouldReduceMotion
          ? { duration: 0.12 }
          : { type: "spring", stiffness: 380, damping: 31, mass: 0.7 }
      }
      className={cn(
        "pointer-events-none absolute left-0 top-0 z-[90] h-[132px] w-[238px] overflow-hidden rounded-[14px] border shadow-[0_18px_70px_rgba(0,0,0,0.22)]",
        isLight ? "border-[#d8d3c7] bg-[#f7f5ef]" : "border-[#232323] bg-[#0b0b0b]"
      )}
    >
      <div
        className={cn(
          "absolute inset-0",
          isLight
            ? "bg-[radial-gradient(circle_at_50%_42%,#fffdf7_0%,#f4f0e7_52%,#ebe4d8_100%)]"
            : "bg-[radial-gradient(circle_at_50%_42%,#181818_0%,#0d0d0d_48%,#080808_100%)]"
        )}
      />
      {item.preview === "shader" ? (
        <WebsiteShaderCanvas
          preset={item.slug}
          tone={isLight ? "light" : "dark"}
          className="absolute inset-0 h-full w-full"
          intensity={0.78}
          maxPixelRatio={0.75}
          maxCanvasPixels={90_000}
        />
      ) : (
        <Image
          src={`/component-previews/${item.slug}${isLight ? "-light" : ""}.png`}
          alt=""
          fill
          sizes="238px"
          className="object-cover"
          loading="eager"
          unoptimized
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
    </motion.div>
  );
}

function SidebarHomeButton({
  shouldReduceMotion,
  className,
  palette = shellPalettes.dark,
}: {
  shouldReduceMotion: boolean;
  className?: string;
  palette?: ShellPalette;
}) {
  const isLight = palette.mode === "light";

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.88 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.88 }}
      transition={
        shouldReduceMotion
          ? { duration: 0.1 }
          : { type: "spring", stiffness: 430, damping: 34, mass: 0.72 }
      }
      className={className}
    >
      <Link
        href="/"
        aria-label="Go home"
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-[12px] transition active:scale-95",
          isLight ? "text-[#171717]/56 hover:bg-[#171717]/8 hover:text-[#171717]" : "text-[#ededed]/58 hover:bg-[#ededed]/6 hover:text-[#ededed]"
        )}
      >
        <Home className="size-[18px]" aria-hidden="true" />
      </Link>
    </motion.div>
  );
}

function IndexLink({
  active,
  href,
  label,
  lineClassName,
  onClick,
  onMouseEnter,
  palette = shellPalettes.dark,
}: {
  active?: boolean;
  href?: string;
  label: string;
  lineClassName?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  palette?: ShellPalette;
}) {
  const isLight = palette.mode === "light";
  const className = cn(
    "group flex h-[32px] w-full items-center gap-6 rounded-md text-left text-[26px] leading-[1.14] tracking-[-0.055em] outline-none transition",
    active ? (isLight ? "text-[#171717]/86" : "text-[#ededed]/86") : (isLight ? "text-[#171717]/28 hover:text-[#171717]/78" : "text-[#ededed]/28 hover:text-[#ededed]/78")
  );
  const content = (
    <>
      <span className={cn("h-px w-[62px] shrink-0 transition", isLight ? "bg-[#171717]/18" : "bg-[#ededed]/18", lineClassName)} />
      <span className="truncate pb-1">{label}</span>
    </>
  );

  if (!href) {
    return (
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        className={className}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={href}
      scroll={false}
      onClick={onClick}
      onFocus={onMouseEnter}
      onMouseEnter={onMouseEnter}
      className={className}
    >
      {content}
    </Link>
  );
}

function useShellIsLight() {
  const { resolvedTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [documentTheme, setDocumentTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const syncDocumentTheme = () => {
      const root = document.documentElement;

      setDocumentTheme(
        root.classList.contains("light")
          ? "light"
          : root.classList.contains("dark")
            ? "dark"
            : null
      );
    };

    syncDocumentTheme();
    setMounted(true);

    const observer = new MutationObserver(syncDocumentTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  const activeTheme = documentTheme ?? (theme === "system" ? resolvedTheme : (theme ?? resolvedTheme));

  return mounted && activeTheme === "light";
}

function InfoSection({ title, children }: { title: string; children: ReactNode }) {
  const isLight = useShellIsLight();

  return (
    <section className="space-y-4 pt-16">
      <h2 className={cn("font-mono text-xs uppercase tracking-[0.08em]", isLight ? "text-[#171717]/38" : "text-[#ededed]/34")}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function getVisibleDependencies(dependencies: string[]) {
  return dependencies.filter((dependency) => dependency.toLowerCase() !== "react");
}

function DependencyBadge({ dependency, palette }: { dependency: string; palette: ShellPalette }) {
  const isLight = palette.mode === "light";
  const normalized = dependency.toLowerCase();
  const radixPackage = normalized.startsWith("@radix-ui/");
  const packageName = normalized.split("/").pop()?.replace(/^react-/, "") ?? dependency;
  const displayName = radixPackage
    ? `Radix ${toDependencyLabel(packageName)}`
    : normalized === "lucide-react"
      ? "Lucide"
      : normalized === "framer-motion"
        ? "Motion"
        : dependency;
  const href = getDependencyHref(normalized);

  const content = (
    <>
      <span>{displayName}</span>
      {radixPackage && <RadixMark />}
      {normalized === "lucide-react" && <LucideMark isLight={isLight} />}
      {normalized === "framer-motion" && <FramerMotionMark />}
      {(normalized === "clsx" || normalized === "tailwind-merge") && <NpmMark />}
    </>
  );

  if (!href) {
    return (
      <span className={cn("flex h-8 w-fit items-center gap-2 rounded-xl px-3 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]", isLight ? "bg-[#eee9df] text-[#171717]/76" : "bg-[#121212] text-[#ededed]/82")}>
        {content}
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn("flex h-8 w-fit cursor-pointer items-center gap-2 rounded-xl px-3 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-300 active:scale-95", isLight ? "bg-[#eee9df] text-[#171717]/76 hover:bg-[#e5ded1]" : "bg-[#121212] text-[#ededed]/82 hover:bg-[#191919]")}
    >
      {content}
    </a>
  );
}

function getDependencyHref(normalized: string) {
  if (normalized.startsWith("@radix-ui/")) return "https://www.radix-ui.com/primitives";
  if (normalized === "lucide-react") return "https://lucide.dev/";
  if (normalized === "framer-motion") return "https://motion.dev/";
  if (normalized === "clsx") return "https://www.npmjs.com/package/clsx";
  if (normalized === "tailwind-merge") return "https://www.npmjs.com/package/tailwind-merge";

  return undefined;
}

function toDependencyLabel(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function FramerMotionMark() {
  return (
    <svg
      className="h-2"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1103 386"
      aria-hidden="true"
    >
      <path
        fill="#FFF312"
        d="M416.473 0 198.54 385.66H0L170.17 84.522C196.549 37.842 262.377 0 317.203 0Zm486.875 96.415c0-53.249 44.444-96.415 99.27-96.415 54.826 0 99.27 43.166 99.27 96.415 0 53.248-44.444 96.415-99.27 96.415-54.826 0-99.27-43.167-99.27-96.415ZM453.699 0h198.54L434.306 385.66h-198.54Zm234.492 0h198.542L716.56 301.138c-26.378 46.68-92.207 84.522-147.032 84.522h-99.27Z"
      />
    </svg>
  );
}

function RadixMark() {
  return (
    <span
      aria-hidden="true"
      className="size-3 bg-current"
      style={{
        WebkitMaskImage: "url(/logos/radix-ui-logo.svg)",
        maskImage: "url(/logos/radix-ui-logo.svg)",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
    />
  );
}

function LucideMark({ isLight }: { isLight: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="size-3.5 bg-center bg-contain bg-no-repeat"
      style={{
        backgroundImage: `url(${isLight ? "/logos/lucide-logo-light.svg" : "/logos/lucide-logo-dark.svg"})`,
      }}
    />
  );
}

function NpmMark() {
  return (
    <svg
      className="size-3"
      xmlns="http://www.w3.org/2000/svg"
      width="32"
      height="32"
      viewBox="0 0 256 256"
      aria-hidden="true"
    >
      <path fill="#C12127" d="M0 256V0h256v256z" />
      <path fill="#FFF" d="M48 48h160v160h-32V80h-48v128H48z" />
    </svg>
  );
}

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  const isLight = useShellIsLight();

  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex size-9 items-center justify-center rounded-[13px] transition active:scale-95",
        isLight ? "text-[#171717]/68 hover:bg-[#f1ece3] hover:text-[#171717]/78" : "text-[#ededed] hover:bg-[#232323]",
        active && (isLight
          ? "bg-[#f1ece3] text-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] hover:bg-[#ece5d9]"
          : "bg-[#2b2b2b] text-[#ededed] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:bg-[#303030]")
      )}
    >
      {children}
    </button>
  );
}

export function ShellRange({
  label,
  value,
  min,
  max,
  step = 1,
  displayValue,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  displayValue?: string;
  onChange: (value: number) => void;
}) {
  const isLight = useShellIsLight();

  return (
    <label className="grid grid-cols-[62px_minmax(0,1fr)] items-center gap-3 text-sm">
      <span className={cn(isLight ? "text-[#171717]/50" : "text-[#ededed]/48")}>{label}</span>
      <BjorkSlider
        min={min}
        max={max}
        step={step}
        value={value}
        displayValue={displayValue}
        onValueChange={onChange}
      />
    </label>
  );
}

export function ShellSegmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const isLight = useShellIsLight();

  return (
    <div className="grid grid-cols-[62px_1fr] items-center gap-3 text-sm">
      <span className={cn(isLight ? "text-[#171717]/50" : "text-[#ededed]/48")}>{label}</span>
      <div className="flex justify-end gap-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-[10px] border px-2.5 py-1 text-sm transition active:scale-95",
              option.value === value
                ? (isLight
                  ? "border-[#eee6db] bg-[#f4f1e9] text-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.82),inset_0_8px_16px_rgba(88,72,49,0.035),0_8px_14px_-10px_rgba(66,52,33,0.16)]"
                  : "border-[#393939]/70 bg-[linear-gradient(180deg,#303030,#202020)] text-[#ededed] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.025)]")
                : (isLight
                  ? "border-transparent text-[#171717]/44 hover:bg-[#f1ece3] hover:text-[#171717]/72"
                  : "border-transparent text-[#ededed]/45 hover:bg-[#232323] hover:text-[#ededed]")
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CopyBlock({ code, palette }: { code: string; palette: ShellPalette }) {
  const isLight = palette.mode === "light";

  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-[15px] p-3", isLight ? "bg-[#eee9df]" : "bg-[#111]")}>
      <code className={cn("overflow-auto whitespace-nowrap font-mono text-sm", isLight ? "text-[#171717]/78" : "text-[#ededed]/82")}>
        {code}
      </code>
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(code)}
        className={cn("flex size-9 shrink-0 items-center justify-center rounded-[11px] transition active:scale-95", isLight ? "text-[#171717]/44 hover:bg-[#e2dbcf] hover:text-[#171717]" : "text-[#ededed]/45 hover:bg-[#232323] hover:text-[#ededed]")}
        aria-label="Copy command"
      >
        <Copy className="size-4" />
      </button>
    </div>
  );
}

function CodeBlock({ code, palette }: { code: string; palette: ShellPalette }) {
  const isLight = palette.mode === "light";

  return (
    <pre className={cn("overflow-auto rounded-[18px] p-4 font-mono text-[13px] leading-6", isLight ? "bg-[#eee9df]" : "bg-[#0e0e0e]")}>
      <HighlightedCode code={code} />
    </pre>
  );
}

function SourceCodeDrawer({
  open,
  onOpenChange,
  source,
  sourcePath,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: string;
  sourcePath: string;
  loading: boolean;
}) {
  const isLight = useShellIsLight();
  const filename = sourcePath.split("/").pop() ?? sourcePath;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="bottom" modal={false}>
      <DrawerContent
        showOverlay={false}
        handleClassName={cn("mt-2 h-1.5 w-[70px]", isLight ? "bg-[#171717]/22" : "bg-[#ededed]/22")}
        style={{
          left: "8px",
          right: "var(--source-drawer-right)",
          bottom: "8px",
          width: "var(--source-drawer-width)",
          maxWidth: "none",
          height: "calc(100dvh - 16px)",
          maxHeight: "none",
        } as CSSProperties}
        className={cn(
          "z-[80] !rounded-[24px] !rounded-t-[24px] border p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] [--source-drawer-right:8px] [--source-drawer-width:calc(100vw-16px)] lg:[--source-drawer-right:auto] lg:[--source-drawer-width:calc(50vw-12px)]",
          isLight ? "border-[#d8d3c7] bg-[#f4f1e9]" : "border-[#181818] bg-[#121212]"
        )}
      >
      <div className={cn("relative flex h-full min-h-0 flex-col overflow-hidden rounded-[18px]", isLight ? "bg-[#f4f1e9]" : "bg-[#121212]")}>
        <div className={cn("flex items-center justify-between px-5 pb-4 pt-4 text-sm", isLight ? "text-[#171717]/45" : "text-[#ededed]/42")}>
          <DrawerClose asChild>
            <button
              type="button"
              className={cn("flex items-center gap-2 rounded-lg transition active:scale-95", isLight ? "hover:text-[#171717]" : "hover:text-[#ededed]")}
            >
              <ChevronDown className="size-4 rotate-90" />
              <DrawerTitle asChild>
                <span>Source Code</span>
              </DrawerTitle>
            </button>
          </DrawerClose>

          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Download source"
              className={cn("rounded-md transition", isLight ? "text-[#171717]/38 hover:text-[#171717]" : "text-[#ededed]/34 hover:text-[#ededed]")}
            >
              <Download className="size-4" />
            </button>
            <span className="max-w-[220px] truncate font-mono text-xs">{filename}</span>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(source)}
              className={cn("rounded-md transition active:scale-95", isLight ? "text-[#171717]/38 hover:text-[#171717]" : "text-[#ededed]/34 hover:text-[#ededed]")}
              aria-label="Copy source"
            >
              <Copy className="size-4" />
            </button>
          </div>
        </div>

        <pre className="hide-scrollbar min-h-0 flex-1 overflow-auto px-5 pb-8 pt-2 font-mono text-[13px] leading-7">
          {loading ? (
            <span className={cn(isLight ? "text-[#171717]/45" : "text-[#ededed]/45")}>Loading source...</span>
          ) : (
            <HighlightedCode code={source} />
          )}
        </pre>
      </div>
      </DrawerContent>
    </Drawer>
  );
}

function HighlightedCode({ code }: { code: string }) {
  const isLight = useShellIsLight();
  const pattern =
    /(\/\/.*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b(?:import|from|export|function|return|const|let|type|interface|if|else|true|false|undefined|null)\b|<\/?[A-Z][\w.]*|[a-zA-Z_$][\w$-]*(?==))/g;

  return (
    <>
      {code.split("\n").map((line, lineIndex) => {
        const parts = line.split(pattern).filter(Boolean);

        return (
          <span key={`${line}-${lineIndex}`} className="block">
            {parts.map((part, partIndex) => {
              const className = getTokenClassName(part, isLight);
              return (
                <span key={`${lineIndex}-${partIndex}`} className={className}>
                  {part}
                </span>
              );
            })}
          </span>
        );
      })}
    </>
  );
}

function getTokenClassName(token: string, isLight: boolean) {
  if (token.startsWith("//")) return isLight ? "text-[#7a746b]" : "text-[#6f7480]";
  if (token.startsWith("\"") || token.startsWith("'") || token.startsWith("`")) {
    return isLight ? "text-[#177245]" : "text-[#b8f5d1]";
  }
  if (/^<\/?[A-Z]/.test(token)) return isLight ? "text-[#17639c]" : "text-[#8bc7ff]";
  if (/^(import|from|export|function|return|const|let|type|interface|if|else|true|false|undefined|null)$/.test(token)) {
    return isLight ? "text-[#7656a6]" : "text-[#d8b4fe]";
  }
  if (/^[a-zA-Z_$][\w$-]*$/.test(token)) return isLight ? "text-[#9a6118]" : "text-[#f3c979]";
  return isLight ? "text-[#171717]/72" : "text-[#ededed]/70";
}
