"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Download, RefreshCw, Type } from "lucide-react";
import { cn } from "@/lib/utils";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const lower = "abcdefghijklmnopqrstuvwxyz";
const accents = "Björk UI  ÄÖÜ  åéö  façade";
const numerals = "0123456789";
const punctuation = ". , : ; - / @ & ( )";

const samples = [
  "BJÖRK UI",
  "Component archive",
  "Motion systems for real interfaces",
  "Glass panels, dense tables, quiet controls",
  "Build archive 05.13.26",
];

const weights = [
  { label: "Regular", className: "font-normal" },
  { label: "Medium", className: "font-medium" },
  { label: "Semibold", className: "font-semibold" },
  { label: "Bold", className: "font-bold" },
  { label: "Italic", className: "font-normal italic" },
  { label: "Bold italic", className: "font-bold italic" },
];

const specimenRows = [
  { label: "Display", className: "font-bjork-display font-normal" },
  { label: "Alpha regular", className: "font-bjork-alpha font-normal" },
  { label: "Current site", className: "font-sans" },
  { label: "Raster accent", className: "font-raster" },
];

const interfaceRows = [
  ["Active users", "12,840", "+8.4%"],
  ["Avg. session", "04:19", "+0.7%"],
  ["Latency", "38ms", "-12.1%"],
];

const scoringRows = [
  ["Alpha score", "86.67"],
  ["Display score", "87.55"],
  ["Small density", "0.87777"],
  ["Rhythm", "0.96887"],
];

