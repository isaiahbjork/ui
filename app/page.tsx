"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Clipboard,
  Command as CommandIcon,
  type LucideIcon,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { galleryItems, type GalleryItem } from "@/lib/bjork-gallery";
import { SiteHeader } from "@/components/site-header";
import { WebsiteShaderCanvas } from "@/components/bjork-ui/shaders/website-shader";

const collectionCount = galleryItems.length;
type CollectionFilter = "all" | (typeof galleryItems)[number]["collection"];

const galleryCollectionOrder = [
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
  "Text",
  "HUD",
] as const;

function getCollectionRank(collection: string) {
  const index = galleryCollectionOrder.findIndex((entry) => entry === collection);

  return index === -1 ? galleryCollectionOrder.length : index;
}

const collectionFilters = [
  "all",
  ...Array.from(new Set(galleryItems.map((item) => item.collection))).sort(
    (a, b) => getCollectionRank(a) - getCollectionRank(b) || a.localeCompare(b)
  ),
] as CollectionFilter[];

const sortOptions: {
  value: "ascending" | "descending";
  label: string;
  Icon: LucideIcon;
}[] = [
  { value: "ascending", label: "Oldest", Icon: ArrowUp },
  { value: "descending", label: "Newest", Icon: ArrowDown },
];

function getItemNumber(item: GalleryItem) {
  return Number(item.id.replace(/\D/g, ""));
}

function getCollectionLabel(value: CollectionFilter) {
  return value === "all" ? "All" : value;
}

