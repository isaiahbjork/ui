"use client";

import {
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
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  File,
  FileCode2,
  FileCog,
  FileImage,
  FileJson,
  FileLock2,
  FileTerminal,
  FileText,
  FileType2,
  Folder,
  FolderOpen,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type BjorkTableThemeMode,
  getBjorkTablePalette,
  useBjorkTableIsDark,
} from "./table-theme";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface FileNode {
  /** Stable id, unique across the whole tree (a path works well). */
  id: string;
  name: string;
  /** Bytes. Ignored for folders, which show the sum of their contents. */
  size?: number;
  /** Last modified. Folders default to their newest descendant. */
  modified?: string | number | Date;
  /** Override the kind label derived from the extension. */
  kind?: string;
  /** Present (even empty) means the node is a folder. */
  children?: FileNode[];
}

export type FileTreeSortKey = "name" | "size" | "kind" | "modified";

export interface FileTreeTableProps {
  nodes?: FileNode[];
  /** Root label shown in the toolbar. */
  title?: string;
  /** Folder ids expanded on first render. */
  defaultExpanded?: string[];
  /** Row focused on first render. */
  defaultFocusedId?: string;
  /** Rows selected on first render. */
  defaultSelected?: string[];
  /** Allow Shift / Ctrl / Cmd multi-select. */
  multiSelect?: boolean;
  /** Reference time for relative dates. Defaults to the sample clock for the sample tree, otherwise now. */
  now?: number | Date;
  /** Max height of the scroll body in px. */
  maxHeight?: number;
  loading?: boolean;
  onOpen?: (node: FileNode) => void;
  onSelectionChange?: (ids: string[], nodes: FileNode[]) => void;
  className?: string;
  theme?: BjorkTableThemeMode;
  enableAnimations?: boolean;
}

/* ------------------------------------------------------------------ */
/* Sample: an invented web app repository                              */
/* ------------------------------------------------------------------ */

export const FILE_TREE_SAMPLE_NOW = Date.UTC(2026, 9, 6, 16, 30);

const minutesAgo = (m: number) => FILE_TREE_SAMPLE_NOW - m * 60_000;
const H = 60;
const D = 24 * H;

function f(path: string, size: number, ago: number): FileNode {
  const name = path.split("/").pop() ?? path;
  return { id: path, name, size, modified: minutesAgo(ago) };
}

function d(path: string, children: FileNode[]): FileNode {
  const name = path.split("/").pop() ?? path;
  return { id: path, name, children };
}

