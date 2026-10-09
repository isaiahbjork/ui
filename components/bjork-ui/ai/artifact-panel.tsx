"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { Check, Copy, Download, Maximize2, Minimize2 } from "lucide-react";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import { easeCss } from "@/components/bjork-ui/_core/motion";
import {
  FOCUS_RING,
  PRESS,
  SHIMMER_TEXT_CSS,
  useAiTone,
  useControllable,
  useReduceMotion,
  type BjorkTone,
} from "@/components/bjork-ui/ai/_shared";
import { StrokeMorphIcon } from "@/components/bjork-ui/utilities/stroke-morph-icon";
import { cn } from "@/lib/utils";

export interface ArtifactVersion {
  id: string;
  code: string;
  /** "tsx", "html", "css", "json", "md", "py" ... Used for the tag, tinting and the download extension. */
  language: string;
  /** Rendered in the Preview tab. */
  preview?: ReactNode;
  /** Epoch ms. */
  createdAt: number;
}

export type ArtifactTab = "code" | "preview";

export interface ArtifactPanelProps {
  title: string;
  /** Short kind tag such as "component", "document" or "chart". */
  kind?: string;
  versions: ArtifactVersion[];
  /** Controlled version id. Uncontrolled panels follow the newest version unless you step back. */
  version?: string;
  defaultVersion?: string;
  onVersionChange?: (id: string) => void;
  tab?: ArtifactTab;
  defaultTab?: ArtifactTab;
  onTabChange?: (tab: ArtifactTab) => void;
  /** The newest version is still being written. The code view follows new lines while you are at the bottom. */
  streaming?: boolean;
  expanded?: boolean;
  defaultExpanded?: boolean;
  /** Expanded panels pin to the viewport. Esc collapses. */
  onExpandedChange?: (expanded: boolean) => void;
  /** Shows a close button when set. */
  onClose?: () => void;
  tone?: BjorkTone;
  className?: string;
}

// ---------------------------------------------------------------------------------------------------------------
// Sample

const PRICING_V1 = `export function PricingCard() {
  return (
    <div className="card">
      <h3>Studio</h3>
      <p>$12 / month</p>
      <button>Choose plan</button>
    </div>
  );
}`;

const PRICING_V2 = `type Plan = { name: string; price: number; features: string[] };

export function PricingCard({ plan }: { plan: Plan }) {
  return (
    <div className="card">
      <h3>{plan.name}</h3>
      <p className="price">\${plan.price} / month</p>
      <ul>
        {plan.features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <button>Choose plan</button>
    </div>
  );
}`;

const PRICING_V3 = `type Plan = {
  name: string;
  price: number;
  interval: "month" | "year";
  features: string[];
  popular?: boolean;
};

// Yearly plans show the monthly equivalent, billed once.
function perMonth(plan: Plan) {
  return plan.interval === "year" ? plan.price / 12 : plan.price;
}

export function PricingCard({ plan, onChoose }: { plan: Plan; onChoose: () => void }) {
  return (
    <article className="pricing-card" data-popular={plan.popular}>
      <header>
        <h3>{plan.name}</h3>
        {plan.popular && <span className="tag">Most popular</span>}
      </header>
      <p className="price">
        <strong>\${perMonth(plan).toFixed(0)}</strong>
        <span> / month</span>
      </p>
      <p className="billing">
        {plan.interval === "year" ? \`Billed \${plan.price} yearly\` : "Billed monthly"}
      </p>
      <ul>
        {plan.features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <button type="button" onClick={onChoose}>
        Choose {plan.name}
      </button>
    </article>
  );
}`;