export default function BjorkFontPage() {
  const shouldReduceMotion = useReducedMotion();
  const shouldAnimate = !shouldReduceMotion;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#080808] text-[#ededed] selection:bg-sky-300/20 selection:text-sky-100">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 h-24 bg-gradient-to-b from-[#080808] via-[#080808]/80 to-transparent backdrop-blur-[2px]" />

      <header className="fixed left-1/2 top-0 z-50 flex w-screen -translate-x-1/2 justify-center px-3 py-2 md:max-w-3xl">
        <nav className="flex w-full items-center justify-between rounded-2xl border border-[#1b1b1b] bg-[#121212]/95 px-4 py-2.5 shadow-[inset_0_7px_14px_rgba(255,255,255,0.03),inset_0_0.5px_0.5px_rgba(255,255,255,0.06),0_14px_20px_-6px_rgba(0,0,0,0.45)] backdrop-blur-md">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md py-1 text-sm font-semibold tracking-tight text-[#ededed] outline-offset-4 outline-sky-500 transition hover:text-white focus-visible:outline-1"
          >
            <ArrowLeft className="size-4" />
            BJÖRK-UI
          </Link>
          <div className="flex items-center gap-2">
            <a
              href="/fonts/BjorkGroteskAlpha-Regular-v12.woff2"
              className="flex size-8 items-center justify-center rounded-[12px] bg-[#232323] text-[#ededed] transition hover:bg-[#2c2c2c] active:scale-95"
              aria-label="Download Bjork Grotesk Alpha"
            >
              <Download className="size-4" />
            </a>
            <Link
              href="/type/bjork-font"
              className="flex size-8 items-center justify-center rounded-[12px] bg-[#232323] text-[#ededed] transition hover:bg-[#2c2c2c] active:scale-95"
              aria-label="Refresh specimen"
            >
              <RefreshCw className="size-4" />
            </Link>
          </div>
        </nav>
      </header>

      <motion.section
        className="mx-auto flex w-full max-w-7xl flex-col px-5 pb-28 pt-36 md:px-10 lg:pt-40"
        initial={shouldAnimate ? { opacity: 0, y: 18, filter: "blur(8px)" } : false}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ type: "spring", stiffness: 280, damping: 30, mass: 0.8 }}
      >
        <div className="mb-12 flex flex-col gap-6 md:mb-16 md:flex-row md:items-end md:justify-between">
          <div className="max-w-4xl">
            <div className="mb-5 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.1em] text-[#ededed]/38">
              <Type className="size-3.5" />
              Bjork Grotesk Alpha
            </div>
            <h1 className="font-bjork-display text-[clamp(58px,10vw,150px)] font-normal leading-[0.78] tracking-[-0.02em] text-white">
              BJÖRK UI FONT
            </h1>
          </div>
          <p className="max-w-sm text-sm leading-6 text-[#ededed]/52 md:pb-2">
            Optical family cut. Display handles the identity moments; Alpha stays
            calmer for labels, buttons, body copy, and data-heavy surfaces.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.08fr_0.92fr]">
          <section className="rounded-[18px] border border-[#1b1b1b] bg-[#101010] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-7">
            <div className="mb-8 flex items-center justify-between gap-4">
              <h2 className="font-mono text-xs uppercase tracking-[0.1em] text-[#ededed]/38">
                Character set
              </h2>
              <span className="rounded-md bg-[#202020] px-2 py-1 font-mono text-[11px] text-[#ededed]/44">
                WOFF2 family
              </span>
            </div>
            <SpecimenLine value={alphabet} size="large" display />
            <SpecimenLine value={lower} size="medium" />
            <SpecimenLine value={accents} size="small" />
            <SpecimenLine value={numerals} size="medium" />
            <SpecimenLine value={punctuation} size="small" />
          </section>

          <section className="rounded-[18px] border border-[#1b1b1b] bg-[#101010] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-7">
            <h2 className="mb-8 font-mono text-xs uppercase tracking-[0.1em] text-[#ededed]/38">
              UI pressure test
            </h2>
            <div className="space-y-3">
              {samples.map((sample, index) => (
                <motion.button
                  key={sample}
                  type="button"
                  className="group flex w-full items-center justify-between rounded-[13px] border border-[#232323] bg-[#151515] px-4 py-3 text-left transition hover:border-[#333] hover:bg-[#191919] focus-visible:outline focus-visible:outline-1 focus-visible:outline-sky-500"
                  whileHover={shouldAnimate ? { y: -2, scale: 1.01 } : undefined}
                  whileTap={shouldAnimate ? { scale: 0.985 } : undefined}
                  transition={{ type: "spring", stiffness: 420, damping: 28 }}
                >
                  <span
                    className={cn(
                      "font-normal leading-none tracking-[-0.01em] text-[#ededed]",
                      index === 0
                        ? "font-bjork-display text-[28px]"
                        : "font-bjork-alpha text-[24px]"
                    )}
                  >
                    {sample}
                  </span>
                  <span className="font-mono text-[11px] text-[#ededed]/28">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </motion.button>
              ))}
            </div>
          </section>
        </div>

        <section className="mt-3 rounded-[18px] border border-[#1b1b1b] bg-[#101010] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-7">
          <h2 className="mb-8 font-mono text-xs uppercase tracking-[0.1em] text-[#ededed]/38">
            Weights and styles
          </h2>
          <div className="space-y-5">
            {weights.map((weight) => (
              <div
                key={weight.label}
                className="grid gap-3 border-b border-[#202020] pb-5 last:border-0 last:pb-0 md:grid-cols-[160px_1fr]"
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#ededed]/34">
                  {weight.label}
                </p>
                <p
                  className={cn(
                    "font-bjork-alpha text-[clamp(28px,4.2vw,58px)] leading-[0.95] tracking-[-0.02em] text-[#ededed]",
                    weight.className
                  )}
                >
                  Quiet grotesk systems for Bjork UI
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-3 rounded-[18px] border border-[#1b1b1b] bg-[#101010] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-7">
          <h2 className="mb-8 font-mono text-xs uppercase tracking-[0.1em] text-[#ededed]/38">
            Objective score
          </h2>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-[#202020] bg-[#202020] md:grid-cols-4">
            {scoringRows.map(([label, value]) => (
              <div key={label} className="bg-[#111] p-4 font-bjork-alpha">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#ededed]/34">
                  {label}
                </p>
                <p className="mt-3 text-3xl font-normal tracking-[-0.02em] text-[#ededed]">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="rounded-[18px] border border-[#1b1b1b] bg-[#101010] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-7">
            <h2 className="mb-8 font-mono text-xs uppercase tracking-[0.1em] text-[#ededed]/38">
              Interface scale
            </h2>
            <div className="space-y-4 font-bjork-alpha">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#ededed]/36">
                  Status label
                </p>
                <p className="mt-2 text-sm font-normal leading-5 text-[#ededed]/72">
                  Synced 1,248 interface events across 38 active components.
                </p>
              </div>
              <button
                type="button"
                className="w-full rounded-[13px] border border-[#2a2a2a] bg-[#ededed] px-4 py-3 text-left text-sm font-medium text-[#111] transition hover:bg-white active:scale-[0.99]"
              >
                Review Bjork UI specimen
              </button>
              <p className="max-w-md text-base font-normal leading-7 text-[#ededed]/68">
                A restrained grotesk for labels, dense tables, component names,
                and quiet product surfaces.
              </p>
            </div>
          </div>

          <div className="rounded-[18px] border border-[#1b1b1b] bg-[#101010] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-7">
            <h2 className="mb-8 font-mono text-xs uppercase tracking-[0.1em] text-[#ededed]/38">
              Numeric rhythm
            </h2>
            <div className="font-bjork-alpha">
              {interfaceRows.map(([label, value, delta]) => (
                <div
                  key={label}
                  className="grid grid-cols-[1fr_120px_80px] items-center border-b border-[#202020] py-3 last:border-0"
                >
                  <span className="text-sm font-normal text-[#ededed]/58">{label}</span>
                  <span className="text-right text-xl font-normal text-[#ededed]">{value}</span>
                  <span className="text-right text-sm font-medium text-[#ededed]/48">{delta}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-3 rounded-[18px] border border-[#1b1b1b] bg-[#101010] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:p-7">
          <h2 className="mb-8 font-mono text-xs uppercase tracking-[0.1em] text-[#ededed]/38">
            Comparison
          </h2>
          <div className="space-y-7">
            {specimenRows.map((row) => (
              <div key={row.label} className="grid gap-3 border-b border-[#202020] pb-7 last:border-0 last:pb-0 md:grid-cols-[160px_1fr]">
                <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#ededed]/34">
                  {row.label}
                </p>
                <div className={cn(row.className, "overflow-hidden text-[clamp(38px,6vw,86px)] leading-[0.9] tracking-[-0.025em] text-[#ededed]")}>
                  System archive for tactile product interfaces
                </div>
              </div>
            ))}
          </div>
        </section>
      </motion.section>
    </main>
  );
}

function SpecimenLine({
  value,
  size,
  display = false,
}: {
  value: string;
  size: "small" | "medium" | "large";
  display?: boolean;
}) {
  return (
    <p
      className={cn(
        "mb-5 overflow-hidden break-all border-b border-[#202020] pb-5 leading-none tracking-[-0.015em] text-[#ededed] last:mb-0 last:border-0 last:pb-0",
        display ? "font-bjork-display" : "font-bjork-alpha",
        size === "large" && "text-[clamp(48px,8vw,112px)]",
        size === "medium" && "text-[clamp(36px,5.6vw,76px)]",
        size === "small" && "text-[clamp(30px,4vw,54px)]"
      )}
    >
      {value}
    </p>
  );
}