export default function Page() {
  const router = useRouter();
  const { resolvedTheme, theme } = useTheme();
  const shouldReduceMotion = useReducedMotion();
  const [search, setSearch] = useState("");
  const [sortDirection, setSortDirection] = useState<"ascending" | "descending">(
    "ascending"
  );
  const [collection, setCollection] = useState<CollectionFilter>("all");
  const [mounted, setMounted] = useState(false);
  const prefetchedRoutesRef = useRef(new Set<string>());

  const prefetchRoute = useCallback(
    (route: string) => {
      if (prefetchedRoutesRef.current.has(route)) return;

      prefetchedRoutesRef.current.add(route);
      router.prefetch(route);
    },
    [router]
  );

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return galleryItems
      .filter((item) => {
        const matchesSearch =
          normalizedSearch.length === 0 ||
          item.title.toLowerCase().includes(normalizedSearch) ||
          item.id.toLowerCase().includes(normalizedSearch) ||
          item.collection.toLowerCase().includes(normalizedSearch);
        const matchesCollection =
          collection === "all" || item.collection === collection;

        return matchesSearch && matchesCollection;
      })
      .sort((a, b) => {
        const aNumber = getItemNumber(a);
        const bNumber = getItemNumber(b);
        return sortDirection === "ascending"
          ? aNumber - bNumber
          : bNumber - aNumber;
      });
  }, [collection, search, sortDirection]);

  const groupedSections = useMemo(() => {
    const groups = filteredItems.reduce<Map<string, GalleryItem[]>>((acc, item) => {
      const existingItems = acc.get(item.collection) ?? [];
      acc.set(item.collection, [...existingItems, item]);
      return acc;
    }, new Map());

    return Array.from(groups, ([collection, items]) => ({ collection, items })).sort(
      (a, b) => {
        const aRank = getCollectionRank(a.collection);
        const bRank = getCollectionRank(b.collection);
        const rankDifference =
          sortDirection === "ascending" ? aRank - bRank : bRank - aRank;

        return rankDifference || a.collection.localeCompare(b.collection);
      }
    );
  }, [filteredItems, sortDirection]);

  const shouldAnimate = !shouldReduceMotion;
  const isLight =
    mounted && (theme === "system" ? resolvedTheme : theme) === "light";

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div
      className={cn(
        "min-h-screen overflow-x-hidden font-bjork-display selection:bg-sky-300/20 selection:text-sky-100",
        isLight ? "bg-[#f5f2eb] text-[#171717]" : "bg-[#030303] text-[#ededed]"
      )}
    >
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 top-0 z-30 h-28 bg-gradient-to-b to-transparent backdrop-blur-[2px]",
          isLight ? "from-[#f5f2eb] via-[#f5f2eb]/82" : "from-[#030303] via-[#030303]/82"
        )}
      />

      <SiteHeader />

      <main className="mx-auto flex w-full max-w-[744px] flex-col px-5 pb-44 pt-36 md:px-0 lg:pt-40">
        <HeroQuickStart isLight={isLight} animate={shouldAnimate} />

        <section id="components" className="w-full">
          <GalleryHeading
            title="Component archive"
            count={filteredItems.length}
            description="Components, shader studies, and product-grade interface fragments grouped by collection."
            isLight={isLight}
          />

          {filteredItems.length === 0 ? (
            <div
              className={cn(
                "flex min-h-[280px] flex-col items-center justify-center rounded-[20px] border text-center",
                isLight
                  ? "border-[#ded8cb] bg-[#f8f6f0] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
                  : "border-[#161616] bg-[#121212] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
              )}
            >
              <p className="text-lg font-medium">No components found</p>
              <p className={cn("mt-2 text-sm", isLight ? "text-[#171717]/45" : "text-[#ededed]/40")}>
                Clear the search or switch the source filter.
              </p>
            </div>
          ) : (
            <motion.div
              className="flex w-full flex-col gap-16 pb-[50px]"
              initial={shouldAnimate ? "hidden" : false}
              animate="visible"
              variants={{
                hidden: {},
                visible: {
                  transition: {
                    staggerChildren: 0.035,
                  },
                },
              }}
            >
              {groupedSections.map((section) => (
                <motion.section
                  key={section.collection}
                  className="w-full"
                  variants={{
                    hidden: { opacity: 0, y: 14 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      transition: {
                        type: "spring",
                        stiffness: 320,
                        damping: 34,
                        mass: 0.8,
                      },
                    },
                  }}
                >
                  <SectionHeading
                    title={section.collection}
                    count={section.items.length}
                    isLight={isLight}
                  />
                  <div className="grid w-full grid-flow-dense grid-cols-1 gap-3 md:grid-cols-2">
                    {section.items.map((item) => (
                      <GalleryCard
                        key={item.id}
                        item={item}
                        animate={shouldAnimate}
                        prefetchRoute={prefetchRoute}
                        isLight={isLight}
                      />
                    ))}
                  </div>
                </motion.section>
              ))}
            </motion.div>
          )}
        </section>
      </main>

      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-0 z-30 h-36 bg-gradient-to-t to-transparent backdrop-blur-[2px]",
          isLight ? "from-[#f5f2eb] via-[#f5f2eb]/86" : "from-[#030303] via-[#030303]/85"
        )}
      />
      <FilterDock
        search={search}
        setSearch={setSearch}
        sortDirection={sortDirection}
        setSortDirection={setSortDirection}
        collection={collection}
        setCollection={setCollection}
        isLight={isLight}
      />
    </div>
  );
}

function HeroQuickStart({
  isLight,
  animate,
}: {
  isLight: boolean;
  animate: boolean;
}) {
  const introTransition = animate
    ? { type: "spring" as const, stiffness: 360, damping: 34, mass: 0.75 }
    : { duration: 0 };

  return (
    <motion.section
      id="install"
      initial={animate ? { opacity: 0, y: 18, filter: "blur(4px)" } : false}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={introTransition}
      className="pb-28 pt-3"
    >
      <p
        className={cn(
          "font-mono text-[12px] uppercase leading-none tracking-[0.14em]",
          isLight ? "text-[#171717]/38" : "text-[#ededed]/34"
        )}
      >
        Quick start guide
      </p>
      <h1 className="mt-7 text-[28px] font-medium leading-[1.45] tracking-[-0.025em] md:text-[30px]">
        BJÖRK-UI is a small archive of production-ready interface pieces. Copy a
        component, drop it into your app, and tune the details from there.
      </h1>

      <div className="mt-24 space-y-20">
        <CommandBlock
          label="CLI of any component you want"
          command="npx shadcn add @bjork-ui/message-dock"
          isLight={isLight}
        />
        <OutputBlock isLight={isLight} />
      </div>
    </motion.section>
  );
}

