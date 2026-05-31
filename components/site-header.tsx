"use client";

import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface SiteHeaderProps {
  className?: string;
}

export function SiteHeader({ className }: SiteHeaderProps) {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const shouldReduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [isBrandActive, setIsBrandActive] = useState(false);
  const isLight =
    mounted && (theme === "system" ? resolvedTheme : theme) === "light";
  const iconTravel = isLight ? 18 : -18;
  const iconTransition = shouldReduceMotion
    ? { duration: 0.12, ease: "linear" as const }
    : { type: "spring" as const, stiffness: 420, damping: 28, mass: 0.65 };
  const pronunciationTransition = shouldReduceMotion
    ? { duration: 0.12, ease: "linear" as const }
    : { type: "spring" as const, stiffness: 430, damping: 30, mass: 0.6 };

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header
      className={cn(
        "fixed left-1/2 top-2 z-50 flex w-screen -translate-x-1/2 justify-center overflow-visible px-3 py-0 md:max-w-[744px]",
        className
      )}
    >
      <nav
        className={cn(
          "flex w-full items-center justify-between rounded-[16px] border px-5 py-2.5 pr-2.5 backdrop-blur-xl",
          isLight
            ? "border-[#f0e8dc] bg-[#fffcf6]/96 shadow-[inset_0_7px_14px_rgba(88,72,49,0.035),inset_0_0.5px_0.5px_rgba(255,255,255,0.92),inset_1px_0_0_rgba(88,72,49,0.018),inset_-1px_0_0_rgba(255,255,255,0.7),0_16px_34px_-28px_rgba(69,58,41,0.26)]"
            : "border-[#161616] bg-[#121212]/92 shadow-[inset_0_7px_14px_rgba(255,255,255,0.03),inset_0_0.5px_0.5px_rgba(255,255,255,0.06),0_18px_34px_-16px_rgba(0,0,0,0.9)]"
        )}
      >
        <Link
          href="/"
          aria-label="BJÖRK-UI home, pronounced b middle dot york"
          onMouseEnter={() => setIsBrandActive(true)}
          onMouseLeave={() => setIsBrandActive(false)}
          onFocus={() => setIsBrandActive(true)}
          onBlur={() => setIsBrandActive(false)}
          className={cn(
            "relative flex items-center rounded-md py-1 text-sm font-semibold tracking-tight outline-offset-4 transition focus-visible:outline-1",
            isLight
              ? "text-[#171717] outline-[#ec5c13]"
              : "text-[#ededed] outline-sky-500"
          )}
        >
          <span aria-hidden="true">BJÖRK-UI</span>
          <AnimatePresence>
            {isBrandActive ? (
              <motion.span
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute left-[calc(100%+9px)] top-1/2 hidden -translate-y-1/2 whitespace-nowrap font-mono text-[10px] font-medium leading-none tracking-[0.08em] sm:inline-flex",
                  isLight ? "text-[#171717]/42" : "text-[#ededed]/42"
                )}
                initial={
                  shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -6 }
                }
                animate={{ opacity: 1, x: 0 }}
                exit={
                  shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -4 }
                }
                transition={pronunciationTransition}
              >
                [b·york]
              </motion.span>
            ) : null}
          </AnimatePresence>
        </Link>

        <div
          className={cn(
            "flex items-center gap-3 text-[13px]",
            isLight ? "text-[#171717]/50" : "text-[#ededed]/50"
          )}
        >
          <button
            type="button"
            aria-label={isLight ? "Use dark mode" : "Use light mode"}
            onClick={() => setTheme(isLight ? "dark" : "light")}
            className={cn(
              "relative flex size-8 items-center justify-center overflow-hidden rounded-[12px] outline-offset-4 transition active:scale-95 focus-visible:outline-1",
              isLight
                ? "bg-[#e8e3d8]/78 text-[#171717]/66 outline-[#ec5c13] hover:bg-[#e1dbcf] hover:text-[#171717]"
                : "bg-[#232323] text-[#ededed]/74 outline-sky-500 hover:bg-[#2a2a2a] hover:text-[#ededed]"
            )}
          >
            <AnimatePresence custom={iconTravel} initial={false} mode="popLayout">
              <motion.span
                key={isLight ? "sun" : "moon"}
                aria-hidden
                className="absolute flex size-4 items-center justify-center"
                custom={iconTravel}
                variants={{
                  initial: (travel: number) => ({
                    y: travel,
                    opacity: 0,
                    scale: 0.78,
                    rotate: travel > 0 ? -18 : 18,
                  }),
                  animate: { y: 0, opacity: 1, scale: 1, rotate: 0 },
                  exit: (travel: number) => ({
                    y: travel,
                    opacity: 0,
                    scale: 0.78,
                    rotate: travel > 0 ? 18 : -18,
                  }),
                }}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={iconTransition}
              >
                {isLight ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </motion.span>
            </AnimatePresence>
          </button>
        </div>
      </nav>
    </header>
  );
}
