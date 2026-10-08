"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTheme } from "next-themes";
import { Check, CircleCheck, Lock, Minus, Search, SearchX, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useElementSize } from "../_core/canvas";
import {
  type BjorkTableThemeMode,
  getBjorkTablePalette,
  useBjorkTableIsDark,
} from "./table-theme";

export interface PermissionRole {
  id: string;
  label: string;
  /** Number of people holding the role, shown under the header. */
  members?: number;
  /** Locked roles hold every permission and cannot be edited. */
  locked?: boolean;
  lockedReason?: string;
}

export interface PermissionItem {
  id: string;
  label: string;
  description?: string;
  /** roleId -> reason. The cell keeps its current value and cannot be edited. */
  lockedFor?: Record<string, string>;
}

export interface PermissionGroup {
  id: string;
  label: string;
  permissions: PermissionItem[];
}

/** permissionId -> roleId -> granted */
export type PermissionGrants = Record<string, Record<string, boolean>>;

export interface PermissionsMatrixProps {
  roles?: PermissionRole[];
  groups?: PermissionGroup[];
  /** Saved state. Changes are tracked against this. */
  value?: PermissionGrants;
  /** Optional working copy to start from (e.g. restoring unsaved edits). */
  initialDraft?: PermissionGrants;
  title?: string;
  subtitle?: string;
  /** Max height of the scrolling matrix. */
  maxHeight?: number;
  loading?: boolean;
  onSave?: (grants: PermissionGrants) => void | Promise<void>;
  onChange?: (grants: PermissionGrants) => void;
  theme?: BjorkTableThemeMode;
  enableAnimations?: boolean;
  className?: string;
}

export const PERMISSIONS_MATRIX_SAMPLE_ROLES: PermissionRole[] = [
  { id: "owner", label: "Owner", members: 1, locked: true, lockedReason: "Owners always hold every permission." },
  { id: "admin", label: "Admin", members: 3 },
  { id: "editor", label: "Editor", members: 12 },
  { id: "viewer", label: "Viewer", members: 28 },
  { id: "billing", label: "Billing", members: 2 },
];

export const PERMISSIONS_MATRIX_SAMPLE_GROUPS: PermissionGroup[] = [
  {
    id: "projects",
    label: "Projects",
    permissions: [
      { id: "projects.view", label: "View projects", lockedFor: { viewer: "Viewing projects is what the Viewer role is for." } },
      { id: "projects.create", label: "Create projects" },
      { id: "projects.settings", label: "Edit project settings" },
      { id: "projects.archive", label: "Archive projects" },
      { id: "projects.delete", label: "Delete projects", description: "Permanently removes files and history" },
    ],
  },
  {
    id: "members",
    label: "Members",
    permissions: [
      { id: "members.view", label: "View member list" },
      { id: "members.invite", label: "Invite members" },
      { id: "members.roles", label: "Change member roles" },
      { id: "members.remove", label: "Remove members" },
    ],
  },
  {
    id: "billing",
    label: "Billing",
    permissions: [
      { id: "billing.invoices", label: "View invoices", lockedFor: { billing: "The Billing role always reads invoices." } },
      { id: "billing.payment", label: "Update payment method" },
      { id: "billing.plan", label: "Change plan", description: "Upgrades take effect immediately" },
    ],
  },
  {
    id: "api",
    label: "API keys",
    permissions: [
      { id: "api.view", label: "View API keys" },
      { id: "api.create", label: "Create API keys" },
      { id: "api.revoke", label: "Revoke API keys" },
    ],
  },
  {
    id: "audit",
    label: "Audit log",
    permissions: [
      { id: "audit.view", label: "View audit log" },
      { id: "audit.export", label: "Export audit log" },
    ],
  },
];

function grantsFrom(table: Record<string, string[]>): PermissionGrants {
  const out: PermissionGrants = {};
  for (const [permissionId, roleIds] of Object.entries(table)) {
    out[permissionId] = {};
    for (const roleId of roleIds) out[permissionId][roleId] = true;
  }
  return out;
}

