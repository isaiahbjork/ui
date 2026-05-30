"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  Copy,
  ExternalLink,
  Monitor,
  PanelRightOpen,
  Search,
  Smartphone,
  Tablet,
  X,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { GalleryItem } from "@/lib/bjork-gallery";
import { SiteHeader } from "@/components/site-header";

type DeviceMode = "desktop" | "tablet" | "mobile";
type SurfaceMode = "dark" | "light" | "grid";

interface ComponentDetailClientProps {
  item: GalleryItem;
  items: GalleryItem[];
}

const deviceWidths: Record<DeviceMode, string> = {
  desktop: "w-full",
  tablet: "w-[820px] max-w-full",
  mobile: "w-[390px] max-w-full",
};

export function ComponentDetailClient({
  item,
  items,
}: ComponentDetailClientProps) {
  const [search, setSearch] = useState("");
  const [hoveredItem, setHoveredItem] = useState<GalleryItem | null>(null);
  const [device, setDevice] = useState<DeviceMode>("desktop");
  const [surface, setSurface] = useState<SurfaceMode>("dark");
  const [showCode, setShowCode] = useState(false);
  const [source, setSource] = useState("");
  const [sourcePath, setSourcePath] = useState(item.sourcePath);
  const [sourceLoading, setSourceLoading] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const filteredItems = useMemo(() => {
    const normalized = search.trim().toLowerCase();

    return items.filter((entry) => {
      if (!normalized) return true;

      return (
        entry.title.toLowerCase().includes(normalized) ||
        entry.collection.toLowerCase().includes(normalized) ||
        entry.id.toLowerCase().includes(normalized)
      );
    });
  }, [items, search]);

  useEffect(() => {
    if (!showCode) return;

    let mounted = true;

    async function loadSource() {
      setSourceLoading(true);
      const response = await fetch(`/api/component-source?slug=${item.slug}`);
      const payload = (await response.json()) as {
        source?: string;
        path?: string;
        error?: string;
      };

      if (!mounted) return;

      setSource(payload.source ?? payload.error ?? "Source unavailable");
      setSourcePath(payload.path ?? item.sourcePath);
      setSourceLoading(false);
    }

    loadSource();

    return () => {
      mounted = false;
    };
  }, [item.slug, item.sourcePath, showCode]);

  return (
    <div className="min-h-screen overflow-hidden bg-[#080808] text-[#ededed] selection:bg-sky-300/20 selection:text-sky-100">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 h-24 bg-gradient-to-b from-[#080808] via-[#080808]/80 to-transparent backdrop-blur-[2px]" />

      <SiteHeader />

      <aside className="fixed bottom-0 left-0 top-0 z-30 hidden w-[310px] border-r border-[#161616] bg-[#0b0b0b]/92 px-3 pb-4 pt-[86px] backdrop-blur-xl lg:block">
        <div className="flex h-full flex-col rounded-[20px] border border-[#161616] bg-[#121212] p-3 shadow-[inset_0_7px_14px_rgba(255,255,255,0.03),inset_0_0.5px_0.5px_rgba(255,255,255,0.06),0_14px_20px_-6px_rgba(0,0,0,0.45)]">
          <label className="mb-3 flex h-[42px] items-center gap-2 rounded-[13px] bg-[#080808] px-3">
            <Search className="size-4 text-[#ededed]/45" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search"
              className="w-full bg-transparent text-sm outline-none placeholder:text-[#ededed]/35"
            />
          </label>

          <div className="scroll-fade-y flex-1 space-y-1 overflow-auto pr-1">
            {filteredItems.map((entry) => {
              const active = entry.slug === item.slug;

              return (
                <Link
                  key={entry.slug}
                  href={`/components/${entry.slug}`}
                  onMouseEnter={() => setHoveredItem(entry)}
                  onMouseLeave={() => setHoveredItem(null)}
                  className={cn(
                    "group relative flex items-center justify-between gap-3 rounded-[14px] px-3 py-2 text-sm transition",
                    active
                      ? "bg-[#232323] text-[#ededed]"
                      : "text-[#ededed]/45 hover:bg-[#191919] hover:text-[#ededed]"
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium tracking-[-0.02em]">
                      {entry.title}
                    </span>
                    <span className="block truncate text-xs text-[#ededed]/30">
                      {entry.collection}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-[#ededed]/30">
                    {entry.id}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {hoveredItem && (
          <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -8, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={
              shouldReduceMotion
                ? { duration: 0.12 }
                : { type: "spring", stiffness: 360, damping: 30, mass: 0.7 }
            }
            className="pointer-events-none absolute left-[296px] top-[118px] z-50 hidden w-[360px] rounded-[22px] border border-[#232323] bg-[#121212] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.55)] lg:block"
          >
            <LiveFrame
              title={hoveredItem.title}
              route={hoveredItem.route}
              className="h-[210px] rounded-2xl"
              scale={0.55}
            />
            <div className="flex items-center justify-between px-2 pt-2">
              <p className="truncate text-sm font-medium">{hoveredItem.title}</p>
              <p className="text-xs text-[#ededed]/35">{hoveredItem.id}</p>
            </div>
          </motion.div>
        )}
      </aside>

      <main className="flex min-h-screen flex-col pt-[86px] lg:pl-[310px]">
        <section className="flex min-h-screen flex-col px-4 pb-8 md:px-8">
          <div className="mb-4 flex flex-col justify-between gap-4 rounded-[20px] border border-[#161616] bg-[#121212] p-3 shadow-[inset_0_7px_14px_rgba(255,255,255,0.03),inset_0_0.5px_0.5px_rgba(255,255,255,0.06),0_14px_20px_-6px_rgba(0,0,0,0.45)] md:flex-row md:items-center">
            <div className="min-w-0 px-2">
              <div className="mb-1 flex items-center gap-2 text-xs text-[#ededed]/35">
                <Link href="/" className="inline-flex items-center gap-1 hover:text-[#ededed]">
                  <ChevronLeft className="size-3.5" />
                  Gallery
                </Link>
                <span>/</span>
                <span>{item.collection}</span>
              </div>
              <h1 className="truncate text-xl font-semibold tracking-[-0.03em] md:text-2xl">
                {item.title}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl
                value={device}
                options={[
                  { value: "desktop", label: "Desktop", icon: Monitor },
                  { value: "tablet", label: "Tablet", icon: Tablet },
                  { value: "mobile", label: "Mobile", icon: Smartphone },
                ]}
                onChange={(value) => setDevice(value as DeviceMode)}
              />
              <SegmentedControl
                value={surface}
                options={[
                  { value: "dark", label: "Dark" },
                  { value: "light", label: "Light" },
                  { value: "grid", label: "Grid" },
                ]}
                onChange={(value) => setSurface(value as SurfaceMode)}
              />
              <button
                type="button"
                onClick={() => setShowCode((value) => !value)}
                className={cn(
                  "flex h-10 items-center gap-2 rounded-[13px] px-3 text-sm transition active:scale-95",
                  showCode
                    ? "bg-[#ededed] text-black"
                    : "bg-[#232323] text-[#ededed]"
                )}
              >
                <PanelRightOpen className="size-4" />
                Code
              </button>
              <Link
                href={item.route}
                target="_blank"
                className="flex h-10 items-center gap-2 rounded-[13px] bg-[#232323] px-3 text-sm transition hover:bg-[#2b2b2b] active:scale-95"
              >
                <ExternalLink className="size-4" />
                Route
              </Link>
            </div>
          </div>

          <div
            className={cn(
              "relative flex flex-1 items-center justify-center overflow-hidden rounded-[26px] border border-[#161616] p-4 shadow-[inset_0_7px_14px_rgba(255,255,255,0.03),inset_0_0.5px_0.5px_rgba(255,255,255,0.06),0_14px_20px_-6px_rgba(0,0,0,0.45)] md:p-8",
              surface === "dark" && "bg-[#101010]",
              surface === "light" && "bg-[#f5f4f3]",
              surface === "grid" &&
                "bg-[#101010] [background-image:linear-gradient(rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:34px_34px]"
            )}
          >
            <div
              className={cn(
                "relative h-[calc(100vh-190px)] min-h-[520px] overflow-hidden rounded-[22px] border border-[#232323] bg-[#080808] transition-all duration-300",
                deviceWidths[device]
              )}
            >
              <LiveFrame title={item.title} route={item.route} className="h-full" />
            </div>
          </div>
        </section>
      </main>

      <CodeDrawer
        open={showCode}
        onClose={() => setShowCode(false)}
        source={source}
        sourcePath={sourcePath}
        loading={sourceLoading}
      />
    </div>
  );
}

function LiveFrame({
  route,
  title,
  className,
  scale = 1,
}: {
  route: string;
  title: string;
  className?: string;
  scale?: number;
}) {
  return (
    <div className={cn("relative overflow-hidden bg-[#080808]", className)}>
      <iframe
        title={title}
        src={route}
        className="absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2 border-0"
        style={{
          width: `${100 / scale}%`,
          height: `${100 / scale}%`,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      />
    </div>
  );
}

function SegmentedControl({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{
    value: string;
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
  }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex h-10 items-center rounded-[13px] bg-[#232323] p-1">
      {options.map((option) => {
        const Icon = option.icon;
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-sm transition",
              active ? "bg-[#ededed] text-black" : "text-[#ededed]/35 hover:text-[#ededed]"
            )}
          >
            {Icon && <Icon className="size-3.5" />}
            <span className="hidden md:inline">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function CodeDrawer({
  open,
  onClose,
  source,
  sourcePath,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  source: string;
  sourcePath: string;
  loading: boolean;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.aside
      initial={false}
      animate={{
        x: open ? 0 : "calc(100% + 24px)",
      }}
      transition={
        shouldReduceMotion
          ? { duration: 0.12 }
          : { type: "spring", stiffness: 320, damping: 34 }
      }
      aria-hidden={!open}
      className="fixed bottom-4 right-4 top-[86px] z-50 flex w-[min(720px,calc(100vw-32px))] flex-col overflow-hidden rounded-[24px] border border-[#232323] bg-[#121212]/98 shadow-[0_24px_100px_rgba(0,0,0,0.65)] backdrop-blur-xl"
    >
      <div className="flex items-center justify-between border-b border-[#232323] px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Code drawer</p>
          <p className="truncate font-mono text-xs text-[#ededed]/35">{sourcePath}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(source)}
            tabIndex={open ? 0 : -1}
            className="flex size-9 items-center justify-center rounded-[12px] bg-[#232323] transition hover:bg-[#2b2b2b] active:scale-95"
            aria-label="Copy source"
          >
            <Copy className="size-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            tabIndex={open ? 0 : -1}
            className="flex size-9 items-center justify-center rounded-[12px] bg-[#232323] transition hover:bg-[#2b2b2b] active:scale-95"
            aria-label="Close code drawer"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <pre className="flex-1 overflow-auto p-4 font-mono text-xs leading-5 text-[#ededed]/70">
        {loading ? "Loading source..." : source}
      </pre>
    </motion.aside>
  );
}
