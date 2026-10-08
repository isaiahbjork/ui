"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTheme } from "next-themes";
import { Check, ChevronRight, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type BjorkTableThemeMode,
  getBjorkSignalPalette,
  getBjorkTablePalette,
  useBjorkTableIsDark,
} from "./table-theme";

export interface ApiParam {
  /** Field name as it appears on the wire, e.g. `amount`. */
  name: string;
  /** Type expression. Unions (`"a" | "b"`) are split and wrapped. */
  type: string;
  required?: boolean;
  /** Default value, rendered as code. */
  default?: string;
  /** Description. Wrap identifiers in backticks to render them as code. */
  description: string;
  /** `true`, or a short note such as "Use `destination` instead." */
  deprecated?: boolean | string;
  /** API version or date the field was introduced. */
  since?: string;
  /** Nested fields of an object parameter. */
  children?: ApiParam[];
}

export interface ApiSection {
  id: string;
  label: string;
  params: ApiParam[];
}

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiReferenceTableProps {
  /** Flat list of parameters. Ignored when `sections` is given. */
  params?: ApiParam[];
  /** Optional tabbed sections, such as Path / Query / Body. */
  sections?: ApiSection[];
  /** Endpoint title shown above the table. */
  title?: string;
  method?: ApiMethod;
  /** Endpoint path. `{placeholders}` are highlighted. */
  path?: string;
  /** Initially active section id. */
  defaultSection?: string;
  /** Dotted paths of parameters expanded on first render, e.g. `["destination"]`. */
  defaultExpanded?: string[];
  /** Prefix for row anchors. Rows get ids like `param-destination-type`. */
  anchorPrefix?: string;
  /** Max height of the scrolling body. The header row sticks while it scrolls. */
  maxHeight?: number;
  loading?: boolean;
  emptyMessage?: string;
  onCopyAnchor?: (anchor: string, param: ApiParam) => void;
  onSectionChange?: (sectionId: string) => void;
  className?: string;
  theme?: BjorkTableThemeMode;
  enableAnimations?: boolean;
}

export const API_REFERENCE_SAMPLE: {
  title: string;
  method: ApiMethod;
  path: string;
  sections: ApiSection[];
} = {
  title: "Create a payout",
  method: "POST",
  path: "/v2/accounts/{account_id}/payouts",
  sections: [
    {
      id: "path",
      label: "Path",
      params: [
        {
          name: "account_id",
          type: "string",
          required: true,
          description:
            "The connected account that sends the payout. Starts with `acct_`.",
        },
      ],
    },
    {
      id: "query",
      label: "Query",
      params: [
        {
          name: "expand",
          type: "string[]",
          description:
            "Related objects to inline in the response, such as `destination` or `balance_transaction`.",
        },
        {
          name: "dry_run",
          type: "boolean",
          default: "false",
          since: "2025-03",
          description:
            "Validate the request and return the fee quote without moving funds.",
        },
      ],
    },
    {
      id: "body",
      label: "Body",
      params: [
        {
          name: "amount",
          type: "integer",
          required: true,
          description:
            "Amount in the smallest currency unit. `125000` sends 1,250.00 in a two-decimal currency.",
        },
        {
          name: "currency",
          type: "string",
          required: true,
          description:
            "Three-letter ISO 4217 code in lowercase, such as `usd` or `eur`. Must match the destination.",
        },
        {
          name: "destination",
          type: "object",
          required: true,
          description: "Where the funds land. Pass an existing id or describe a new account.",
          children: [
            {
              name: "type",
              type: '"bank_account" | "debit_card" | "wallet"',
              required: true,
              description: "Kind of destination. Determines which other fields apply.",
            },
            {
              name: "id",
              type: "string",
              description: "An existing destination, such as `ba_8Hq2Lm`. Overrides the fields below.",
            },
            {
              name: "account_number",
              type: "string",
              description: "Bank account number. Required when `type` is `bank_account`.",
            },
            {
              name: "routing_number",
              type: "string",
              description: "Nine-digit routing number for US accounts.",
            },
            {
              name: "holder",
              type: "object",
              description: "The person or business that owns the account.",
              children: [
                {
                  name: "name",
                  type: "string",
                  required: true,
                  description: "Full legal name, as it appears on the account.",
                },
                {
                  name: "entity",
                  type: '"individual" | "company"',
                  default: '"individual"',
                  description: "Whether the holder is a person or a business.",
                },
              ],
            },
          ],
        },
        {
          name: "method",
          type: '"standard" | "instant"',
          default: '"standard"',
          description:
            "`instant` arrives in minutes for a 1% fee. `standard` settles in one to two business days.",
        },
        {
          name: "scheduled_for",
          type: "timestamp | null",
          default: "null",
          since: "2024-11",
          description: "Unix timestamp to hold the payout until. Must be within 90 days.",
        },
        {
          name: "statement_descriptor",
          type: "string",
          description: "Up to 22 characters shown on the recipient's bank statement.",
        },
        {
          name: "metadata",
          type: "Record<string, string>",
          default: "{}",
          description: "Up to 50 key-value pairs for your own reference. Never shown to the recipient.",
        },
        {
          name: "source_balance",
          type: '"available" | "pending"',
          default: '"available"',
          deprecated: "Use `source_type` instead. Removed in 2026-01.",
          description: "Which balance to draw from.",
        },
      ],
    },
  ],
};