function CommandBlock({
  label,
  command,
  isLight,
}: {
  label: string;
  command: string;
  isLight: boolean;
}) {
  return (
    <div>
      <p
        className={cn(
          "mb-5 font-mono text-[12px] uppercase leading-none tracking-[0.14em]",
          isLight ? "text-[#171717]/36" : "text-[#ededed]/32"
        )}
      >
        {label}
      </p>
      <div
        className={cn(
          "flex min-h-[54px] items-center justify-between gap-4 rounded-[16px] px-5 font-mono text-[12px]",
          isLight
            ? "bg-[#faf7f0] text-[#171717]/64 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
            : "bg-[#111111] text-[#ededed]/58 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]"
        )}
      >
        <code className="min-w-0 truncate">
          {command.split("@bjork-ui")[0]}
          <span className={isLight ? "text-[#bd4514]" : "text-[#d86a2c]"}>
            @bjork-ui
          </span>
          {command.split("@bjork-ui")[1]}
        </code>
        <Clipboard className={cn("size-4 shrink-0", isLight ? "text-[#171717]/46" : "text-[#ededed]/52")} />
      </div>
    </div>
  );
}

function OutputBlock({ isLight }: { isLight: boolean }) {
  const lines = [
    "Checking registry",
    "Installing dependencies",
    "Updating components",
  ];

  return (
    <div>
      <p
        className={cn(
          "mb-5 font-mono text-[12px] uppercase leading-none tracking-[0.14em]",
          isLight ? "text-[#171717]/36" : "text-[#ededed]/32"
        )}
      >
        After the CLI you&apos;ll see this output
      </p>
      <div
        className={cn(
          "rounded-[16px] px-5 py-5 font-mono text-[12px]",
          isLight
            ? "bg-[#faf7f0] text-[#171717]/58 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
            : "bg-[#111111] text-[#ededed]/52 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]"
        )}
      >
        <p>
          <span className={isLight ? "text-[#171717]/34" : "text-[#ededed]/30"}>
            &gt;
          </span>{" "}
          npx shadcn add{" "}
          <span className={isLight ? "text-[#bd4514]" : "text-[#d86a2c]"}>
            @bjork-ui
          </span>
          /message-dock
        </p>
        <div className="mt-4 space-y-2">
          {lines.map((line) => (
            <p key={line} className="flex items-center gap-2">
              <Check className={cn("size-3.5", isLight ? "text-[#bd4514]" : "text-[#d86a2c]")} />
              {line}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

function GalleryHeading({
  title,
  count,
  description,
  isLight,
}: {
  title: string;
  count: number;
  description: string;
  isLight: boolean;
}) {
  return (
    <div className="flex w-full flex-col items-start gap-3 pb-7 text-left">
      <p className={cn("font-mono text-[12px] uppercase tracking-[0.14em]", isLight ? "text-[#171717]/36" : "text-[#ededed]/32")}>
        Browse components
      </p>
      <h2 className="relative text-[28px] font-medium leading-tight tracking-[-0.025em]">
        {title}
        <span className={cn("absolute top-0 pl-1 text-sm font-normal", isLight ? "text-[#171717]/38" : "text-[#6f7480]")}>
          [{count || collectionCount}]
        </span>
      </h2>
      <p className={cn("max-w-[540px] text-[15px] leading-[24px]", isLight ? "text-[#171717]/48" : "text-[#ededed]/42")}>
        {description}
      </p>
    </div>
  );
}

function SectionHeading({
  title,
  count,
  isLight,
}: {
  title: string;
  count: number;
  isLight: boolean;
}) {
  return (
    <div className={cn("mb-4 flex items-end justify-between gap-4 border-t pt-4", isLight ? "border-[#ddd7cb]" : "border-white/[0.055]")}>
      <div>
        <h3 className={cn("text-[22px] font-medium tracking-[-0.025em]", isLight ? "text-[#171717]" : "text-[#ededed]")}>
          {title}
          <span className={cn("pl-1 text-sm font-normal", isLight ? "text-[#171717]/38" : "text-[#6f7480]")}>[{count}]</span>
        </h3>
      </div>
      <p className={cn("hidden font-mono text-[11px] uppercase tracking-[0.14em] md:block", isLight ? "text-[#171717]/30" : "text-[#ededed]/25")}>
        Collection
      </p>
    </div>
  );
}

function GalleryCard({
  item,
  animate,
  prefetchRoute,
  isLight,
}: {
  item: GalleryItem;
  animate: boolean;
  prefetchRoute: (route: string) => void;
  isLight: boolean;
}) {
  return (
    <motion.article
      variants={{
        hidden: { opacity: 0, y: 12, scale: 0.985, filter: "blur(3px)" },
        visible: {
          opacity: 1,
          y: 0,
          scale: 1,
          filter: "blur(0px)",
          transition: {
            type: "spring",
            stiffness: 360,
            damping: 32,
            mass: 0.8,
          },
        },
      }}
      initial={animate ? "hidden" : false}
      animate="visible"
      onPointerEnter={() => prefetchRoute(item.route)}
      onFocus={() => prefetchRoute(item.route)}
      className={cn(
        "group relative flex h-[258px] cursor-pointer flex-col overflow-hidden rounded-[16px] border p-2.5 transition-colors duration-300",
        isLight
          ? "border-[#f5ede2] bg-[#fffcf6] shadow-[inset_0_7px_14px_rgba(88,72,49,0.045),inset_0_0.5px_0.5px_rgba(255,255,255,0.92),inset_1px_0_0_rgba(88,72,49,0.026),inset_-1px_0_0_rgba(255,255,255,0.68),0_14px_22px_-9px_rgba(66,52,33,0.11)] hover:border-[#eee6db] hover:bg-[#fffefa]"
          : "border-white/[0.045] bg-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.045),0_16px_34px_-24px_rgba(0,0,0,0.88)] hover:bg-[#151515]"
      )}
    >
      <Link
        href={item.route}
        aria-label={item.title}
        prefetch={false}
        className="relative w-full flex-1 overflow-hidden rounded-[13px]"
      >
        <ComponentPreview item={item} isLight={isLight} />
      </Link>

      <div className="flex items-center justify-between gap-2 px-2 pt-2.5">
        <p className={cn("truncate font-medium tracking-[-0.02em]", isLight ? "text-[#171717]" : "text-[#ededed]")}>
          {item.title}
        </p>
        <div className="flex items-center justify-center gap-2">
          <span className={cn("text-sm font-medium", isLight ? "text-[#171717]/42" : "text-[#ededed]/45")}>{item.id}</span>
        </div>
      </div>
    </motion.article>
  );
}

function ComponentPreview({ item, isLight }: { item: GalleryItem; isLight: boolean }) {
  if (item.preview === "shader") {
    return <ShaderArchivePreview item={item} isLight={isLight} />;
  }

  return (
    <div className={cn("relative h-full w-full overflow-hidden", isLight ? "bg-[#f7f5ef]" : "bg-[#090909]")}>
      <div
        className={cn(
          "absolute inset-0",
          isLight
            ? "bg-[radial-gradient(circle_at_50%_42%,#fffdf7_0%,#f4f0e7_52%,#ebe4d8_100%)]"
            : "bg-[radial-gradient(circle_at_50%_42%,#181818_0%,#0d0d0d_48%,#080808_100%)]"
        )}
      />
      <Image
        src={`/component-previews/${item.slug}${isLight ? "-light" : ""}.png`}
        alt=""
        fill
        sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
        className="object-cover"
        loading="lazy"
        unoptimized
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
    </div>
  );
}

function ShaderArchivePreview({
  item,
  isLight,
}: {
  item: GalleryItem;
  isLight: boolean;
}) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <WebsiteShaderCanvas
        preset={item.slug}
        tone={isLight ? "light" : "dark"}
        className="h-full w-full"
        intensity={0.82}
        maxPixelRatio={0.9}
        maxCanvasPixels={160_000}
      />
    </div>
  );
}

function FilterDock({
  search,
  setSearch,
  sortDirection,
  setSortDirection,
  collection,
  setCollection,
  isLight,
}: {
  search: string;
  setSearch: (value: string) => void;
  sortDirection: "ascending" | "descending";
  setSortDirection: (value: "ascending" | "descending") => void;
  collection: CollectionFilter;
  setCollection: (value: CollectionFilter) => void;
  isLight: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const activeFilterCount = collection === "all" ? 0 : 1;

  return (
    <div className={cn("fixed bottom-8 left-1/2 z-40 flex w-[min(calc(100vw-32px),720px)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 md:flex-nowrap", isLight ? "text-[#171717]" : "text-[#ededed]")}>
      <label
        className={cn(
          "flex h-[45px] min-w-0 flex-1 items-center gap-2 rounded-[13px] px-4 py-2 backdrop-blur-md md:max-w-[320px]",
          isLight
            ? "bg-[#f4f1e9]/95 shadow-[inset_0_7px_14px_rgba(255,255,255,0.5),inset_0_0.5px_0.5px_rgba(255,255,255,0.72),0_10px_20px_-18px_rgba(55,47,36,0.16)]"
            : "bg-[#121212]/95 shadow-[inset_0_7px_14px_rgba(255,255,255,0.03),inset_0_0.5px_0.5px_rgba(255,255,255,0.06),0_14px_20px_-6px_rgba(0,0,0,0.45)]"
        )}
      >
        <Search className={cn("size-4 shrink-0", isLight ? "text-[#171717]/58" : "text-[#ededed]/70")} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search"
          className={cn("min-w-0 flex-1 border-none bg-transparent text-sm outline-none", isLight ? "text-[#171717] placeholder:text-[#171717]/42" : "text-[#ededed] placeholder:text-[#ededed]/45")}
        />
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none flex shrink-0 items-center gap-1 rounded-[7px] px-1.5 py-0.5 font-mono text-[11px] leading-none",
            isLight ? "text-[#171717]/32" : "text-[#ededed]/32"
          )}
        >
          <CommandIcon className="size-3" />
          <span>+</span>
          <span>K</span>
        </span>
      </label>

      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className={cn(
            "flex h-[45px] items-center gap-2 rounded-[13px] px-4 py-2 text-sm backdrop-blur-md transition active:scale-[0.98]",
            isLight
              ? "bg-[#f4f1e9]/95 shadow-[inset_0_7px_14px_rgba(255,255,255,0.5),inset_0_0.5px_0.5px_rgba(255,255,255,0.72),0_10px_20px_-18px_rgba(55,47,36,0.16)] hover:bg-[#ede8dd]"
              : "bg-[#121212]/95 shadow-[inset_0_7px_14px_rgba(255,255,255,0.03),inset_0_0.5px_0.5px_rgba(255,255,255,0.06),0_14px_20px_-6px_rgba(0,0,0,0.45)] hover:bg-[#161616]"
          )}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          <SlidersHorizontal className="size-4" />
          <span>Sort</span>
          {activeFilterCount > 0 && (
            <span className={cn("rounded-md px-1.5 py-0.5 text-xs", isLight ? "bg-[#e4ded2] text-[#171717]/60" : "bg-[#232323] text-[#ededed]/70")}>
              {activeFilterCount}
            </span>
          )}
        </button>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              role="menu"
              initial={{
                opacity: 0,
                x: "var(--filter-menu-x)",
                y: 8,
                scale: 0.98,
                filter: "blur(3px)",
              }}
              animate={{
                opacity: 1,
                x: "var(--filter-menu-x)",
                y: 0,
                scale: 1,
                filter: "blur(0px)",
              }}
              exit={{
                opacity: 0,
                x: "var(--filter-menu-x)",
                y: 8,
                scale: 0.98,
                filter: "blur(3px)",
              }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className={cn(
                "fixed bottom-[88px] left-1/2 w-[min(calc(100vw-32px),360px)] [--filter-menu-x:-50%] overflow-hidden rounded-[18px] border p-3 backdrop-blur-md md:absolute md:bottom-[56px] md:left-auto md:right-0 md:[--filter-menu-x:0px]",
                isLight
                  ? "border-[#ddd7cb] bg-[#f8f6f0]/98 shadow-[inset_0_7px_14px_rgba(255,255,255,0.55),inset_0_0.5px_0.5px_rgba(255,255,255,0.85),0_24px_42px_-24px_rgba(55,47,36,0.28)]"
                  : "border-[#161616] bg-[#121212]/98 shadow-[inset_0_7px_14px_rgba(255,255,255,0.03),inset_0_0.5px_0.5px_rgba(255,255,255,0.06),0_24px_42px_-18px_rgba(0,0,0,0.75)]"
              )}
            >
              <div className="space-y-3">
                <div>
                  <p className={cn("mb-2 px-1 font-mono text-[11px] uppercase tracking-[0.08em]", isLight ? "text-[#171717]/36" : "text-[#ededed]/34")}>
                    Sort
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {sortOptions.map(({ value, label, Icon }) => {
                      const selected = sortDirection === value;

                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() =>
                            setSortDirection(value as "ascending" | "descending")
                          }
                          className={cn(
                            "flex h-10 items-center justify-center gap-2 rounded-[12px] text-sm transition",
                            selected
                              ? isLight
                                ? "bg-[#e4ded2] text-[#171717]"
                                : "bg-[#232323] text-[#ededed]"
                              : isLight
                                ? "bg-[#eee9df] text-[#171717]/42 hover:text-[#171717]/78"
                                : "bg-[#0d0d0d] text-[#ededed]/35 hover:text-[#ededed]/75"
                          )}
                          aria-pressed={selected}
                        >
                          <Icon className="size-4" />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className={cn("mb-2 px-1 font-mono text-[11px] uppercase tracking-[0.08em]", isLight ? "text-[#171717]/36" : "text-[#ededed]/34")}>
                    Collection
                  </p>
                  <div className="grid max-h-[230px] grid-cols-2 gap-2 overflow-y-auto pr-1">
                    {collectionFilters.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setCollection(value)}
                        className={cn(
                          "h-9 rounded-[11px] px-3 text-left text-sm transition",
                          collection === value
                            ? isLight
                              ? "bg-[#e4ded2] text-[#171717]"
                              : "bg-[#232323] text-[#ededed]"
                            : isLight
                              ? "bg-[#eee9df] text-[#171717]/42 hover:text-[#171717]/78"
                              : "bg-[#0d0d0d] text-[#ededed]/35 hover:text-[#ededed]/75"
                        )}
                        aria-pressed={collection === value}
                      >
                        {getCollectionLabel(value)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {collection !== "all" && (
        <button
          type="button"
          onClick={() => setCollection("all")}
          className={cn(
            "flex h-[45px] items-center gap-2 rounded-[13px] px-3 text-sm transition",
            isLight
              ? "bg-[#f4f1e9]/95 text-[#171717]/45 shadow-[inset_0_7px_14px_rgba(255,255,255,0.5),inset_0_0.5px_0.5px_rgba(255,255,255,0.72),0_10px_20px_-18px_rgba(55,47,36,0.16)] hover:text-[#171717]/80"
              : "bg-[#121212]/95 text-[#ededed]/45 shadow-[inset_0_7px_14px_rgba(255,255,255,0.03),inset_0_0.5px_0.5px_rgba(255,255,255,0.06),0_14px_20px_-6px_rgba(0,0,0,0.45)] hover:text-[#ededed]/80"
          )}
          aria-label="Clear collection filter"
        >
          {getCollectionLabel(collection)}
          <X className="size-3 rotate-45" />
        </button>
      )}

    </div>
  );
}