function PricingPreview({ popular = true, features = 4 }: { popular?: boolean; features?: number }) {
  const all = ["Unlimited projects", "Version history, 90 days", "Shared libraries", "Priority support"];
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="w-full max-w-[280px] rounded-[16px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-raised)] p-5 font-bjork-alpha shadow-[var(--bjork-shadow-surface)]">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-[color:var(--bjork-text)]">Studio</h3>
          {popular && (
            <span className="rounded-full bg-[color:var(--bjork-accent-soft)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--bjork-accent-ink)]">
              Most popular
            </span>
          )}
        </div>
        <p className="mt-3 flex items-baseline gap-1">
          <strong className="text-[32px] font-semibold leading-none tracking-[-0.02em] text-[color:var(--bjork-text)]">$12</strong>
          <span className="text-[13px] text-[color:var(--bjork-text-muted)]">/ month</span>
        </p>
        <p className="mt-1 text-[12px] text-[color:var(--bjork-text-faint)]">Billed $144 yearly</p>
        <ul className="mt-4 flex flex-col gap-2 border-t border-[color:var(--bjork-border)] pt-4">
          {all.slice(0, features).map((f) => (
            <li key={f} className="flex items-center gap-2 text-[13px] text-[color:var(--bjork-text-medium)]">
              <Check size={14} strokeWidth={1.75} className="shrink-0 text-[color:var(--bjork-accent-ink)]" />
              {f}
            </li>
          ))}
        </ul>
        <div className="mt-5 grid h-9 place-items-center rounded-[10px] bg-[color:var(--bjork-accent-fill)] text-[13px] font-medium text-[color:var(--bjork-accent-foreground)]">
          Choose Studio
        </div>
      </div>
    </div>
  );
}