// ─── helpers ─────────────────────────────────────────────────────────────────

const noopSubscribe = () => () => {};

function useMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

function useIsNarrow<T extends HTMLElement>(threshold: number) {
  const ref = useRef<T>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setNarrow(width > 0 && width < threshold);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);
  return [ref, narrow] as const;
}

function toAnchor(prefix: string, path: string) {
  return `${prefix}${path.replace(/[^a-zA-Z0-9_]+/g, "-")}`;
}

interface FlatRow {
  param: ApiParam;
  path: string;
  depth: number;
  parentPath: string | null;
}

function flatten(
  params: ApiParam[],
  expanded: Set<string>,
  depth = 0,
  parentPath: string | null = null,
  out: FlatRow[] = []
) {
  params.forEach((param) => {
    const path = parentPath ? `${parentPath}.${param.name}` : param.name;
    out.push({ param, path, depth, parentPath });
    if (param.children?.length && expanded.has(path)) {
      flatten(param.children, expanded, depth + 1, path, out);
    }
  });
  return out;
}

function findPath(params: ApiParam[], anchor: string, prefix: string, parent: string | null = null): string | null {
  for (const param of params) {
    const path = parent ? `${parent}.${param.name}` : param.name;
    if (toAnchor(prefix, path) === anchor) return path;
    if (param.children) {
      const hit = findPath(param.children, anchor, prefix, path);
      if (hit) return hit;
    }
  }
  return null;
}

function countParams(params: ApiParam[]): number {
  return params.reduce((sum, p) => sum + 1 + (p.children ? countParams(p.children) : 0), 0);
}