export const PERMISSIONS_MATRIX_SAMPLE: PermissionGrants = grantsFrom({
  "projects.view": ["owner", "admin", "editor", "viewer", "billing"],
  "projects.create": ["owner", "admin", "editor"],
  "projects.settings": ["owner", "admin", "editor"],
  "projects.archive": ["owner", "admin"],
  "projects.delete": ["owner", "admin"],
  "members.view": ["owner", "admin", "editor", "viewer", "billing"],
  "members.invite": ["owner", "admin"],
  "members.roles": ["owner", "admin"],
  "members.remove": ["owner", "admin"],
  "billing.invoices": ["owner", "admin", "billing"],
  "billing.payment": ["owner", "billing"],
  "billing.plan": ["owner", "billing"],
  "api.view": ["owner", "admin", "editor"],
  "api.create": ["owner", "admin"],
  "api.revoke": ["owner", "admin"],
  "audit.view": ["owner", "admin"],
  "audit.export": ["owner"],
});

type CheckState = boolean | "mixed";

type MatrixRow =
  | { kind: "group"; key: string; group: PermissionGroup; items: PermissionItem[] }
  | { kind: "permission"; key: string; group: PermissionGroup; item: PermissionItem };

const COMPACT_BREAKPOINT = 480;

const noopSubscribe = () => () => {};

function useMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export function PermissionsMatrix({
  roles = PERMISSIONS_MATRIX_SAMPLE_ROLES,
  groups = PERMISSIONS_MATRIX_SAMPLE_GROUPS,
  value = PERMISSIONS_MATRIX_SAMPLE,
  initialDraft,
  title = "Roles & permissions",
  subtitle = "Kestrel Studio workspace · 46 members",
  maxHeight = 400,
  loading = false,
  onSave,
  onChange,
  theme = "auto",
  enableAnimations = true,
  className,
}: PermissionsMatrixProps) {
  const mounted = useMounted();
  const { resolvedTheme } = useTheme();
  const forcedTheme = theme === "auto" ? undefined : theme;
  const detectedIsDark = useBjorkTableIsDark(resolvedTheme, forcedTheme);
  const isDark = !mounted && theme === "auto" ? true : detectedIsDark;
  const palette = getBjorkTablePalette(isDark);
  const shouldReduceMotion = useReducedMotion();
  const shouldAnimate = enableAnimations && !shouldReduceMotion;

  const rootRef = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(rootRef);
  const compact = width > 0 && width < COMPACT_BREAKPOINT;

  const [baseline, setBaseline] = useState<PermissionGrants>(value);
  const [draft, setDraft] = useState<PermissionGrants>(initialDraft ?? value);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [active, setActive] = useState<{ row: string; role: string } | null>(null);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [keyboardMode, setKeyboardMode] = useState(false);

  // Adopt a new saved state from the parent.
  const [lastValue, setLastValue] = useState(value);
  if (lastValue !== value) {
    setLastValue(value);
    setBaseline(value);
    setDraft(value);
  }

  const lockReason = useCallback(
    (item: PermissionItem, role: PermissionRole): string | null => {
      if (role.locked) return role.lockedReason ?? `${role.label} cannot be edited.`;
      return item.lockedFor?.[role.id] ?? null;
    },
    []
  );

  const isGranted = useCallback(
    (grants: PermissionGrants, item: PermissionItem, role: PermissionRole) =>
      role.locked ? true : Boolean(grants[item.id]?.[role.id]),
    []
  );

  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = useMemo(() => {
    if (!normalizedQuery) return groups.map((group) => ({ group, items: group.permissions }));
    return groups
      .map((group) => {
        const groupHit = group.label.toLowerCase().includes(normalizedQuery);
        const items = groupHit
          ? group.permissions
          : group.permissions.filter(
              (item) =>
                item.label.toLowerCase().includes(normalizedQuery) ||
                item.description?.toLowerCase().includes(normalizedQuery)
            );
        return { group, items };
      })
      .filter((entry) => entry.items.length > 0);
  }, [groups, normalizedQuery]);

  const rows = useMemo<MatrixRow[]>(() => {
    const out: MatrixRow[] = [];
    for (const { group, items } of visibleGroups) {
      out.push({ kind: "group", key: `g:${group.id}`, group, items });
      for (const item of items) out.push({ kind: "permission", key: `p:${item.id}`, group, item });
    }
    return out;
  }, [visibleGroups]);

  const dirtyCells = useMemo(() => {
    const set = new Set<string>();
    for (const group of groups) {
      for (const item of group.permissions) {
        for (const role of roles) {
          if (role.locked) continue;
          if (Boolean(draft[item.id]?.[role.id]) !== Boolean(baseline[item.id]?.[role.id])) {
            set.add(`${item.id}|${role.id}`);
          }
        }
      }
    }
    return set;
  }, [groups, roles, draft, baseline]);
  const dirtyCount = dirtyCells.size;

  const commit = (next: PermissionGrants) => {
    setDraft(next);
    setSavedFlash(false);
    onChange?.(next);
  };

  const setCells = (items: PermissionItem[], role: PermissionRole, granted: boolean) => {
    const next: PermissionGrants = { ...draft };
    for (const item of items) {
      if (lockReason(item, role)) continue;
      next[item.id] = { ...(next[item.id] ?? {}), [role.id]: granted };
    }
    commit(next);
  };

  const groupState = (items: PermissionItem[], role: PermissionRole): CheckState => {
    const on = items.filter((item) => isGranted(draft, item, role)).length;
    if (on === 0) return false;
    if (on === items.length) return true;
    return "mixed";
  };

  const groupLocked = (items: PermissionItem[], role: PermissionRole) =>
    role.locked ? lockReason(items[0], role) : items.every((item) => lockReason(item, role)) ? "Every permission in this group is fixed for this role." : null;

  const toggleRowCell = (row: MatrixRow, role: PermissionRole) => {
    if (row.kind === "permission") {
      if (lockReason(row.item, role)) return;
      setCells([row.item], role, !isGranted(draft, row.item, role));
    } else {
      if (groupLocked(row.items, role)) return;
      const state = groupState(row.items.filter((item) => !lockReason(item, role)), role);
      setCells(row.items, role, state !== true);
    }
  };

  const handleDiscard = () => {
    setDraft(baseline);
    onChange?.(baseline);
  };

  const handleSave = async () => {
    if (!dirtyCount || saving) return;
    const snapshot: PermissionGrants = {};
    for (const group of groups) {
      for (const item of group.permissions) {
        snapshot[item.id] = {};
        for (const role of roles) snapshot[item.id][role.id] = isGranted(draft, item, role);
      }
    }
    setSaving(true);
    try {
      await onSave?.(snapshot);
      setBaseline(draft);
      setSavedFlash(true);
    } finally {
      setSaving(false);
    }
  };

  // ---------- roving focus ----------
  const activeRowKey = active && rows.some((row) => row.key === active.row) ? active.row : rows[0]?.key;
  const activeRoleId = active && roles.some((role) => role.id === active.role) ? active.role : roles[0]?.id;

  const focusCell = (from: HTMLElement, rowKey: string, roleId: string) => {
    setActive({ row: rowKey, role: roleId });
    from
      .closest("table")
      ?.querySelector<HTMLButtonElement>(`[data-cell="${CSS.escape(`${rowKey}|${roleId}`)}"]`)
      ?.focus();
  };

  const handleCellKey = (e: ReactKeyboardEvent<HTMLButtonElement>, rowIndex: number, roleIndex: number) => {
    if (!keyboardMode) setKeyboardMode(true);
    let r = rowIndex;
    let c = roleIndex;
    switch (e.key) {
      case "ArrowDown":
        r = Math.min(rows.length - 1, r + 1);
        break;
      case "ArrowUp":
        r = Math.max(0, r - 1);
        break;
      case "ArrowRight":
        c = Math.min(roles.length - 1, c + 1);
        break;
      case "ArrowLeft":
        c = Math.max(0, c - 1);
        break;
      case "Home":
        c = 0;
        if (e.ctrlKey || e.metaKey) r = 0;
        break;
      case "End":
        c = roles.length - 1;
        if (e.ctrlKey || e.metaKey) r = rows.length - 1;
        break;
      case "PageDown":
        r = Math.min(rows.length - 1, r + 5);
        break;
      case "PageUp":
        r = Math.max(0, r - 5);
        break;
      case " ":
      case "Enter":
        e.preventDefault();
        if (e.key === " ") toggleRowCell(rows[rowIndex], roles[roleIndex]);
        return;
      default:
        return;
    }
    e.preventDefault();
    focusCell(e.currentTarget, rows[r].key, roles[c].id);
  };

  // ---------- tooltip ----------
  const showTip = (target: HTMLElement, text: string) => {
    const root = rootRef.current;
    if (!root) return;
    const a = target.getBoundingClientRect();
    const b = root.getBoundingClientRect();
    setTip({ text, x: a.left + a.width / 2 - b.left, y: a.top - b.top });
  };
  const hideTip = () => setTip(null);

  // ---------- visuals ----------
  const accentFill = isDark ? "#ec5c13" : "#bd4514";
  const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[#ec5c13]/70";
  const stickyBg = isDark ? "bg-[#111]" : "bg-[#fffcf6]";
  const groupBg = isDark ? "bg-[#151515]" : "bg-[#fbf7ef]";
  const permWidth = compact ? 140 : 248;
  const roleWidth = compact ? 74 : 104;
  const tableMinWidth = permWidth + roles.length * roleWidth;

  const renderBox = (state: CheckState, locked: boolean, dirty: boolean) => {
    const on = state !== false;
    const animate = shouldAnimate && !keyboardMode;
    return (
      <span
        aria-hidden
        className={cn(
          "relative grid size-[18px] place-items-center rounded-[5px] border transition-colors duration-150",
          locked
            ? isDark
              ? "border-[#ededed]/10 bg-[#ededed]/[0.06] text-[#ededed]/45"
              : "border-[#171717]/10 bg-[#171717]/[0.05] text-[#171717]/45"
            : on
              ? "border-transparent text-white"
              : isDark
                ? "border-[#ededed]/22 bg-transparent group-hover/cell:border-[#ededed]/40"
                : "border-[#171717]/22 bg-[#fffcf6] group-hover/cell:border-[#171717]/40"
        )}
        style={!locked && on ? { background: accentFill } : undefined}
      >
        {locked ? (
          <>
            {state === "mixed" ? (
              <Minus className="size-3" strokeWidth={3} />
            ) : state ? (
              <Check className="size-3" strokeWidth={3} />
            ) : null}
            <span
              className={cn(
                "absolute -bottom-[5px] -right-[5px] grid size-[11px] place-items-center rounded-full",
                isDark ? "bg-[#111] text-[#ededed]/60" : "bg-[#fffcf6] text-[#171717]/55"
              )}
            >
              <Lock className="size-[8px]" strokeWidth={2.75} />
            </span>
          </>
        ) : (
          <AnimatePresence initial={false} mode="popLayout">
            {state === "mixed" ? (
              <motion.span
                key="mixed"
                initial={animate ? { scale: 0.4, opacity: 0 } : false}
                animate={{ scale: 1, opacity: 1 }}
                exit={animate ? { scale: 0.4, opacity: 0 } : { opacity: 0, transition: { duration: 0 } }}
                transition={animate ? { type: "spring", stiffness: 700, damping: 30 } : { duration: 0 }}
                className="grid place-items-center"
              >
                <Minus className="size-3" strokeWidth={3} />
              </motion.span>
            ) : state ? (
              <motion.span
                key="on"
                initial={animate ? { scale: 0.4, opacity: 0 } : false}
                animate={{ scale: 1, opacity: 1 }}
                exit={animate ? { scale: 0.4, opacity: 0 } : { opacity: 0, transition: { duration: 0 } }}
                transition={animate ? { type: "spring", stiffness: 700, damping: 30 } : { duration: 0 }}
                className="grid place-items-center"
              >
                <Check className="size-3" strokeWidth={3} />
              </motion.span>
            ) : null}
          </AnimatePresence>
        )}
        {dirty ? (
          <span
            className={cn("absolute -right-[5px] -top-[5px] size-[7px] rounded-full ring-2", isDark ? "ring-[#111]" : "ring-[#fffcf6]")}
            style={{ background: isDark ? "#d86a2c" : "#bd4514" }}
          />
        ) : null}
      </span>
    );
  };

  const renderCell = (
    row: MatrixRow,
    rowIndex: number,
    role: PermissionRole,
    roleIndex: number,
    borderClassName?: string
  ) => {
    const isGroup = row.kind === "group";
    const reason = isGroup ? groupLocked(row.items, role) : lockReason(row.item, role);
    const state: CheckState = isGroup
      ? groupState(row.items, role)
      : isGranted(draft, row.item, role);
    const dirty = isGroup
      ? row.items.some((item) => dirtyCells.has(`${item.id}|${role.id}`))
      : dirtyCells.has(`${row.item.id}|${role.id}`);
    const label = isGroup
      ? `${role.label}: all ${row.group.label} permissions`
      : `${role.label}: ${row.item.label}`;
    const cellKey = `${row.key}|${role.id}`;
    const isActive = row.key === activeRowKey && role.id === activeRoleId;
    const describedBy = reason ? `pm-why-${cellKey.replace(/[^a-z0-9]/gi, "-")}` : undefined;

    return (
      <td
        key={role.id}
        role="gridcell"
        className={cn(
          "h-10 px-0 text-center align-middle",
          borderClassName,
          dirty && !isGroup && (isDark ? "bg-[#ec5c13]/[0.06]" : "bg-[#ec5c13]/[0.05]")
        )}
      >
        <button
          data-cell={cellKey}
          type="button"
          role="checkbox"
          aria-checked={state}
          aria-label={label}
          aria-disabled={reason ? true : undefined}
          aria-describedby={describedBy}
          tabIndex={isActive ? 0 : -1}
          onPointerDown={() => {
            if (keyboardMode) setKeyboardMode(false);
          }}
          onClick={() => {
            setActive({ row: row.key, role: role.id });
            toggleRowCell(row, role);
          }}
          onKeyDown={(e) => handleCellKey(e, rowIndex, roleIndex)}
          onFocus={(e) => {
            setActive({ row: row.key, role: role.id });
            if (reason) showTip(e.currentTarget, reason);
          }}
          onBlur={hideTip}
          onPointerEnter={(e) => reason && showTip(e.currentTarget, reason)}
          onPointerLeave={hideTip}
          className={cn(
            "group/cell mx-auto grid size-8 place-items-center rounded-[8px] transition-colors",
            reason ? "cursor-not-allowed" : cn("cursor-pointer", palette.menuItem),
            focusRing
          )}
        >
          {renderBox(state, Boolean(reason), dirty)}
          {describedBy ? (
            <span id={describedBy} hidden>
              {reason}
            </span>
          ) : null}
        </button>
      </td>
    );
  };

  const headerLabel = "text-[11px] font-medium uppercase tracking-[0.08em]";

  return (
    <div
      ref={rootRef}
      className={cn("relative mx-auto w-full max-w-[860px] rounded-[18px] border", palette.container, className)}
    >
      {/* toolbar */}
      <div className={cn("flex flex-col gap-3 border-b px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between", palette.divider)}>
        <div className="min-w-0">
          <div className={cn("text-[15px] font-semibold tracking-[-0.01em]", palette.primaryText)}>{title}</div>
          {subtitle ? <div className={cn("mt-0.5 text-[12px]", palette.secondaryText)}>{subtitle}</div> : null}
        </div>
        <label
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-[10px] border px-2.5 text-[13px] sm:w-[220px] focus-within:ring-2 focus-within:ring-[#ec5c13]/50",
            palette.control
          )}
        >
          <Search aria-hidden className="size-3.5 shrink-0 opacity-60" />
          <span className="sr-only">Search permissions</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search permissions"
            className={cn(
              "min-w-0 flex-1 bg-transparent outline-none [&::-webkit-search-cancel-button]:hidden",
              isDark ? "placeholder:text-[#ededed]/32" : "placeholder:text-[#171717]/40",
              palette.primaryText
            )}
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className={cn("grid size-5 place-items-center rounded-full opacity-60 hover:opacity-100", focusRing)}
            >
              <X className="size-3" />
            </button>
          ) : null}
        </label>
      </div>

      {/* matrix */}
      <div
        role="region"
        aria-label={`${title} matrix`}
        tabIndex={-1}
        className="relative overflow-auto"
        style={{ maxHeight }}
        onScroll={tip ? hideTip : undefined}
      >
        <table
          role="grid"
          aria-label={title}
          aria-rowcount={rows.length + 1}
          aria-busy={loading || undefined}
          className="w-full table-fixed border-separate border-spacing-0 text-[13px]"
          style={{ minWidth: tableMinWidth }}
        >
          <caption className="sr-only">
            {title}. Rows are permissions grouped by resource, columns are roles. Use arrow keys to move between
            checkboxes and Space to toggle.
          </caption>
          <colgroup>
            <col style={{ width: permWidth }} />
            {roles.map((role) => (
              <col key={role.id} style={{ width: roleWidth }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th
                scope="col"
                className={cn(
                  "sticky left-0 top-0 z-30 border-b border-r px-4 py-2.5 text-left",
                  headerLabel,
                  palette.header
                )}
              >
                Permission
              </th>
              {roles.map((role) => (
                <th
                  key={role.id}
                  scope="col"
                  className={cn("sticky top-0 z-20 border-b px-1 py-2.5 text-center font-normal", palette.header)}
                >
                  <div className={cn("flex items-center justify-center gap-1", headerLabel)}>
                    {role.locked ? <Lock aria-hidden className="size-2.5" strokeWidth={2.5} /> : null}
                    {role.label}
                  </div>
                  {typeof role.members === "number" ? (
                    <div className={cn("mt-0.5 text-[11px] tabular-nums normal-case tracking-normal", palette.secondaryText)}>
                      {role.members} {role.members === 1 ? "member" : "members"}
                    </div>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>

          {loading ? (
            <tbody aria-hidden>
              {Array.from({ length: 7 }, (_, i) => (
                <tr key={i}>
                  <td className={cn("sticky left-0 border-b border-r px-4", stickyBg, palette.divider)}>
                    <span className={cn("block h-3 rounded", palette.mutedSurface, !shouldReduceMotion && "animate-pulse")} style={{ width: `${55 + ((i * 17) % 35)}%` }} />
                  </td>
                  {roles.map((role) => (
                    <td key={role.id} className={cn("h-10 border-b", palette.divider)}>
                      <span className={cn("mx-auto block size-[18px] rounded-[5px]", palette.mutedSurface, !shouldReduceMotion && "animate-pulse")} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ) : rows.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={roles.length + 1} className="px-4 py-12">
                  <div className={cn("sticky left-0 flex w-full max-w-[360px] flex-col items-start gap-1.5 sm:mx-auto sm:items-center sm:text-center", palette.secondaryText)}>
                    <SearchX aria-hidden className="size-5 opacity-70" />
                    <div className={cn("text-[13px] font-medium", palette.primaryText)}>
                      No permissions match “{query.trim()}”
                    </div>
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className={cn("text-[12px] underline-offset-2 hover:underline", palette.accent, focusRing)}
                    >
                      Clear search
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          ) : (
            visibleGroups.map(({ group, items }, groupIndex) => {
              const groupRowIndex = rows.findIndex((row) => row.key === `g:${group.id}`);
              const groupRow = rows[groupRowIndex];
              return (
                <tbody key={group.id}>
                  <motion.tr
                    initial={shouldAnimate ? { opacity: 0 } : false}
                    animate={{ opacity: 1 }}
                    transition={shouldAnimate ? { delay: 0.05 * groupIndex, duration: 0.3 } : { duration: 0 }}
                    className={groupBg}
                  >
                    <th
                      scope="rowgroup"
                      className={cn(
                        "sticky left-0 z-10 border-b border-r px-4 text-left align-middle",
                        groupBg,
                        palette.divider,
                        groupIndex > 0 && "border-t"
                      )}
                    >
                      <span className={cn("text-[11px] font-semibold uppercase tracking-[0.08em]", palette.primaryText)}>
                        {group.label}
                      </span>
                      <span className={cn("ml-2 text-[11px] tabular-nums", palette.secondaryText)}>{items.length}</span>
                    </th>
                    {roles.map((role, roleIndex) =>
                      renderCell(groupRow, groupRowIndex, role, roleIndex, cn("border-b", palette.divider, groupIndex > 0 && "border-t"))
                    )}
                  </motion.tr>
                  {items.map((item, itemIndex) => {
                    const rowIndex = groupRowIndex + 1 + itemIndex;
                    const row = rows[rowIndex];
                    const last = itemIndex === items.length - 1;
                    return (
                      <motion.tr
                        key={item.id}
                        initial={shouldAnimate ? { opacity: 0 } : false}
                        animate={{ opacity: 1 }}
                        transition={
                          shouldAnimate ? { delay: 0.05 * groupIndex + 0.025 * (itemIndex + 1), duration: 0.3 } : { duration: 0 }
                        }
                        className={cn("transition-colors", isDark ? "hover:bg-[#181818]/70" : "hover:bg-[#f8f2e7]/72")}
                      >
                        <th
                          scope="row"
                          className={cn(
                            "sticky left-0 z-10 border-r px-4 py-1.5 text-left font-normal",
                            !last && "border-b",
                            stickyBg,
                            palette.divider
                          )}
                        >
                          <div className={cn("truncate text-[13px]", palette.primaryText)}>{item.label}</div>
                          {item.description && !compact ? (
                            <div className={cn("truncate text-[11px]", palette.secondaryText)}>{item.description}</div>
                          ) : null}
                        </th>
                        {roles.map((role, roleIndex) =>
                          renderCell(row, rowIndex, role, roleIndex, cn(!last && "border-b", palette.divider))
                        )}
                      </motion.tr>
                    );
                  })}
                </tbody>
              );
            })
          )}
        </table>
      </div>

      {/* sticky footer */}
      <div
        className={cn(
          "sticky bottom-0 z-30 flex items-center justify-between gap-3 rounded-b-[18px] border-t px-4 py-2.5",
          palette.divider,
          stickyBg
        )}
      >
        <div aria-live="polite" className="flex min-w-0 items-center gap-2 text-[13px]">
          {dirtyCount > 0 ? (
            <>
              <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: accentFill }} />
              <span className={cn("truncate tabular-nums", palette.primaryText)}>
                {dirtyCount} unsaved {dirtyCount === 1 ? "change" : "changes"}
              </span>
            </>
          ) : (
            <>
              <CircleCheck aria-hidden className={cn("size-3.5 shrink-0", palette.secondaryText)} />
              <span className={cn("truncate", palette.secondaryText)}>
                {savedFlash ? "Changes saved" : "All changes saved"}
              </span>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleDiscard}
            disabled={!dirtyCount || saving}
            className={cn(
              "h-8 rounded-[10px] border px-3 text-[13px] transition-colors disabled:pointer-events-none disabled:opacity-40",
              palette.control,
              focusRing
            )}
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirtyCount || saving}
            className={cn(
              "h-8 rounded-[10px] px-3.5 text-[13px] font-medium text-white transition-[opacity,filter] hover:brightness-110 disabled:pointer-events-none disabled:opacity-40",
              focusRing,
              "focus-visible:ring-offset-2",
              isDark ? "focus-visible:ring-offset-[#111]" : "focus-visible:ring-offset-[#fffcf6]"
            )}
            style={{ background: accentFill }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* lock tooltip */}
      {tip ? (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute z-50 max-w-[220px] -translate-x-1/2 -translate-y-full rounded-[8px] border px-2.5 py-1.5 text-[12px] leading-snug",
            palette.menu
          )}
          style={{ left: tip.x, top: tip.y - 6 }}
        >
          {tip.text}
        </div>
      ) : null}
    </div>
  );
}