export const FILE_TREE_SAMPLE: FileNode[] = [
  d(".github", [
    d(".github/workflows", [
      f(".github/workflows/ci.yml", 2_184, 9 * D),
      f(".github/workflows/preview-deploy.yml", 1_412, 23 * D),
      f(".github/workflows/nightly-e2e.yml", 1_036, 41 * D),
    ]),
    f(".github/CODEOWNERS", 214, 63 * D),
    f(".github/pull_request_template.md", 688, 120 * D),
  ]),
  d("app", [
    d("app/(marketing)", [
      f("app/(marketing)/page.tsx", 6_412, 2 * D),
      f("app/(marketing)/layout.tsx", 1_288, 18 * D),
      d("app/(marketing)/pricing", [
        f("app/(marketing)/pricing/page.tsx", 8_906, 3 * D),
        f("app/(marketing)/pricing/plans.ts", 2_342, 3 * D),
      ]),
      d("app/(marketing)/changelog", [
        f("app/(marketing)/changelog/page.tsx", 3_120, 5 * D),
        f("app/(marketing)/changelog/entries.mdx", 24_880, 1 * D),
      ]),
    ]),
    d("app/dashboard", [
      f("app/dashboard/page.tsx", 9_734, 42),
      f("app/dashboard/layout.tsx", 2_206, 6 * D),
      f("app/dashboard/loading.tsx", 612, 30 * D),
      d("app/dashboard/projects", [
        f("app/dashboard/projects/page.tsx", 7_380, 3 * H),
        d("app/dashboard/projects/[slug]", [
          f("app/dashboard/projects/[slug]/page.tsx", 11_942, 3 * H),
          f("app/dashboard/projects/[slug]/settings.tsx", 6_115, 2 * D),
          f("app/dashboard/projects/[slug]/activity-feed.tsx", 5_288, 19 * H),
        ]),
        f("app/dashboard/projects/new-project-form.tsx", 5_402, 8 * D),
      ]),
      d("app/dashboard/billing", [
        f("app/dashboard/billing/page.tsx", 6_880, 12 * D),
        f("app/dashboard/billing/invoice-row.tsx", 2_140, 12 * D),
        f("app/dashboard/billing/usage-meter.tsx", 3_318, 9 * D),
      ]),
      d("app/dashboard/settings", [
        f("app/dashboard/settings/page.tsx", 5_022, 21 * D),
        f("app/dashboard/settings/team-members.tsx", 6_708, 4 * D),
        f("app/dashboard/settings/api-keys.tsx", 4_416, 4 * D),
      ]),
    ]),
    d("app/api", [
      d("app/api/auth", [
        f("app/api/auth/route.ts", 3_604, 26 * D),
        f("app/api/auth/callback/route.ts", 2_870, 26 * D),
      ]),
      d("app/api/projects", [
        f("app/api/projects/route.ts", 4_212, 5 * H),
        f("app/api/projects/[id]/route.ts", 3_996, 5 * H),
      ]),
      d("app/api/webhooks", [f("app/api/webhooks/billing/route.ts", 5_160, 11 * D)]),
    ]),
    f("app/layout.tsx", 2_480, 15 * D),
    f("app/globals.css", 7_934, 2 * D),
    f("app/not-found.tsx", 1_102, 88 * D),
    f("app/favicon.ico", 15_086, 210 * D),
  ]),
  d("components", [
    d("components/ui", [
      f("components/ui/button.tsx", 4_208, 6 * D),
      f("components/ui/dialog.tsx", 6_744, 13 * D),
      f("components/ui/dropdown-menu.tsx", 8_390, 13 * D),
      f("components/ui/input.tsx", 1_918, 34 * D),
      f("components/ui/popover.tsx", 3_276, 34 * D),
      f("components/ui/tabs.tsx", 2_954, 19 * D),
      f("components/ui/toast.tsx", 5_588, 7 * D),
      f("components/ui/tooltip.tsx", 2_016, 19 * D),
    ]),
    d("components/charts", [
      f("components/charts/area-chart.tsx", 7_812, 1 * D),
      f("components/charts/sparkline.tsx", 2_664, 1 * D),
      f("components/charts/use-chart-scale.ts", 3_148, 1 * D),
    ]),
    f("components/command-palette.tsx", 12_402, 20),
    f("components/project-card.tsx", 4_380, 4 * D),
    f("components/sidebar-nav.tsx", 6_036, 2 * D),
    f("components/theme-switch.tsx", 1_724, 52 * D),
  ]),
  d("lib", [
    f("lib/db.ts", 2_906, 17 * D),
    f("lib/auth.ts", 5_274, 26 * D),
    f("lib/billing.ts", 6_618, 11 * D),
    f("lib/format.ts", 1_840, 9 * D),
    f("lib/rate-limit.ts", 2_212, 44 * D),
    f("lib/utils.ts", 986, 60 * D),
    d("lib/validators", [
      f("lib/validators/project.ts", 1_602, 8 * D),
      f("lib/validators/team.ts", 1_198, 21 * D),
    ]),
  ]),
  d("db", [
    d("db/migrations", [
      f("db/migrations/0001_init.sql", 4_812, 190 * D),
      f("db/migrations/0002_projects.sql", 2_306, 150 * D),
      f("db/migrations/0003_billing.sql", 3_418, 96 * D),
      f("db/migrations/0004_api_keys.sql", 1_204, 27 * D),
      f("db/migrations/0005_usage_events.sql", 2_640, 5 * D),
    ]),
    f("db/schema.ts", 9_120, 5 * D),
    f("db/seed.ts", 4_066, 33 * D),
  ]),
  d("public", [
    d("public/fonts", [
      f("public/fonts/inter-var.woff2", 324_812, 300 * D),
      f("public/fonts/mono-regular.woff2", 98_440, 300 * D),
    ]),
    d("public/images", [
      f("public/images/hero-dashboard.png", 1_482_330, 14 * D),
      f("public/images/og-default.png", 268_904, 59 * D),
      f("public/images/empty-projects.svg", 6_288, 59 * D),
      f("public/images/logo-mark.svg", 1_412, 240 * D),
    ]),
    f("public/robots.txt", 68, 240 * D),
  ]),
  d("scripts", [
    f("scripts/seed-dev.sh", 1_306, 33 * D),
    f("scripts/check-bundle.mjs", 2_480, 16 * D),
  ]),
  d("tests", [
    d("tests/e2e", [
      f("tests/e2e/onboarding.spec.ts", 5_704, 6 * D),
      f("tests/e2e/billing.spec.ts", 4_230, 11 * D),
      f("tests/e2e/projects.spec.ts", 6_982, 3 * H),
    ]),
    f("tests/format.test.ts", 2_118, 9 * D),
    f("tests/rate-limit.test.ts", 1_744, 44 * D),
  ]),
  f(".env.example", 512, 26 * D),
  f(".gitignore", 384, 210 * D),
  f("Dockerfile", 1_208, 47 * D),
  f("README.md", 6_904, 2 * D),
  f("next.config.ts", 1_146, 15 * D),
  f("package.json", 2_874, 1 * D),
  f("pnpm-lock.yaml", 412_906, 1 * D),
  f("tsconfig.json", 702, 88 * D),
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function toMs(value: FileNode["modified"]): number | null {
  if (value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

function formatRelative(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const days = Math.round(h / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.round(days / 7)} wk ago`;
  if (days < 365) return `${Math.round(days / 30)} mo ago`;
  const y = Math.round(days / 365);
  return `${y} yr ago`;
}

const absoluteFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const KIND_BY_EXT: Record<string, string> = {
  tsx: "React component",
  jsx: "React component",
  ts: "TypeScript",
  mts: "TypeScript",
  js: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  json: "JSON",
  md: "Markdown",
  mdx: "MDX document",
  css: "Stylesheet",
  svg: "SVG image",
  png: "PNG image",
  jpg: "JPEG image",
  jpeg: "JPEG image",
  webp: "WebP image",
  ico: "Icon",
  woff2: "Web font",
  woff: "Web font",
  yml: "YAML",
  yaml: "YAML",
  toml: "TOML",
  sql: "SQL migration",
  sh: "Shell script",
  txt: "Plain text",
  example: "Env template",
  env: "Environment",
};

const KIND_BY_NAME: Record<string, string> = {
  dockerfile: "Dockerfile",
  ".gitignore": "Git ignore",
  codeowners: "Code owners",
  license: "License",
  "pnpm-lock.yaml": "Lockfile",
  "package-lock.json": "Lockfile",
  "yarn.lock": "Lockfile",
};

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

function kindOf(node: FileNode): string {
  if (node.kind) return node.kind;
  if (node.children) return "Folder";
  const lower = node.name.toLowerCase();
  return KIND_BY_NAME[lower] ?? KIND_BY_EXT[extOf(lower)] ?? "Document";
}

function iconOf(node: FileNode, open: boolean): LucideIcon {
  if (node.children) return open ? FolderOpen : Folder;
  const lower = node.name.toLowerCase();
  if (lower.endsWith(".lock") || lower.includes("-lock.")) return FileLock2;
  const ext = extOf(lower);
  if (["ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "sql", "css"].includes(ext)) return FileCode2;
  if (ext === "json") return FileJson;
  if (["md", "mdx", "txt"].includes(ext) || lower === "license" || lower === "codeowners") return FileText;
  if (["png", "jpg", "jpeg", "webp", "svg", "ico", "gif", "avif"].includes(ext)) return FileImage;
  if (["woff", "woff2", "ttf", "otf"].includes(ext)) return FileType2;
  if (ext === "sh") return FileTerminal;
  if (["yml", "yaml", "toml", "example", "env"].includes(ext) || lower.startsWith(".") || lower === "dockerfile")
    return FileCog;
  return File;
}

interface NodeMeta {
  node: FileNode;
  parentId: string | null;
  isFolder: boolean;
  size: number;
  modified: number | null;
  kind: string;
  fileCount: number;
}

function buildMeta(nodes: FileNode[]) {
  const meta = new Map<string, NodeMeta>();
  const walk = (
    list: FileNode[],
    parentId: string | null,
  ): { size: number; modified: number | null; fileCount: number } => {
    let size = 0;
    let modified: number | null = null;
    let fileCount = 0;
    for (const node of list) {
      const isFolder = Array.isArray(node.children);
      let nodeSize = node.size ?? 0;
      let nodeModified = toMs(node.modified);
      let nodeFiles = 1;
      if (isFolder) {
        const agg = walk(node.children ?? [], node.id);
        nodeSize = agg.size;
        nodeModified = nodeModified ?? agg.modified;
        nodeFiles = agg.fileCount;
      }
      meta.set(node.id, {
        node,
        parentId,
        isFolder,
        size: nodeSize,
        modified: nodeModified,
        kind: kindOf(node),
        fileCount: isFolder ? nodeFiles : 1,
      });
      size += nodeSize;
      fileCount += nodeFiles;
      if (nodeModified !== null && (modified === null || nodeModified > modified)) modified = nodeModified;
    }
    return { size, modified, fileCount };
  };
  const totals = walk(nodes, null);
  return { meta, totals };
}

interface FlatRow {
  id: string;
  level: number;
  setSize: number;
  posInSet: number;
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

const subscribeNoop = () => () => {};
const useMounted = () =>
  useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

let clientNow: number | null = null;
const getClientNow = () => (clientNow ??= Date.now());
const getServerNow = () => null;

const INDENT = 18;
const PAD = 14;
const ACCENT_RING =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#ec5c13]";

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function FileTreeTable({
  nodes,
  title = "lumen-console",
  defaultExpanded,
  defaultFocusedId,
  defaultSelected,
  multiSelect = true,
  now,
  maxHeight = 460,
  loading = false,
  onOpen,
  onSelectionChange,
  className,
  theme = "auto",
  enableAnimations = true,
}: FileTreeTableProps) {
  const tree = nodes ?? FILE_TREE_SAMPLE;
  const mounted = useMounted();
  const { resolvedTheme } = useTheme();
  const forcedTheme = theme === "auto" ? undefined : theme;
  const detectedIsDark = useBjorkTableIsDark(resolvedTheme, forcedTheme);
  const isDark = !mounted && theme === "auto" ? true : detectedIsDark;
  const palette = getBjorkTablePalette(isDark);
  const reduceMotion = useReducedMotion();
  const shouldAnimate = enableAnimations && !reduceMotion;

  const clock = useSyncExternalStore(subscribeNoop, getClientNow, getServerNow);
  const nowMs =
    now !== undefined
      ? now instanceof Date
        ? now.getTime()
        : now
      : nodes === undefined
        ? FILE_TREE_SAMPLE_NOW
        : clock;

  const { meta, totals } = useMemo(() => buildMeta(tree), [tree]);

  const [expanded, setExpanded] = useState<Set<string>>(
    () =>
      new Set(
        defaultExpanded ??
          (nodes === undefined ? ["app", "app/dashboard", "app/dashboard/projects", "app/dashboard/projects/[slug]", "components"] : []),
      ),
  );
  const [sort, setSort] = useState<{ key: FileTreeSortKey; dir: "asc" | "desc" }>({
    key: "name",
    dir: "asc",
  });
  const [focusedId, setFocusedId] = useState<string | null>(defaultFocusedId ?? null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(defaultSelected ?? []));
  const [anchorId, setAnchorId] = useState<string | null>(defaultFocusedId ?? null);
  // How freshly revealed rows enter: staggered on mount, quick fade on pointer expand, instant from the keyboard.
  const [reveal, setReveal] = useState<"mount" | "pointer" | "none">("mount");

  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef(false);
  const typeahead = useRef({ buffer: "", at: 0 });

  const compare = useCallback(
    (a: FileNode, b: FileNode) => {
      const ma = meta.get(a.id)!;
      const mb = meta.get(b.id)!;
      if (ma.isFolder !== mb.isFolder) return ma.isFolder ? -1 : 1;
      let r = 0;
      if (sort.key === "size") r = ma.size - mb.size;
      else if (sort.key === "kind") r = collator.compare(ma.kind, mb.kind);
      else if (sort.key === "modified") r = (ma.modified ?? 0) - (mb.modified ?? 0);
      if (r === 0) r = collator.compare(a.name, b.name);
      return sort.dir === "asc" ? r : -r;
    },
    [meta, sort],
  );

  const rows = useMemo(() => {
    const out: FlatRow[] = [];
    const walk = (list: FileNode[], level: number) => {
      const sorted = [...list].sort(compare);
      sorted.forEach((node, i) => {
        out.push({ id: node.id, level, setSize: sorted.length, posInSet: i + 1 });
        if (node.children && expanded.has(node.id)) walk(node.children, level + 1);
      });
    };
    walk(tree, 1);
    return out;
  }, [tree, compare, expanded]);

  const indexById = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => m.set(r.id, i));
    return m;
  }, [rows]);

  // If the focused row got hidden by a collapse, focus falls back to its nearest visible ancestor.
  const activeId = useMemo(() => {
    let id = focusedId;
    while (id && !indexById.has(id)) id = meta.get(id)?.parentId ?? null;
    return id ?? rows[0]?.id ?? null;
  }, [focusedId, indexById, meta, rows]);

  useEffect(() => {
    if (!pendingFocus.current || !activeId) return;
    pendingFocus.current = false;
    const el = scrollRef.current?.querySelector<HTMLTableRowElement>(
      `tr[data-row-id="${CSS.escape(activeId)}"]`,
    );
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId, rows]);

  const emitSelection = useCallback(
    (next: Set<string>) => {
      setSelected(next);
      if (onSelectionChange) {
        const ids = rows.filter((r) => next.has(r.id)).map((r) => r.id);
        for (const id of next) if (!ids.includes(id)) ids.push(id);
        onSelectionChange(
          ids,
          ids.map((id) => meta.get(id)!.node),
        );
      }
    },
    [meta, onSelectionChange, rows],
  );

  const moveTo = useCallback(
    (id: string, mode: "select" | "extend" | "focus-only") => {
      pendingFocus.current = true;
      setFocusedId(id);
      if (mode === "focus-only") return;
      if (mode === "extend" && multiSelect) {
        const from = indexById.get(anchorId ?? activeId ?? id) ?? 0;
        const to = indexById.get(id) ?? 0;
        const [a, b] = from < to ? [from, to] : [to, from];
        emitSelection(new Set(rows.slice(a, b + 1).map((r) => r.id)));
        return;
      }
      setAnchorId(id);
      emitSelection(new Set([id]));
    },
    [activeId, anchorId, emitSelection, indexById, multiSelect, rows],
  );

  const setFolder = useCallback((id: string, open: boolean, via: "pointer" | "keyboard") => {
    setReveal(via === "pointer" ? "pointer" : "none");
    setExpanded((prev) => {
      if (prev.has(id) === open) return prev;
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const expandAll = (via: "pointer" | "keyboard") => {
    setReveal(via === "pointer" ? "pointer" : "none");
    setExpanded(new Set([...meta.values()].filter((m) => m.isFolder).map((m) => m.node.id)));
  };
  const collapseAll = () => {
    setExpanded(new Set());
  };

  const toggleSort = (key: FileTreeSortKey) => {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "modified" || key === "size" ? "desc" : "asc" },
    );
  };

  const open = (id: string, via: "pointer" | "keyboard") => {
    const m = meta.get(id);
    if (!m) return;
    if (m.isFolder) setFolder(id, !expanded.has(id), via);
    onOpen?.(m.node);
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTableSectionElement>) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>("tr[data-row-id]")?.dataset.rowId;
    if (!id) return;
    const i = indexById.get(id);
    if (i === undefined) return;
    const m = meta.get(id)!;
    const mod = e.metaKey || e.ctrlKey;
    const mode = e.shiftKey && multiSelect ? "extend" : mod && multiSelect ? "focus-only" : "select";
    let handled = true;

    switch (e.key) {
      case "ArrowDown":
        if (i < rows.length - 1) moveTo(rows[i + 1].id, mode);
        break;
      case "ArrowUp":
        if (i > 0) moveTo(rows[i - 1].id, mode);
        break;
      case "ArrowRight":
        if (m.isFolder) {
          if (!expanded.has(id)) setFolder(id, true, "keyboard");
          else if (rows[i + 1] && rows[i + 1].level > rows[i].level) moveTo(rows[i + 1].id, "select");
        }
        break;
      case "ArrowLeft":
        if (m.isFolder && expanded.has(id)) setFolder(id, false, "keyboard");
        else if (m.parentId) moveTo(m.parentId, "select");
        break;
      case "Home":
        moveTo(rows[0].id, mode);
        break;
      case "End":
        moveTo(rows[rows.length - 1].id, mode);
        break;
      case "PageDown":
        moveTo(rows[Math.min(rows.length - 1, i + 10)].id, mode);
        break;
      case "PageUp":
        moveTo(rows[Math.max(0, i - 10)].id, mode);
        break;
      case "Enter":
        open(id, "keyboard");
        break;
      case " ":
        if (multiSelect && mod) {
          const next = new Set(selected);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          setAnchorId(id);
          emitSelection(next);
        } else if (multiSelect && e.shiftKey) {
          moveTo(id, "extend");
        } else {
          setAnchorId(id);
          emitSelection(new Set([id]));
        }
        break;
      case "*": {
        // APG: expand every sibling folder of the focused row.
        setReveal("none");
        const parent = m.parentId ? meta.get(m.parentId)!.node.children! : tree;
        setExpanded((prev) => {
          const next = new Set(prev);
          parent.forEach((n) => n.children && next.add(n.id));
          return next;
        });
        break;
      }
      case "a":
        if (mod && multiSelect) {
          emitSelection(new Set(rows.map((r) => r.id)));
        } else handled = false;
        break;
      default:
        handled = false;
    }

    if (!handled && e.key.length === 1 && !mod && !e.altKey && e.key !== " ") {
      // Typeahead: letters typed within 600ms build a prefix; one repeated letter cycles matches.
      const t = typeahead.current;
      const stamp = e.timeStamp;
      t.buffer = stamp - t.at > 600 ? e.key.toLowerCase() : t.buffer + e.key.toLowerCase();
      t.at = stamp;
      const cycling = t.buffer.length > 1 && [...t.buffer].every((c) => c === t.buffer[0]);
      const needle = cycling ? t.buffer[0] : t.buffer;
      const start = t.buffer.length === 1 || cycling ? i + 1 : i;
      for (let k = 0; k < rows.length; k += 1) {
        const r = rows[(start + k) % rows.length];
        if (meta.get(r.id)!.node.name.toLowerCase().startsWith(needle)) {
          moveTo(r.id, "select");
          break;
        }
      }
      handled = true;
    }

    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleRowClick = (e: ReactMouseEvent, id: string) => {
    setFocusedId(id);
    if (multiSelect && e.shiftKey) {
      const from = indexById.get(anchorId ?? id) ?? 0;
      const to = indexById.get(id) ?? 0;
      const [a, b] = from < to ? [from, to] : [to, from];
      emitSelection(new Set(rows.slice(a, b + 1).map((r) => r.id)));
      return;
    }
    setAnchorId(id);
    if (multiSelect && (e.metaKey || e.ctrlKey)) {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      emitSelection(next);
      return;
    }
    emitSelection(new Set([id]));
  };

  // Toolbar context: the focused row's path, and a selection summary for the footer.
  const breadcrumb = useMemo(() => {
    const parts: string[] = [];
    let id: string | null = activeId;
    while (id) {
      const m = meta.get(id);
      if (!m) break;
      parts.unshift(m.node.name);
      id = m.parentId;
    }
    return parts;
  }, [activeId, meta]);

  const selectionSummary = useMemo(() => {
    let bytes = 0;
    let count = 0;
    for (const id of selected) {
      const m = meta.get(id);
      if (!m) continue;
      bytes += m.size;
      count += 1;
    }
    return { bytes, count };
  }, [meta, selected]);

  const anyExpanded = expanded.size > 0;

  const headers: { key: FileTreeSortKey; label: string; className: string; align: "left" | "right" }[] = [
    { key: "name", label: "Name", className: "", align: "left" },
    { key: "size", label: "Size", className: "w-[84px] @lg:w-[96px]", align: "right" },
    { key: "kind", label: "Kind", className: "hidden w-[150px] @2xl:table-cell", align: "left" },
    { key: "modified", label: "Modified", className: "w-[104px] @lg:w-[128px]", align: "right" },
  ];

  const ariaSort = (key: FileTreeSortKey) =>
    sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none";

  const guideColor = isDark ? "bg-[#ededed]/[0.07]" : "bg-[#171717]/[0.08]";
  const activeGuideColor = isDark ? "bg-[#d86a2c]/45" : "bg-[#bd4514]/40";
  // Light up the guide of the focused row's folder so the eye can trace its siblings.
  const guideSpan = useMemo(() => {
    const parentId = activeId ? meta.get(activeId)?.parentId ?? null : null;
    const from = parentId ? indexById.get(parentId) : undefined;
    if (from === undefined) return { depth: -1, from: -1, to: -1 };
    const level = rows[from].level;
    let to = from + 1;
    while (to < rows.length && rows[to].level > level) to += 1;
    return { depth: level - 1, from, to };
  }, [activeId, indexById, meta, rows]);

  return (
    <div
      className={cn(
        "@container mx-auto w-full max-w-[920px] overflow-hidden rounded-[18px] border text-[13px]",
        palette.container,
        className,
      )}
    >
      {/* Toolbar */}
      <div className={cn("flex items-center gap-3 border-b px-4 py-3", palette.divider)}>
        <div className="flex min-w-0 flex-1 items-center">
          <nav aria-label="Focused path" className="min-w-0">
            <ol className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap">
              <li className={cn("shrink-0 font-medium", palette.primaryText)}>{title}</li>
              {breadcrumb.length > 2 ? (
                <li aria-hidden className={cn("flex shrink-0 items-center gap-1 @2xl:hidden", palette.secondaryText)}>
                  <span>/</span>
                  <span>…</span>
                </li>
              ) : null}
              {breadcrumb.map((part, i) => (
                <li
                  key={`${part}-${i}`}
                  className={cn(
                    "flex min-w-0 items-center gap-1",
                    i === breadcrumb.length - 1 ? palette.primaryText : palette.secondaryText,
                    i < breadcrumb.length - 2 ? "hidden @2xl:flex" : "",
                    i === breadcrumb.length - 1 ? "min-w-[4rem]" : "shrink-[2]",
                  )}
                >
                  <span aria-hidden className={palette.secondaryText}>
                    /
                  </span>
                  <span className="truncate">{part}</span>
                </li>
              ))}
            </ol>
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => expandAll(e.detail === 0 ? "keyboard" : "pointer")}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-[9px] border px-2.5 text-[12px] transition-colors",
              palette.control,
              ACCENT_RING,
            )}
          >
            <ChevronsUpDown size={13} aria-hidden />
            <span className="hidden @md:inline">Expand all</span>
            <span className="sr-only @md:hidden">Expand all</span>
          </button>
          <button
            type="button"
            onClick={collapseAll}
            disabled={!anyExpanded}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-[9px] border px-2.5 text-[12px] transition-colors disabled:opacity-45",
              palette.control,
              ACCENT_RING,
            )}
          >
            <ChevronsDownUp size={13} aria-hidden />
            <span className="hidden @md:inline">Collapse all</span>
            <span className="sr-only @md:hidden">Collapse all</span>
          </button>
        </div>
      </div>

      {/* Scroll body: both axes so the header can stick while wide content scrolls sideways. */}
      <div
        ref={scrollRef}
        role="region"
        aria-label={`${title} files`}
        tabIndex={0}
        className={cn("relative overflow-auto overscroll-contain", ACCENT_RING)}
        style={{ maxHeight, scrollPaddingTop: 38 }}
      >
        <table
          role="treegrid"
          aria-label={`${title} file tree`}
          aria-multiselectable={multiSelect || undefined}
          aria-rowcount={rows.length + 1}
          aria-busy={loading || undefined}
          className="w-full min-w-[340px] table-fixed border-separate border-spacing-0"
        >
          <caption className="sr-only">
            Files in {title}. Arrow keys move between rows, Right expands a folder, Left collapses it, Enter opens,
            type to jump by name.
          </caption>
          <thead>
            <tr role="row">
              {headers.map((h) => (
                <th
                  key={h.key}
                  role="columnheader"
                  scope="col"
                  aria-sort={ariaSort(h.key)}
                  className={cn(
                    "sticky top-0 z-10 h-[38px] border-b p-0 font-medium",
                    palette.header,
                    h.className,
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(h.key)}
                    className={cn(
                      "group/sort flex h-full w-full items-center gap-1 px-3 text-[11px] uppercase tracking-[0.08em]",
                      h.align === "right" ? "justify-end" : "justify-start",
                      h.key === "name" ? "pl-[14px]" : "",
                      sort.key === h.key ? palette.primaryText : "",
                      ACCENT_RING,
                    )}
                  >
                    {h.label}
                    <span
                      aria-hidden
                      className={cn(
                        "inline-flex size-3.5 items-center justify-center transition-opacity",
                        sort.key === h.key ? cn("opacity-100", palette.accent) : "opacity-0 group-hover/sort:opacity-50",
                      )}
                    >
                      {sort.key === h.key && sort.dir === "desc" ? <ArrowDown size={11} /> : <ArrowUp size={11} />}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody onKeyDown={handleKeyDown}>
            {loading ? (
              Array.from({ length: 8 }, (_, i) => (
                <tr key={`sk-${i}`} role="row" aria-hidden>
                  <td role="gridcell" className={cn("h-[34px] border-b px-3", palette.divider)}>
                    <div
                      className={cn("h-3 rounded-full", palette.mutedSurface)}
                      style={{ width: `${40 + ((i * 37) % 40)}%`, marginLeft: (i % 3) * INDENT }}
                    />
                  </td>
                  <td role="gridcell" className={cn("border-b px-3", palette.divider)}>
                    <div className={cn("ml-auto h-3 w-10 rounded-full", palette.mutedSurface)} />
                  </td>
                  <td role="gridcell" className={cn("hidden border-b px-3 @2xl:table-cell", palette.divider)}>
                    <div className={cn("h-3 w-20 rounded-full", palette.mutedSurface)} />
                  </td>
                  <td role="gridcell" className={cn("border-b px-3", palette.divider)}>
                    <div className={cn("ml-auto h-3 w-14 rounded-full", palette.mutedSurface)} />
                  </td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr role="row">
                <td role="gridcell" colSpan={4} className={cn("px-4 py-12 text-center", palette.secondaryText)}>
                  This folder is empty.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const m = meta.get(row.id)!;
                const isOpen = m.isFolder && expanded.has(row.id);
                const isSelected = selected.has(row.id);
                const isActive = row.id === activeId;
                const Icon = iconOf(m.node, isOpen);
                const indent = PAD + (row.level - 1) * INDENT;
                const enter =
                  shouldAnimate && reveal !== "none"
                    ? {
                        initial: { opacity: 0, y: reveal === "mount" ? 6 : -3 },
                        animate: { opacity: 1, y: 0 },
                        transition: {
                          type: "spring" as const,
                          stiffness: 520,
                          damping: 38,
                          delay: reveal === "mount" ? Math.min(index, 18) * 0.022 : 0,
                        },
                      }
                    : { initial: false as const };
                return (
                  <motion.tr
                    key={row.id}
                    {...enter}
                    data-row-id={row.id}
                    role="row"
                    aria-level={row.level}
                    aria-setsize={row.setSize}
                    aria-posinset={row.posInSet}
                    aria-rowindex={index + 2}
                    aria-expanded={m.isFolder ? isOpen : undefined}
                    aria-selected={multiSelect ? isSelected : isSelected || undefined}
                    tabIndex={isActive ? 0 : -1}
                    onClick={(e) => handleRowClick(e, row.id)}
                    onDoubleClick={() => open(row.id, "pointer")}
                    onFocus={() => {
                      if (row.id !== focusedId) setFocusedId(row.id);
                    }}
                    className={cn(
                      "group/row cursor-default select-none transition-colors duration-150",
                      isSelected ? palette.selectedRow : palette.row,
                      ACCENT_RING,
                    )}
                  >
                    <td role="gridcell" className={cn("relative h-[34px] border-b p-0", palette.divider)}>
                      {isSelected ? (
                        <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-[#ec5c13]" />
                      ) : null}
                      {Array.from({ length: row.level - 1 }, (_, depth) => (
                        <span
                          key={depth}
                          aria-hidden
                          className={cn(
                            "pointer-events-none absolute -bottom-px top-0 w-px",
                            depth === guideSpan.depth && index > guideSpan.from && index < guideSpan.to
                              ? activeGuideColor
                              : guideColor,
                          )}
                          style={{ left: PAD + depth * INDENT + 7 }}
                        />
                      ))}
                      <div className="flex h-full min-w-0 items-center gap-1.5 pr-3" style={{ paddingLeft: indent }}>
                        {m.isFolder ? (
                          <span
                            aria-hidden
                            onClick={(e) => {
                              e.stopPropagation();
                              setFocusedId(row.id);
                              setFolder(row.id, !isOpen, "pointer");
                            }}
                            className={cn(
                              "-ml-0.5 grid size-[18px] shrink-0 place-items-center rounded-[5px]",
                              palette.secondaryText,
                              palette.menuItem,
                            )}
                          >
                            <ChevronRight
                              size={13}
                              strokeWidth={2}
                              className={cn(
                                "motion-safe:transition-transform motion-safe:duration-150",
                                isOpen && "rotate-90",
                              )}
                            />
                          </span>
                        ) : (
                          <span aria-hidden className="w-[16px] shrink-0" />
                        )}
                        <Icon
                          aria-hidden
                          size={15}
                          strokeWidth={1.7}
                          className={cn("shrink-0", m.isFolder ? palette.accent : palette.secondaryText)}
                        />
                        <span
                          className={cn(
                            "truncate",
                            palette.primaryText,
                            m.isFolder && "font-medium",
                          )}
                        >
                          {m.node.name}
                        </span>
                        {m.isFolder && !isOpen ? (
                          <span className={cn("hidden shrink-0 text-[11px] tabular-nums @md:inline", palette.secondaryText)}>
                            {m.fileCount}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td
                      role="gridcell"
                      className={cn(
                        "border-b px-3 text-right tabular-nums",
                        palette.divider,
                        m.isFolder ? palette.secondaryText : palette.primaryText,
                      )}
                    >
                      {formatBytes(m.size)}
                    </td>
                    <td
                      role="gridcell"
                      className={cn("hidden truncate border-b px-3 @2xl:table-cell", palette.divider, palette.secondaryText)}
                    >
                      {m.isFolder ? `Folder · ${m.fileCount} ${m.fileCount === 1 ? "file" : "files"}` : m.kind}
                    </td>
                    <td
                      role="gridcell"
                      className={cn("truncate border-b px-3 text-right tabular-nums", palette.divider, palette.secondaryText)}
                    >
                      {m.modified !== null && nowMs !== null ? (
                        <time
                          dateTime={new Date(m.modified).toISOString()}
                          title={mounted ? absoluteFormat.format(m.modified) : undefined}
                        >
                          {formatRelative(m.modified, nowMs)}
                        </time>
                      ) : (
                        <span aria-label="Unknown">—</span>
                      )}
                    </td>
                  </motion.tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div
        className={cn(
          "flex items-center justify-between gap-3 border-t px-4 py-2.5 text-[12px] tabular-nums",
          palette.divider,
          palette.secondaryText,
        )}
      >
        <span>
          {totals.fileCount} files · {formatBytes(totals.size)}
        </span>
        <span aria-live="polite" className={selectionSummary.count ? palette.primaryText : undefined}>
          {selectionSummary.count
            ? `${selectionSummary.count} selected · ${formatBytes(selectionSummary.bytes)}`
            : `${rows.length} rows shown`}
        </span>
      </div>
    </div>
  );
}

export default FileTreeTable;