export const SAMPLE_ARTIFACT: { title: string; kind: string; versions: ArtifactVersion[] } = {
  title: "Pricing card",
  kind: "component",
  versions: [
    { id: "v1", code: PRICING_V1, language: "tsx", createdAt: 1_760_000_000_000, preview: <PricingPreview popular={false} features={0} /> },
    { id: "v2", code: PRICING_V2, language: "tsx", createdAt: 1_760_000_060_000, preview: <PricingPreview popular={false} features={3} /> },
    { id: "v3", code: PRICING_V3, language: "tsx", createdAt: 1_760_000_150_000, preview: <PricingPreview /> },
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// Tinting

const KEYWORDS =
  "const|let|var|function|return|export|import|from|default|if|else|for|while|type|interface|extends|new|async|await|class|true|false|null|undefined|def|in|as";
const CODE_RE = new RegExp(
  `(//.*$|#.*$)|("(?:[^"\\\\]|\\\\.)*"?|'(?:[^'\\\\]|\\\\.)*'?|\`(?:[^\`\\\\]|\\\\.)*\`?)|(</?[A-Za-z][\\w.]*)|\\b(${KEYWORDS})\\b|\\b(\\d+(?:\\.\\d+)?)\\b`,
  "g",
);

function tint(line: string, language: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  const hashComments = language === "py" || language === "sh" || language === "yaml";
  for (const m of line.matchAll(CODE_RE)) {
    const at = m.index ?? 0;
    if (m[1] !== undefined && m[1].startsWith("#") && !hashComments) continue;
    if (at > last) out.push(line.slice(last, at));
    const cls = m[1]
      ? "italic text-[color:var(--bjork-text-faint)]"
      : m[2]
        ? "text-[color:var(--bjork-text)]"
        : m[3]
          ? "text-[color:var(--bjork-text-medium)]"
          : "text-[color:var(--bjork-accent-ink)]";
    out.push(
      <span key={at} className={cls}>
        {m[0]}
      </span>,
    );
    last = at + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

const EXT: Record<string, string> = { tsx: "tsx", ts: "ts", jsx: "jsx", js: "js", html: "html", css: "css", json: "json", md: "md", markdown: "md", py: "py", python: "py" };

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "artifact";
}

const ICON_BTN =
  "grid size-7 shrink-0 cursor-pointer place-items-center rounded-[7px] text-[color:var(--bjork-text-muted)] transition-colors duration-150 hover:bg-[color:var(--bjork-surface-active)] hover:text-[color:var(--bjork-text)] disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent";

const TABS: { id: ArtifactTab; label: string }[] = [
  { id: "code", label: "Code" },
  { id: "preview", label: "Preview" },
];

// ---------------------------------------------------------------------------------------------------------------
// Panel

/** A side canvas for a generated artifact: versions, Code and Preview tabs, copy, download and expand. */
export function ArtifactPanel({
  title,
  kind,
  versions,
  version,
  defaultVersion,
  onVersionChange,
  tab,
  defaultTab = "code",
  onTabChange,
  streaming = false,
  expanded,
  defaultExpanded = false,
  onExpandedChange,
  onClose,
  tone: toneProp,
  className,
}: ArtifactPanelProps) {
  const { style } = useAiTone(toneProp);
  const reduce = useReduceMotion();
  const uid = useId();
  const [activeTab, setTab] = useControllable(tab, defaultTab, onTabChange);
  const [isExpanded, setExpanded] = useControllable(expanded, defaultExpanded, onExpandedChange);

  // Version: controlled id, or an inner id where null means "follow the newest".
  const latest = versions[versions.length - 1];
  const [inner, setInner] = useState<string | null>(defaultVersion ?? null);
  const controlled = version !== undefined;
  const currentId = (controlled ? version : inner) ?? latest?.id;
  const index = Math.max(0, versions.findIndex((v) => v.id === currentId));
  const current = versions[index] ?? latest;
  const onLatest = index === versions.length - 1;

  // A new version flashes "Updated". An uncontrolled panel already on the newest version keeps following it.
  const [seen, setSeen] = useState({ count: versions.length, latestId: latest?.id, flash: 0 });
  if (seen.count !== versions.length) {
    const grew = versions.length > seen.count;
    if (grew && !controlled && inner === seen.latestId) setInner(null);
    setSeen({ count: versions.length, latestId: latest?.id, flash: grew ? seen.flash + 1 : seen.flash });
  }

  const goTo = (i: number) => {
    const v = versions[Math.max(0, Math.min(versions.length - 1, i))];
    if (!v) return;
    if (!controlled) setInner(i >= versions.length - 1 ? null : v.id);
    onVersionChange?.(v.id);
  };

  const live = streaming && onLatest;
  const lines = current ? current.code.split("\n") : [];

  // Follow new lines only while the reader is at the bottom.
  const codeRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  useLayoutEffect(() => {
    const el = codeRef.current;
    if (!el || !live || !atBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [live, current?.code]);

  // Esc collapses an expanded panel.
  useEffect(() => {
    if (!isExpanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isExpanded, setExpanded]);

  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(id);
  }, [copied]);

  const download = () => {
    if (!current) return;
    const blob = new Blob([current.code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(title)}.${EXT[current.language] ?? "txt"}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const tabRefs = useRef(new Map<ArtifactTab, HTMLButtonElement>());
  const onTabKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.id === activeTab);
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    else return;
    e.preventDefault();
    setTab(TABS[next].id);
    tabRefs.current.get(TABS[next].id)?.focus();
  };

  // Announce version changes and the end of a stream.
  const [announce, setAnnounce] = useState({ key: `${versions.length}:${streaming}`, message: "" });
  const announceKey = `${versions.length}:${streaming}`;
  if (announce.key !== announceKey) {
    setAnnounce({
      key: announceKey,
      message: streaming ? `${title}: writing version ${versions.length}` : `${title}: version ${versions.length} ready`,
    });
  }

  return (
    <section
      aria-label={`${title} artifact`}
      data-expanded={isExpanded || undefined}
      style={style}
      className={cn(
        "@container flex min-h-[320px] w-full min-w-0 flex-col overflow-hidden rounded-[14px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-surface)] font-bjork-alpha text-[color:var(--bjork-text)]",
        isExpanded ? "fixed inset-3 z-50 h-auto shadow-[var(--bjork-shadow-menu)] sm:inset-6" : "h-full",
        className,
      )}
    >
      <style href="bjork-ai-shimmer" precedence="default">
        {SHIMMER_TEXT_CSS}
      </style>
      <style href="bjork-artifact-flash" precedence="default">
        {"@keyframes bjork-artifact-flash{0%{opacity:0;transform:translateY(2px)}12%{opacity:1;transform:none}75%{opacity:1}100%{opacity:0}}"}
      </style>

      {/* Title row */}
      <div className="flex min-h-12 items-center gap-2 border-b border-[color:var(--bjork-border)] py-2 pl-4 pr-2">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h3 className="min-w-0 truncate text-[14px] font-semibold leading-5">{title}</h3>
          {kind && (
            <span className="hidden shrink-0 font-mono text-[10px] uppercase leading-5 tracking-[0.08em] text-[color:var(--bjork-text-faint)] @[380px]:inline">
              {kind}
            </span>
          )}
          {live ? (
            <span className="bjork-ai-shimmer shrink-0 font-mono text-[11px] leading-5">Writing…</span>
          ) : (
            seen.flash > 0 &&
            onLatest && (
              <span
                key={seen.flash}
                className="shrink-0 font-mono text-[11px] leading-5 text-[color:var(--bjork-accent-ink)] opacity-0"
                style={{ animation: reduce ? "none" : "bjork-artifact-flash 2.4s ease-out forwards" }}
              >
                Updated
              </span>
            )
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-label={copied ? "Copied" : "Copy code"}
            title={copied ? "Copied" : "Copy code"}
            onClick={() => current && void navigator.clipboard?.writeText(current.code).then(() => setCopied(true), () => undefined)}
            className={cn(ICON_BTN, FOCUS_RING, PRESS)}
          >
            {copied ? (
              <Check size={14} strokeWidth={1.75} className="text-[color:var(--bjork-success)]" />
            ) : (
              <Copy size={14} strokeWidth={1.75} />
            )}
          </button>
          <button type="button" aria-label="Download" title="Download" onClick={download} className={cn(ICON_BTN, FOCUS_RING, PRESS)}>
            <Download size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label={isExpanded ? "Collapse" : "Expand"}
            aria-pressed={isExpanded}
            title={isExpanded ? "Collapse" : "Expand"}
            onClick={() => setExpanded(!isExpanded)}
            className={cn(ICON_BTN, FOCUS_RING, PRESS)}
          >
            {isExpanded ? <Minimize2 size={14} strokeWidth={1.75} /> : <Maximize2 size={14} strokeWidth={1.75} />}
          </button>
          {onClose && (
            <button type="button" aria-label="Close" title="Close" onClick={onClose} className={cn(ICON_BTN, FOCUS_RING, PRESS)}>
              <StrokeMorphIcon name="close" size={14} strokeWidth={1.75} color="currentColor" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs row */}
      <div className="flex min-h-10 items-center justify-between gap-2 border-b border-[color:var(--bjork-border)] pl-2 pr-2">
        <div role="tablist" aria-label="View" className="flex h-10 items-stretch" onKeyDown={onTabKey}>
          {TABS.map((t) => {
            const on = activeTab === t.id;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  if (el) tabRefs.current.set(t.id, el);
                  else tabRefs.current.delete(t.id);
                }}
                id={`${uid}-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={`${uid}-panel-${t.id}`}
                tabIndex={on ? 0 : -1}
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative cursor-pointer rounded-[6px] px-2.5 text-[13px] font-medium transition-colors duration-150",
                  on ? "text-[color:var(--bjork-text)]" : "text-[color:var(--bjork-text-muted)] hover:text-[color:var(--bjork-text)]",
                  FOCUS_RING,
                  "focus-visible:ring-inset focus-visible:ring-offset-0",
                )}
              >
                {t.label}
                <span
                  aria-hidden="true"
                  className="absolute inset-x-2.5 -bottom-px h-[2px] rounded-full bg-[color:var(--bjork-accent)]"
                  style={{
                    opacity: on ? 1 : 0,
                    transform: on ? "scaleX(1)" : "scaleX(0.4)",
                    transition: reduce ? "none" : `transform 220ms ${easeCss.out}, opacity 160ms ease-out`,
                  }}
                />
              </button>
            );
          })}
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <span className="hidden min-w-[9ch] truncate text-right font-mono text-[11px] tabular-nums text-[color:var(--bjork-text-faint)] @[420px]:inline">
            {lines.length} {lines.length === 1 ? "line" : "lines"} · {current?.language}
          </span>
          {versions.length > 1 && (
            <div role="group" aria-label="Version" className="flex shrink-0 items-center">
              <button
                type="button"
                aria-label="Previous version"
                disabled={index === 0}
                onClick={() => goTo(index - 1)}
                className={cn(ICON_BTN, FOCUS_RING)}
              >
                <StrokeMorphIcon name="chevron-left" size={12} strokeWidth={1.75} color="currentColor" />
              </button>
              <span
                aria-live="polite"
                className="min-w-[7ch] text-center font-mono text-[11px] tabular-nums text-[color:var(--bjork-text-muted)]"
              >
                v{index + 1} of {versions.length}
              </span>
              <button
                type="button"
                aria-label="Next version"
                disabled={onLatest}
                onClick={() => goTo(index + 1)}
                className={cn(ICON_BTN, FOCUS_RING)}
              >
                <StrokeMorphIcon name="chevron-right" size={12} strokeWidth={1.75} color="currentColor" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Panels */}
      <div className="relative min-h-0 flex-1">
        <div
          id={`${uid}-panel-code`}
          role="tabpanel"
          aria-labelledby={`${uid}-tab-code`}
          hidden={activeTab !== "code"}
          ref={codeRef}
          tabIndex={0}
          onScroll={(e) => {
            const el = e.currentTarget;
            atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          }}
          className={cn("absolute inset-0 overflow-auto py-3", FOCUS_RING, "focus-visible:ring-inset focus-visible:ring-offset-0")}
        >
          <pre className="min-w-max font-mono text-[12px] leading-5 text-[color:var(--bjork-text-muted)]">
            <code>
              {lines.map((line, i) => (
                <span key={i} className="flex">
                  <span
                    aria-hidden="true"
                    className="sticky left-0 w-[5ch] shrink-0 select-none bg-[color:var(--bjork-surface)] pr-3 text-right text-[11px] tabular-nums text-[color:var(--bjork-text-faint)]"
                  >
                    {i + 1}
                  </span>
                  <span className="whitespace-pre pr-4">
                    {tint(line, current?.language ?? "")}
                    {live && i === lines.length - 1 && (
                      <span
                        aria-hidden="true"
                        className="ml-px inline-block h-3.5 w-[2px] translate-y-[2px] bg-[color:var(--bjork-accent)] motion-safe:animate-pulse"
                      />
                    )}
                    {line === "" ? "​" : null}
                  </span>
                </span>
              ))}
            </code>
          </pre>
        </div>
        <div
          id={`${uid}-panel-preview`}
          role="tabpanel"
          aria-labelledby={`${uid}-tab-preview`}
          hidden={activeTab !== "preview"}
          tabIndex={0}
          className={cn("absolute inset-0 overflow-auto", FOCUS_RING, "focus-visible:ring-inset focus-visible:ring-offset-0")}
        >
          {current?.preview ?? (
            <div className="grid h-full place-items-center p-6 text-center text-[13px] text-[color:var(--bjork-text-faint)]">
              {live ? "Preview appears when writing finishes." : "No preview for this version."}
            </div>
          )}
        </div>
      </div>

      <LiveRegion message={announce.message} />
    </section>
  );
}
