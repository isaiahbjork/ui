"use client";

import * as React from "react";
import {
  Check,
  Code2,
  Component as ComponentIcon,
  Copy,
  Moon,
  Sun,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export interface PrimitivePreviewExample {
  label: string;
  description: string;
  code: string;
  preview: React.ReactNode;
  previewClassName?: string;
}

interface PropRow {
  name: string;
  value: string;
  description: string;
}

function useIsLightTheme() {
  const { resolvedTheme, theme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [documentTheme, setDocumentTheme] = React.useState<"light" | "dark" | null>(null);

  React.useEffect(() => {
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

export function PrimitiveDocsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const isLight = useIsLightTheme();

  return (
    <section className="space-y-4 pt-16">
      <h2
        className={cn(
          "font-mono text-xs uppercase tracking-[0.08em]",
          isLight ? "text-[#171717]/38" : "text-[#ededed]/34",
        )}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

export function PrimitivePreviewExamples({
  examples,
  className,
}: {
  examples: readonly PrimitivePreviewExample[];
  className?: string;
}) {
  const isLight = useIsLightTheme();
  const shouldReduceMotion = useReducedMotion();
  const [flipped, setFlipped] = React.useState<Record<string, boolean>>({});
  const [isStaticPreview, setIsStaticPreview] = React.useState(false);

  React.useEffect(() => {
    setIsStaticPreview(
      new URLSearchParams(window.location.search).get("preview") === "1",
    );
  }, []);

  const toggleCode = React.useCallback((label: string) => {
    setFlipped((current) => ({
      ...current,
      [label]: !current[label],
    }));
  }, []);

  if (isStaticPreview) {
    return <PrimitiveStaticPreview examples={examples} isLight={isLight} />;
  }

  return (
    <div className={cn("hide-scrollbar w-full py-2 lg:h-full lg:overflow-y-auto lg:pr-2", className)}>
      <div className="mx-auto w-full max-w-[1040px] space-y-10 pb-12">
        {examples.map((example) => (
          <PrimitiveExamplePanel
            key={example.label}
            example={example}
            isLight={isLight}
            shouldReduceMotion={Boolean(shouldReduceMotion)}
            flipped={Boolean(flipped[example.label])}
            onCodeToggle={() => toggleCode(example.label)}
          />
        ))}
      </div>
    </div>
  );
}

function PrimitiveStaticPreview({
  examples,
  isLight,
}: {
  examples: readonly PrimitivePreviewExample[];
  isLight: boolean;
}) {
  const featuredExample = examples[0];

  return (
    <div
      className={cn(
        "flex h-[520px] w-[900px] items-center justify-center overflow-hidden",
        isLight ? "bg-[#f7f5ef] text-[#171717]" : "bg-[#111] text-[#ededed]",
      )}
    >
      <div
        className={cn(
          "flex w-[620px] items-center justify-center",
          isLight ? "text-[#171717]" : "text-[#ededed]",
        )}
      >
        {featuredExample && (
          <div
            className={cn(
              "flex min-h-[260px] min-w-0 items-center justify-center overflow-visible",
              featuredExample.previewClassName,
            )}
          >
            <div className="flex origin-center scale-[1.9] items-center justify-center">
              {featuredExample.preview}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PrimitiveExamplePanel({
  example,
  isLight,
  shouldReduceMotion,
  flipped,
  onCodeToggle,
}: {
  example: PrimitivePreviewExample;
  isLight: boolean;
  shouldReduceMotion: boolean;
  flipped: boolean;
  onCodeToggle: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const flipTransition = shouldReduceMotion
    ? { duration: 0.12, ease: "easeOut" }
    : { type: "spring", stiffness: 260, damping: 28, mass: 0.72 };

  React.useEffect(() => {
    if (!copied) return;

    const timeout = window.setTimeout(() => setCopied(false), 1400);

    return () => window.clearTimeout(timeout);
  }, [copied]);

  const copyCode = React.useCallback(async () => {
    await navigator.clipboard.writeText(example.code);
    setCopied(true);
  }, [example.code]);

  return (
    <section className="min-w-0">
      <motion.div
        layout
        transition={
          shouldReduceMotion
            ? { duration: 0.12, ease: "easeOut" }
            : { type: "spring", stiffness: 260, damping: 32, mass: 0.82 }
        }
        className={cn(
          "relative min-h-[260px] w-full rounded-[24px] sm:min-h-[320px] lg:min-h-[390px]",
          "[perspective:1600px]",
        )}
      >
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={flipTransition}
          className="absolute inset-0 rounded-[24px] [transform-style:preserve-3d]"
        >
          <div
            aria-hidden={flipped}
            inert={flipped ? true : undefined}
            className={cn(
              "absolute inset-0 flex items-center justify-center overflow-hidden rounded-[24px] p-2 [backface-visibility:hidden]",
              isLight ? "bg-[#f7f5ef] text-[#171717]" : "bg-[#111] text-[#ededed]",
              flipped && "pointer-events-none",
            )}
          >
            <PrimitiveCodeToggle
              isLight={isLight}
              focusable={!flipped}
              onClick={onCodeToggle}
            />
            <div
              className={cn(
                "flex min-h-[240px] w-full items-center justify-center rounded-[18px] p-6 sm:min-h-[300px] sm:p-8 lg:min-h-[370px]",
                isLight ? "bg-[#f7f5ef]" : "bg-[#111]",
                example.previewClassName,
              )}
            >
              {example.preview}
            </div>
          </div>

          <div
            aria-hidden={!flipped}
            inert={!flipped ? true : undefined}
            className={cn(
              "absolute inset-0 overflow-hidden rounded-[24px] p-5 [backface-visibility:hidden] [transform:rotateY(180deg)] sm:p-7",
              isLight ? "bg-[#f7f5ef] text-[#171717]" : "bg-[#111] text-[#ededed]",
              !flipped && "pointer-events-none",
            )}
          >
            <div className="flex h-full min-h-0 flex-col gap-4 sm:gap-5">
              <div className="flex shrink-0 items-start justify-between gap-5">
                <div className="max-w-[720px] text-left">
                  <h3
                    className={cn(
                      "text-xl font-medium leading-none tracking-[-0.03em] sm:text-2xl",
                      isLight ? "text-[#171717]/88" : "text-[#ededed]/92",
                    )}
                  >
                    {example.label}
                  </h3>
                  <p
                    className={cn(
                      "mt-3 max-w-[62ch] text-left text-[13px] leading-6 sm:text-sm",
                      isLight ? "text-[#171717]/50" : "text-[#ededed]/46",
                    )}
                  >
                    {example.description}
                  </p>
                </div>
                <PrimitiveComponentToggle
                  isLight={isLight}
                  focusable={flipped}
                  onClick={onCodeToggle}
                />
              </div>
              <div
                className={cn(
                  "relative min-h-0 flex-1 overflow-hidden rounded-[16px]",
                  isLight
                    ? "bg-[#e8e3d8] shadow-[inset_0_1px_0_rgba(255,255,255,0.74),inset_0_14px_32px_rgba(92,78,54,0.07)]"
                    : "bg-[#070707] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_16px_34px_rgba(0,0,0,0.42)]",
                )}
              >
                <button
                  type="button"
                  aria-label={copied ? "Copied code" : "Copy code"}
                  tabIndex={flipped ? 0 : -1}
                  onClick={copyCode}
                  className={cn(
                    "absolute right-4 top-4 z-10 inline-flex size-5 items-center justify-center transition active:scale-95",
                    isLight
                      ? "text-[#171717]/36 hover:text-[#171717]/74 focus-visible:text-[#171717]/74"
                      : "text-[#ededed]/34 hover:text-[#ededed]/74 focus-visible:text-[#ededed]/74",
                  )}
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </button>
                <pre
                  className={cn(
                    "h-full min-h-0 overflow-auto whitespace-pre-wrap p-4 pr-12 font-mono text-[11px] leading-5 sm:p-5 sm:pr-14 sm:text-xs",
                    isLight ? "text-[#171717]/76" : "text-[#ededed]/68",
                  )}
                >
                  <code>
                    <HighlightedPrimitiveCode code={example.code} isLight={isLight} />
                  </code>
                </pre>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}

function HighlightedPrimitiveCode({
  code,
  isLight,
}: {
  code: string;
  isLight: boolean;
}) {
  const pattern =
    /(\/\/.*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b(?:import|from|export|function|return|const|let|type|interface|if|else|true|false|undefined|null)\b|<\/?[A-Z][\w.]*|[a-zA-Z_$][\w$-]*(?==))/g;

  return (
    <>
      {code.split("\n").map((line, lineIndex) => {
        const parts = line.split(pattern).filter(Boolean);

        return (
          <span key={`${line}-${lineIndex}`} className="block">
            {parts.map((part, partIndex) => (
              <span
                key={`${lineIndex}-${partIndex}`}
                className={getPrimitiveTokenClassName(part, isLight)}
              >
                {part}
              </span>
            ))}
          </span>
        );
      })}
    </>
  );
}

function getPrimitiveTokenClassName(token: string, isLight: boolean) {
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

function PrimitiveCodeToggle({
  isLight,
  focusable,
  onClick,
}: {
  isLight: boolean;
  focusable: boolean;
  onClick: () => void;
}) {
  const { setTheme } = useTheme();

  return (
    <PrimitiveControlGroup isLight={isLight}>
      <PrimitiveToolbarButton
        label="Show usage"
        isLight={isLight}
        focusable={focusable}
        onClick={onClick}
      >
        <Code2 className="size-3.5" />
      </PrimitiveToolbarButton>
      <PrimitiveToolbarButton
        label={isLight ? "Use dark mode" : "Use light mode"}
        isLight={isLight}
        focusable={focusable}
        onClick={() => setTheme(isLight ? "dark" : "light")}
      >
        {isLight ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
      </PrimitiveToolbarButton>
    </PrimitiveControlGroup>
  );
}

function PrimitiveComponentToggle({
  isLight,
  focusable,
  onClick,
}: {
  isLight: boolean;
  focusable: boolean;
  onClick: () => void;
}) {
  const { setTheme } = useTheme();

  return (
    <PrimitiveControlGroup isLight={isLight}>
      <PrimitiveToolbarButton
        label="Show preview"
        isLight={isLight}
        focusable={focusable}
        onClick={onClick}
      >
        <ComponentIcon className="size-3.5" />
      </PrimitiveToolbarButton>
      <PrimitiveToolbarButton
        label={isLight ? "Use dark mode" : "Use light mode"}
        isLight={isLight}
        focusable={focusable}
        onClick={() => setTheme(isLight ? "dark" : "light")}
      >
        {isLight ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
      </PrimitiveToolbarButton>
    </PrimitiveControlGroup>
  );
}

function PrimitiveControlGroup({
  isLight,
  children,
}: {
  isLight: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "absolute right-4 top-4 z-20 flex gap-1 rounded-[14px] border p-1 backdrop-blur-sm",
        isLight
          ? "border-[#d8d3c7] bg-[#f4f1e9]/92 shadow-[inset_0_7px_14px_rgba(255,255,255,0.58),inset_0_0.5px_0.5px_rgba(255,255,255,0.9),0_12px_20px_-12px_rgba(55,47,36,0.22)]"
          : "border-[#232323] bg-[#181818]/88 shadow-[inset_0_7px_14px_rgba(255,255,255,0.03),inset_0_0.5px_0.5px_rgba(255,255,255,0.06),0_12px_18px_-10px_rgba(0,0,0,0.55)]",
      )}
    >
      {children}
    </div>
  );
}

function PrimitiveToolbarButton({
  label,
  isLight,
  focusable,
  onClick,
  children,
}: {
  label: string;
  isLight: boolean;
  focusable: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      tabIndex={focusable ? 0 : -1}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-[10px] transition active:scale-95",
        isLight
          ? "text-[#171717]/48 hover:bg-[#e8e2d8] hover:text-[#171717]/78 focus-visible:bg-[#e8e2d8] focus-visible:text-[#171717]/78"
          : "text-[#ededed]/42 hover:bg-[#232323] hover:text-[#ededed]/72 focus-visible:bg-[#232323] focus-visible:text-[#ededed]/72",
      )}
    >
      {children}
    </button>
  );
}

export function PrimitivePropTable({ rows }: { rows: PropRow[] }) {
  const isLight = useIsLightTheme();

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[18px] border",
        isLight ? "border-[#ded9cc]" : "border-[#1c1c1c]",
      )}
    >
      {rows.map((row) => (
        <div
          key={row.name}
          className={cn(
            "grid gap-2 border-b px-4 py-3 last:border-b-0 md:grid-cols-[130px_160px_1fr]",
            isLight ? "border-[#ded9cc]" : "border-[#1c1c1c]",
          )}
        >
          <code
            className={cn(
              "font-mono text-[13px]",
              isLight ? "text-[#171717]/80" : "text-[#ededed]/82",
            )}
          >
            {row.name}
          </code>
          <span
            className={cn(
              "font-mono text-[12px]",
              isLight ? "text-[#171717]/46" : "text-[#ededed]/38",
            )}
          >
            {row.value}
          </span>
          <p
            className={cn(
              "text-sm leading-6",
              isLight ? "text-[#171717]/54" : "text-[#ededed]/46",
            )}
          >
            {row.description}
          </p>
        </div>
      ))}
    </div>
  );
}