/** Splits text on backticks; odd segments become inline code. */
function InlineText({ text, codeClassName }: { text: string; codeClassName: string }) {
  const parts = text.split(/`([^`]+)`/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className={codeClassName}>
            {part}
          </code>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  );
}

// ─── component ───────────────────────────────────────────────────────────────

export function ApiReferenceTable({
  params,
  sections: sectionsProp,
  title = params ? undefined : API_REFERENCE_SAMPLE.title,
  method = params ? undefined : API_REFERENCE_SAMPLE.method,
  path = params ? undefined : API_REFERENCE_SAMPLE.path,
  defaultSection,
  defaultExpanded = [],
  anchorPrefix = "param-",
  maxHeight = 560,
  loading = false,
  emptyMessage = "This endpoint takes no parameters here.",
  onCopyAnchor,
  onSectionChange,
  className,
  theme = "auto",
  enableAnimations = true,
}: ApiReferenceTableProps) {
  const mounted = useMounted();
  const { resolvedTheme } = useTheme();
  const forcedTheme = theme === "auto" ? undefined : theme;
  const detectedIsDark = useBjorkTableIsDark(resolvedTheme, forcedTheme);
  const isDark = !mounted && theme === "auto" ? true : detectedIsDark;
  const palette = getBjorkTablePalette(isDark);
  const orange = getBjorkSignalPalette("orange", isDark);
  const green = getBjorkSignalPalette("green", isDark);
  const shouldReduceMotion = useReducedMotion();
  const shouldAnimate = enableAnimations && !shouldReduceMotion;

  const sections = useMemo<ApiSection[]>(() => {
    if (sectionsProp) return sectionsProp;
    if (params) return [{ id: "params", label: "Parameters", params }];
    return API_REFERENCE_SAMPLE.sections;
  }, [sectionsProp, params]);
  const showTabs = sections.length > 1;

  const [activeId, setActiveId] = useState(
    () => defaultSection ?? sections.find((s) => s.params.length > 2)?.id ?? sections[0]?.id ?? ""
  );
  const active = sections.find((s) => s.id === activeId) ?? sections[0];

  const [expanded, setExpanded] = useState(() => new Set(defaultExpanded));
  const [copied, setCopied] = useState<string | null>(null);
  const [intro, setIntro] = useState(true);
  // Rows revealed by a pointer click fade in; keyboard toggles are instant.
  const [revealPath, setRevealPath] = useState<string | null>(null);
  const [rootRef, narrow] = useIsNarrow<HTMLDivElement>(480);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const copyTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const t = window.setTimeout(() => setIntro(false), 900);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  // Deep link: open the section and ancestors that contain the hashed param.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    for (const section of sections) {
      const hit = findPath(section.params, hash, anchorPrefix);
      if (!hit) continue;
      const segments = hit.split(".");
      const ancestors = segments.slice(0, -1).map((_, i) => segments.slice(0, i + 1).join("."));
      const frame = requestAnimationFrame(() => {
        setActiveId(section.id);
        if (ancestors.length) setExpanded((prev) => new Set([...prev, ...ancestors]));
        requestAnimationFrame(() =>
          document.getElementById(hash)?.scrollIntoView({ block: "center" })
        );
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [sections, anchorPrefix]);

  const rows = useMemo(
    () => (active ? flatten(active.params, expanded) : []),
    [active, expanded]
  );

  const selectSection = useCallback(
    (id: string, focus = false) => {
      setActiveId(id);
      onSectionChange?.(id);
      if (focus) tabRefs.current.get(id)?.focus();
    },
    [onSectionChange]
  );

  const handleTabKey = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = sections.length - 1;
    let next = -1;
    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next < 0) return;
    event.preventDefault();
    selectSection(sections[next].id, true);
  };

  const toggle = (rowPath: string, event: ReactMouseEvent) => {
    const fromKeyboard = event.detail === 0;
    setRevealPath(fromKeyboard || !shouldAnimate ? null : rowPath);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(rowPath)) {
        for (const key of prev) if (key === rowPath || key.startsWith(`${rowPath}.`)) next.delete(key);
      } else {
        next.add(rowPath);
      }
      return next;
    });
  };

  const copyAnchor = (event: ReactMouseEvent<HTMLAnchorElement>, anchor: string, param: ApiParam) => {
    event.preventDefault();
    const url = `${window.location.href.split("#")[0]}#${anchor}`;
    window.history.replaceState(null, "", `#${anchor}`);
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(anchor);
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(null), 1600);
    onCopyAnchor?.(anchor, param);
  };

  const codeChip = cn(
    "rounded-[5px] border px-[5px] py-px font-mono text-[11.5px] leading-[1.5]",
    isDark ? "border-[#2a2a2a] bg-[#1b1b1b] text-[#ededed]/82" : "border-[#eadfce] bg-[#f8f2e7] text-[#171717]/80"
  );
  const focusRing =
    "outline-none focus-visible:ring-2 focus-visible:ring-[#ec5c13]/60 focus-visible:ring-offset-0";
  const guideColor = isDark ? "bg-[#2c2c2c]" : "bg-[#e6dccb]";

  const renderType = (type: string) => {
    const parts = type.split(/\s*\|\s*/);
    return (
      <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-1">
        {parts.map((part, i) => {
          const literal = /^["'].*["']$/.test(part) || /^\d+$/.test(part);
          return (
            <Fragment key={`${part}-${i}`}>
              {i > 0 ? (
                <span aria-hidden className={cn("font-mono text-[11px]", palette.secondaryText)}>
                  |
                </span>
              ) : null}
              <code className={cn(codeChip, "whitespace-nowrap", literal && (isDark ? "text-[#d86a2c]" : "text-[#9f4317]"))}>
                {part}
              </code>
            </Fragment>
          );
        })}
        {parts.length > 1 ? <span className="sr-only">(one of {parts.length} values)</span> : null}
      </span>
    );
  };

  const renderMarkers = (param: ApiParam) => (
    <>
      {param.required ? (
        <span className={cn("text-[10.5px] font-medium uppercase tracking-[0.08em]", palette.accent)}>
          Required
        </span>
      ) : null}
      {param.deprecated ? (
        <span
          className={cn(
            "rounded-full border px-1.5 py-px text-[10.5px] font-medium uppercase tracking-[0.06em]",
            getBjorkSignalPalette("red", isDark).borderColor,
            getBjorkSignalPalette("red", isDark).textColor
          )}
        >
          Deprecated
        </span>
      ) : null}
      {param.since ? (
        <span className={cn("rounded-full border px-1.5 py-px text-[10.5px] tabular-nums", green.borderColor, green.textColor)}>
          since {param.since}
        </span>
      ) : null}
    </>
  );

  const renderName = (row: FlatRow, anchor: string) => {
    const { param, path: rowPath } = row;
    const hasChildren = Boolean(param.children?.length);
    const isOpen = expanded.has(rowPath);
    const childIds = hasChildren && isOpen
      ? param.children!.map((c) => toAnchor(anchorPrefix, `${rowPath}.${c.name}`)).join(" ")
      : undefined;
    return (
      <span className="flex min-w-0 items-start gap-1">
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => toggle(rowPath, e)}
            aria-expanded={isOpen}
            aria-controls={childIds}
            aria-label={`${isOpen ? "Hide" : "Show"} ${param.children!.length} fields of ${param.name}`}
            className={cn(
              "-ml-1 mt-px grid size-[18px] shrink-0 place-items-center rounded-[5px] transition-colors motion-reduce:transition-none",
              palette.menuItem,
              palette.secondaryText,
              focusRing
            )}
          >
            <ChevronRight
              size={13}
              strokeWidth={2.2}
              className={cn("transition-transform duration-200 motion-reduce:transition-none", isOpen && "rotate-90")}
            />
          </button>
        ) : row.depth > 0 ? null : (
          <span aria-hidden className="w-[13px] shrink-0" />
        )}
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="flex min-w-0 items-center gap-1">
            <code
              className={cn(
                "min-w-0 break-all font-mono text-[13px] font-medium",
                palette.primaryText,
                param.deprecated && "line-through decoration-1"
              )}
            >
              {row.depth > 0 ? (
                <span className={cn("font-normal", palette.secondaryText)}>
                  {row.parentPath!.split(".").pop()}.
                </span>
              ) : null}
              {param.name}
            </code>
          </span>
          {renderMarkers(param)}
          <a
            href={`#${anchor}`}
            onClick={(e) => copyAnchor(e, anchor, param)}
            aria-label={copied === anchor ? `Link to ${rowPath} copied` : `Copy link to ${rowPath}`}
            className={cn(
              "grid size-[18px] shrink-0 place-items-center rounded-[5px] opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none",
              copied === anchor && "opacity-100",
              copied === anchor ? green.textColor : palette.secondaryText,
              palette.menuItem,
              focusRing
            )}
          >
            {copied === anchor ? <Check size={12} strokeWidth={2.4} /> : <Link2 size={12} strokeWidth={2} />}
          </a>
        </span>
      </span>
    );
  };

  const renderDescription = (param: ApiParam) => (
    <>
      <span className={cn(param.deprecated ? palette.secondaryText : palette.primaryText, "opacity-[0.92]")}>
        <InlineText text={param.description} codeClassName={codeChip} />
      </span>
      {typeof param.deprecated === "string" ? (
        <span className={cn("mt-1.5 flex gap-1.5 text-[12px]", getBjorkSignalPalette("red", isDark).textColor)}>
          <span aria-hidden>↳</span>
          <span>
            <InlineText text={param.deprecated} codeClassName={codeChip} />
          </span>
        </span>
      ) : null}
    </>
  );

  const renderDefault = (param: ApiParam) =>
    param.default !== undefined ? (
      <code className={cn(codeChip, "whitespace-nowrap")}>{param.default}</code>
    ) : (
      <span className={palette.secondaryText}>
        <span aria-hidden>—</span>
        <span className="sr-only">None</span>
      </span>
    );

  const guides = (row: FlatRow) =>
    row.depth > 0 ? (
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0">
        {Array.from({ length: row.depth }).map((_, level) => (
          <span
            key={level}
            className={cn("absolute inset-y-0 w-px", guideColor)}
            style={{ left: 22 + level * 20 }}
          />
        ))}
        <span
          className={cn("absolute h-px w-[9px]", guideColor)}
          style={{ left: 22 + (row.depth - 1) * 20, top: narrow ? 24 : 22 }}
        />
      </span>
    ) : null;

  const rowMotion = (row: FlatRow, index: number) => {
    const isIntro = intro && shouldAnimate;
    const isReveal = !intro && revealPath !== null && row.parentPath?.startsWith(revealPath) === true;
    if (!isIntro && !isReveal) return { initial: false as const };
    return {
      initial: { opacity: 0, y: isIntro ? 6 : -4 },
      animate: { opacity: 1, y: 0 },
      transition: {
        duration: 0.32,
        ease: [0.22, 1, 0.36, 1] as const,
        delay: isIntro ? 0.04 + index * 0.028 : 0,
      },
    };
  };

  const headerLabel = "text-[11px] font-medium uppercase tracking-[0.08em]";
  const total = active ? countParams(active.params) : 0;

  const methodTone =
    method === "GET" ? green : method === "DELETE" ? getBjorkSignalPalette("red", isDark) : orange;

  const skeleton = (
    <div className="space-y-0" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className={cn("flex items-center gap-6 border-b px-5 py-4", palette.divider)}>
          <span className={cn("h-3 w-28 animate-pulse rounded motion-reduce:animate-none", palette.mutedSurface)} />
          <span className={cn("h-3 w-16 animate-pulse rounded motion-reduce:animate-none", palette.mutedSurface)} />
          <span className={cn("h-3 flex-1 animate-pulse rounded motion-reduce:animate-none", palette.mutedSurface)} />
        </div>
      ))}
    </div>
  );

  const empty = (
    <div className={cn("flex flex-col items-center gap-1 px-6 py-12 text-center", palette.secondaryText)}>
      <span className={cn("text-[13px] font-medium", palette.primaryText)}>No {active?.label.toLowerCase()} parameters</span>
      <span className="text-[12.5px]">{emptyMessage}</span>
    </div>
  );

  const caption = `${title ?? "API"} ${active ? `${active.label.toLowerCase()} parameters` : "parameters"}`;

  return (
    <div
      ref={rootRef}
      className={cn("w-full overflow-hidden rounded-[18px] border text-[13px]", palette.container, className)}
    >
      {title || path ? (
        <div className={cn("flex flex-col gap-2 px-5 pb-3 pt-4", narrow && "px-4")}>
          {title ? (
            <h3 className={cn("text-[15px] font-semibold tracking-[-0.01em]", palette.primaryText)}>{title}</h3>
          ) : null}
          {path ? (
            <div className="flex min-w-0 items-center gap-2">
              {method ? (
                <span
                  className={cn(
                    "shrink-0 rounded-[5px] border px-1.5 py-px font-mono text-[10.5px] font-semibold tracking-[0.04em]",
                    methodTone.bgColor,
                    methodTone.borderColor,
                    methodTone.textColor
                  )}
                >
                  {method}
                </span>
              ) : null}
              <code className={cn("min-w-0 break-all font-mono text-[12.5px]", palette.secondaryText)}>
                {path.split(/(\{[^}]+\})/g).map((seg, i) =>
                  seg.startsWith("{") ? (
                    <span key={i} className={palette.accent}>
                      {seg}
                    </span>
                  ) : (
                    <Fragment key={i}>{seg}</Fragment>
                  )
                )}
              </code>
            </div>
          ) : null}
        </div>
      ) : null}

      {showTabs ? (
        <div
          role="tablist"
          aria-label="Parameter location"
          className={cn("flex gap-1 border-b px-4", palette.divider, narrow && "px-3")}
        >
          {sections.map((section, index) => {
            const selected = section.id === active?.id;
            return (
              <button
                key={section.id}
                ref={(node) => {
                  if (node) tabRefs.current.set(section.id, node);
                  else tabRefs.current.delete(section.id);
                }}
                type="button"
                role="tab"
                id={`${anchorPrefix}tab-${section.id}`}
                aria-selected={selected}
                aria-controls={`${anchorPrefix}panel-${section.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectSection(section.id)}
                onKeyDown={(e) => handleTabKey(e, index)}
                className={cn(
                  "relative flex items-center gap-1.5 rounded-t-[6px] px-2.5 pb-2.5 pt-2 text-[12.5px] font-medium transition-colors motion-reduce:transition-none",
                  selected ? palette.primaryText : palette.secondaryText,
                  !selected && (isDark ? "hover:text-[#ededed]/70" : "hover:text-[#171717]/80"),
                  focusRing
                )}
              >
                {section.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10.5px] tabular-nums",
                    selected ? cn(palette.accentBg, palette.accent) : palette.mutedSurface
                  )}
                >
                  {countParams(section.params)}
                </span>
                {selected ? (
                  shouldAnimate ? (
                    <motion.span
                      layoutId={`${anchorPrefix}tab-underline`}
                      className="absolute inset-x-1.5 -bottom-px h-[2px] rounded-full bg-[#ec5c13]"
                      transition={{ type: "spring", stiffness: 520, damping: 40 }}
                    />
                  ) : (
                    <span className="absolute inset-x-1.5 -bottom-px h-[2px] rounded-full bg-[#ec5c13]" />
                  )
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        role={showTabs ? "tabpanel" : "region"}
        id={`${anchorPrefix}panel-${active?.id}`}
        aria-labelledby={showTabs ? `${anchorPrefix}tab-${active?.id}` : undefined}
        aria-label={showTabs ? undefined : caption}
        aria-busy={loading || undefined}
        tabIndex={0}
        className={cn("overflow-auto overscroll-contain", focusRing, !showTabs && !title && !path ? "" : "border-t-0")}
        style={{ maxHeight }}
      >
        {loading ? (
          skeleton
        ) : !active || active.params.length === 0 ? (
          empty
        ) : narrow ? (
          <ul aria-label={caption} className="flex flex-col">
            {rows.map((row, index) => {
              const anchor = toAnchor(anchorPrefix, row.path);
              return (
                <motion.li
                  key={row.path}
                  id={anchor}
                  {...rowMotion(row, index)}
                  className={cn(
                    "group/row relative scroll-mt-4 border-b px-4 py-3.5 last:border-b-0 target:bg-[#ec5c13]/[0.06]",
                    palette.divider,
                    row.param.deprecated && "opacity-70"
                  )}
                  style={{ paddingLeft: 16 + row.depth * 20 }}
                >
                  {guides(row)}
                  <div className="flex items-start justify-between gap-3">{renderName(row, anchor)}</div>
                  <dl className="mt-2.5 grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-2">
                    <dt className={cn(headerLabel, "pt-[3px]", palette.secondaryText)}>Type</dt>
                    <dd>{renderType(row.param.type)}</dd>
                    {row.param.default !== undefined ? (
                      <>
                        <dt className={cn(headerLabel, "pt-[3px]", palette.secondaryText)}>Default</dt>
                        <dd>{renderDefault(row.param)}</dd>
                      </>
                    ) : null}
                  </dl>
                  <p className="mt-2.5 text-[13px] leading-[1.55]">{renderDescription(row.param)}</p>
                </motion.li>
              );
            })}
          </ul>
        ) : (
          <table className="w-full min-w-[600px] table-fixed border-separate border-spacing-0 text-left">
            <caption className="sr-only">{caption}</caption>
            <colgroup>
              <col style={{ width: "29%" }} />
              <col style={{ width: "21%" }} />
              <col style={{ width: "12%" }} />
              <col />
            </colgroup>
            <thead>
              <tr>
                {["Parameter", "Type", "Default", "Description"].map((label, i) => (
                  <th
                    key={label}
                    scope="col"
                    className={cn(
                      "sticky top-0 z-10 border-b py-2.5 font-medium",
                      headerLabel,
                      palette.header,
                      i === 0 ? "pl-5 pr-3" : "px-3",
                      i === 3 && "pr-5"
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const anchor = toAnchor(anchorPrefix, row.path);
                const cell = cn("border-b px-3 py-3 align-top", palette.divider);
                const lastRow = index === rows.length - 1;
                return (
                  <motion.tr
                    key={row.path}
                    id={anchor}
                    {...rowMotion(row, index)}
                    className={cn(
                      "group/row scroll-mt-12 transition-colors duration-150 motion-reduce:transition-none target:bg-[#ec5c13]/[0.06]",
                      palette.row,
                      row.param.deprecated && "opacity-[0.62]",
                      row.depth > 0 && (isDark ? "bg-[#0d0d0d]/40" : "bg-[#fbf7ef]/50")
                    )}
                  >
                    <td
                      className={cn(cell, "relative pr-3", lastRow && "border-b-0")}
                      style={{ paddingLeft: 20 + row.depth * 20 }}
                    >
                      {guides(row)}
                      {renderName(row, anchor)}
                    </td>
                    <td className={cn(cell, lastRow && "border-b-0")}>
                      {renderType(row.param.type)}
                      {row.param.children?.length ? (
                        <span className={cn("mt-1.5 block text-[11.5px] tabular-nums", palette.secondaryText)}>
                          {row.param.children.length} fields
                        </span>
                      ) : null}
                    </td>
                    <td className={cn(cell, lastRow && "border-b-0")}>{renderDefault(row.param)}</td>
                    <td className={cn(cell, "pr-5 leading-[1.55]", lastRow && "border-b-0")}>
                      {renderDescription(row.param)}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div
        className={cn(
          "flex items-center justify-between gap-3 border-t px-5 py-2.5 text-[11.5px]",
          palette.divider,
          palette.secondaryText,
          narrow && "px-4"
        )}
      >
        <span className="tabular-nums">
          {loading ? "Loading parameters…" : `${total} ${total === 1 ? "parameter" : "parameters"}`}
        </span>
        <span aria-live="polite" className={cn("tabular-nums", copied && green.textColor)}>
          {copied ? "Link copied" : narrow ? null : "Hover a name to copy its link"}
        </span>
      </div>
    </div>
  );
}

export default ApiReferenceTable;
