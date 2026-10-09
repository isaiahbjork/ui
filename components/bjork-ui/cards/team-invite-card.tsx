"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Link2, Loader2, X } from "lucide-react";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import { ease } from "@/components/bjork-ui/_core/motion";
import {
  CardButton,
  CardFrame,
  focusRing,
  useCardTheme,
  useClock,
  useReducedMotionSafe,
  type CardTheme,
} from "@/components/bjork-ui/cards/card-kit";
import { cn } from "@/lib/utils";

export interface InviteRole {
  id: string;
  label: string;
  description?: string;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: string;
  /** Epoch ms. */
  sentAt: number;
}

export interface TeamInviteCardProps {
  team?: string;
  roles?: InviteRole[];
  defaultRole?: string;
  /** Emails already on the team. Typing one flags it. */
  members?: string[];
  defaultPending?: PendingInvite[];
  /** Addresses already in the field at mount. */
  defaultEmails?: string[];
  seats?: { used: number; total: number };
  /** Resolve when the invites are sent; reject to keep the chips and show an error. Without it the card simulates a send. */
  onInvite?: (emails: string[], role: string) => Promise<void>;
  onResend?: (invite: PendingInvite) => void;
  onRevoke?: (invite: PendingInvite) => void;
  /** Shareable join link. Omit to hide the row. */
  inviteLink?: string;
  /** Role people get through the link. Default "member". */
  linkRole?: string;
  /** Days an invite stays valid. Default 7. */
  expiresInDays?: number;
  /** Epoch ms. Freezes the clock for previews and tests. */
  now?: number;
  theme?: CardTheme;
  className?: string;
}

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 8, 17);

export const TEAM_INVITE_SAMPLE = {
  team: "Northpeak",
  roles: [
    { id: "admin", label: "Admin", description: "Billing, members and every project" },
    { id: "member", label: "Member", description: "Create and edit projects" },
    { id: "viewer", label: "Viewer", description: "Read-only access" },
  ] satisfies InviteRole[],
  members: ["mara@northpeak.co", "rowan@northpeak.co", "iko@northpeak.co", "dana@northpeak.co", "sol@northpeak.co", "tamsin@northpeak.co"],
  pending: [
    { id: "inv_1", email: "jules@halden.io", role: "member", sentAt: NOW - 2 * DAY },
    { id: "inv_2", email: "ana.reyes@cobalt.dev", role: "viewer", sentAt: NOW - 6.5 * DAY },
  ] satisfies PendingInvite[],
  seats: { used: 6, total: 10 },
  inviteLink: "https://fieldwork.app/join/np-7Hq2xK",
  now: NOW,
};

function parseEmails(raw: string) {
  return raw
    .split(/[\s,;]+/)
    .map((p) => p.trim().replace(/^<|>$/g, ""))
    .filter(Boolean);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type ChipState = "ok" | "invalid" | "member" | "pending" | "duplicate";

interface Chip {
  email: string;
  state: ChipState;
}

const CHIP_HINT: Record<Exclude<ChipState, "ok">, string> = {
  invalid: "Not a valid email",
  member: "Already on the team",
  pending: "Already invited",
  duplicate: "Listed twice",
};

/**
 * Invite people by email: paste or type a list, pick a role, and send. Bad addresses, existing
 * members and seat limits are caught before sending; pending invites can be resent or revoked.
 */
export function TeamInviteCard({
  team = TEAM_INVITE_SAMPLE.team,
  roles = TEAM_INVITE_SAMPLE.roles,
  defaultRole,
  members = TEAM_INVITE_SAMPLE.members,
  defaultPending = TEAM_INVITE_SAMPLE.pending,
  defaultEmails = [],
  seats = TEAM_INVITE_SAMPLE.seats,
  onInvite,
  onResend,
  onRevoke,
  inviteLink = TEAM_INVITE_SAMPLE.inviteLink,
  linkRole = "member",
  expiresInDays = 7,
  now,
  theme = "auto",
  className,
}: TeamInviteCardProps) {
  const { style } = useCardTheme(theme);
  const reduce = useReducedMotionSafe();
  const clock = useClock(now, 60_000);
  const titleId = useId();
  const inputId = useId();
  const hintId = useId();
  const roleId = useId();

  const [emails, setEmails] = useState<string[]>(defaultEmails);
  const [draft, setDraft] = useState("");
  const [role, setRole] = useState(defaultRole ?? roles[1]?.id ?? roles[0]?.id ?? "");
  const [pending, setPending] = useState(defaultPending);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [resent, setResent] = useState<Set<string>>(new Set());
  const [linkCopied, setLinkCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const memberSet = useMemo(() => new Set(members.map((m) => m.toLowerCase())), [members]);
  const pendingSet = useMemo(() => new Set(pending.map((p) => p.email.toLowerCase())), [pending]);

  const classify = (list: string[]): Chip[] =>
    list.map((email, i) => {
      const e = email.toLowerCase();
      let state: ChipState = "ok";
      if (!EMAIL.test(email)) state = "invalid";
      else if (memberSet.has(e)) state = "member";
      else if (pendingSet.has(e)) state = "pending";
      else if (list.findIndex((x) => x.toLowerCase() === e) !== i) state = "duplicate";
      return { email, state };
    });
  const chips = classify(emails);
  const valid = chips.filter((c) => c.state === "ok");
  const problems = chips.filter((c) => c.state !== "ok");
  const seatsLeft = Math.max(0, seats.total - seats.used - pending.length);
  const overSeats = valid.length > seatsLeft;

  const commit = (raw: string) => {
    const parts = parseEmails(raw);
    if (parts.length === 0) return;
    setEmails((list) => [...list, ...parts]);
    setDraft("");
    setError(null);
  };

  const removeChip = (i: number) => {
    setEmails((list) => list.filter((_, j) => j !== i));
    inputRef.current?.focus();
  };

  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === "," || e.key === " " || e.key === ";") && draft.trim()) {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Enter" && !draft.trim() && valid.length) {
      e.preventDefault();
      void send();
    } else if (e.key === "Backspace" && !draft && emails.length) {
      e.preventDefault();
      setEmails((list) => list.slice(0, -1));
    }
  };

  const onPaste = (e: ReactClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (/[\s,;]/.test(text.trim())) {
      e.preventDefault();
      commit(draft + text);
    }
  };

  const send = async () => {
    // Include whatever is still in the input, so a click on Send never drops the last address.
    const all = [...emails, ...parseEmails(draft)];
    if (draft.trim()) commit(draft);
    const list = classify(all)
      .filter((c) => c.state === "ok")
      .map((c) => c.email);
    if (!list.length || list.length > seatsLeft || sending) return;
    setSending(true);
    setError(null);
    try {
      if (onInvite) await onInvite(list, role);
      else await new Promise((r) => setTimeout(r, 900));
      const sentAt = clock ?? Date.now();
      setPending((p) => [...list.map((email, i) => ({ id: `new-${sentAt}-${i}`, email, role, sentAt })), ...p]);
      setEmails((all) => all.filter((x) => !list.includes(x)));
      const roleLabel = roles.find((r) => r.id === role)?.label ?? role;
      setMessage(`Sent ${list.length} ${list.length === 1 ? "invite" : "invites"} as ${roleLabel}`);
    } catch {
      setError("Invites couldn’t be sent. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  const resend = (inv: PendingInvite) => {
    onResend?.(inv);
    setResent((s) => new Set(s).add(inv.id));
    setMessage(`Invite resent to ${inv.email}`);
    timers.current.push(
      window.setTimeout(
        () =>
          setResent((s) => {
            const n = new Set(s);
            n.delete(inv.id);
            return n;
          }),
        4000,
      ),
    );
  };

  const revoke = (inv: PendingInvite) => {
    onRevoke?.(inv);
    setPending((p) => p.filter((x) => x.id !== inv.id));
    setMessage(`Revoked invite for ${inv.email}`);
    inputRef.current?.focus();
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setLinkCopied(true);
      setMessage("Invite link copied");
      timers.current.push(window.setTimeout(() => setLinkCopied(false), 1800));
    } catch {
      setLinkCopied(false);
    }
  };

  const expiry = (inv: PendingInvite) => {
    if (clock === null) return "";
    const left = Math.ceil((inv.sentAt + expiresInDays * DAY - clock) / DAY);
    if (left <= 0) return "Expired";
    return left === 1 ? "Expires tomorrow" : `Expires in ${left} days`;
  };

  const usedPct = Math.min(1, (seats.used + pending.length) / seats.total);
  const roleMeta = roles.find((r) => r.id === role);

  return (
    <CardFrame aria-labelledby={titleId} className={className} style={style} maxWidth={440}>
      <div className="px-5 pt-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id={titleId} className="text-[15px] font-semibold leading-5">
            Invite to {team}
          </h3>
          <span className="shrink-0 text-[12px] leading-4 text-[color:var(--bjork-text-muted)]">
            <span className="text-[color:var(--bjork-text)]">{seatsLeft}</span> of {seats.total} seats free
          </span>
        </div>
        <div
          role="meter"
          aria-label="Seats used, including pending invites"
          aria-valuemin={0}
          aria-valuemax={seats.total}
          aria-valuenow={seats.used + pending.length}
          className="mt-2 flex h-1 gap-[3px]"
        >
          {Array.from({ length: seats.total }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-full flex-1 rounded-full transition-colors duration-300",
                i < seats.used
                  ? "bg-[color:var(--bjork-text-soft)]"
                  : i < seats.used + pending.length
                    ? "bg-[color:var(--bjork-accent-muted)]"
                    : i < seats.used + pending.length + valid.length
                      ? overSeats
                        ? "bg-[color:var(--bjork-error)]"
                        : "bg-[color:var(--bjork-accent)]"
                      : "bg-[color:var(--bjork-track)]",
              )}
            />
          ))}
        </div>
        <span className="sr-only">{usedPct === 1 ? "All seats are in use." : ""}</span>
      </div>

      <div className="px-5 pt-4">
        <label htmlFor={inputId} className="text-[12px] font-medium leading-4 text-[color:var(--bjork-text-medium)]">
          Email addresses
        </label>
        <div
          onClick={() => inputRef.current?.focus()}
          className={cn(
            "mt-1.5 flex min-h-[44px] cursor-text flex-wrap items-center gap-1.5 rounded-[12px] border bg-[color:var(--bjork-card-inset)] p-1.5 transition-[border-color,box-shadow] focus-within:border-[color:var(--bjork-accent)] focus-within:shadow-[0_0_0_3px_var(--bjork-accent-soft)]",
            problems.length ? "border-[color:var(--bjork-warning)]" : "border-[color:var(--bjork-border)]",
          )}
        >
          <ul className="contents" aria-label="Recipients">
            <AnimatePresence initial={false}>
              {chips.map((c, i) => (
                <motion.li
                  key={`${c.email}-${i}`}
                  layout={!reduce}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.16, ease: ease.out }}
                  title={c.state === "ok" ? undefined : CHIP_HINT[c.state]}
                  className={cn(
                    "inline-flex h-7 max-w-full items-center gap-1 rounded-[8px] border pl-2 pr-0.5 text-[12px]",
                    c.state === "ok"
                      ? "border-[color:var(--bjork-border)] bg-[color:var(--bjork-card-raised)]"
                      : c.state === "invalid"
                        ? "border-transparent bg-[color:var(--bjork-error-soft)] text-[color:var(--bjork-error)]"
                        : "border-transparent bg-[color:var(--bjork-warning-soft)] text-[color:var(--bjork-warning)]",
                  )}
                >
                  <span className="truncate">{c.email}</span>
                  {c.state !== "ok" && <span className="sr-only">, {CHIP_HINT[c.state]}</span>}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeChip(i);
                    }}
                    aria-label={`Remove ${c.email}`}
                    className={cn("grid size-6 cursor-pointer place-items-center rounded-[6px] opacity-60 hover:opacity-100", focusRing)}
                  >
                    <X aria-hidden="true" className="size-3" />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          <input
            ref={inputRef}
            id={inputId}
            type="email"
            inputMode="email"
            autoComplete="off"
            spellCheck={false}
            multiple
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            onPaste={onPaste}
            onBlur={() => draft.trim() && commit(draft)}
            aria-describedby={hintId}
            placeholder={emails.length ? "" : "name@company.com, …"}
            className="h-7 min-w-[8rem] flex-1 bg-transparent px-1.5 text-[13px] outline-none placeholder:text-[color:var(--bjork-text-soft)]"
          />
        </div>
        <p id={hintId} className="mt-1.5 min-h-4 text-[12px] leading-4 text-[color:var(--bjork-text-muted)]" aria-live="polite">
          {error ? (
            <span className="text-[color:var(--bjork-error)]">{error}</span>
          ) : overSeats ? (
            <span className="text-[color:var(--bjork-error)]">
              {valid.length - seatsLeft} more than your free seats. Remove some or add seats.
            </span>
          ) : problems.length ? (
            <span className="text-[color:var(--bjork-warning)]">
              {problems.length} {problems.length === 1 ? "address" : "addresses"} will be skipped: {problems.map((p) => CHIP_HINT[p.state as Exclude<ChipState, "ok">].toLowerCase()).filter((v, i, a) => a.indexOf(v) === i).join(", ")}.
            </span>
          ) : (
            "Separate with commas or paste a list."
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2 px-5 pt-3">
        <div className="min-w-[9rem] flex-1">
          <label htmlFor={roleId} className="text-[12px] font-medium leading-4 text-[color:var(--bjork-text-medium)]">
            Role
          </label>
          <div className="relative mt-1.5">
            <select
              id={roleId}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={cn(
                "h-9 w-full cursor-pointer appearance-none rounded-[10px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-card-raised)] pl-3 pr-8 text-[13px] text-[color:var(--bjork-text)]",
                focusRing,
              )}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-[color:var(--bjork-text-muted)]" />
          </div>
        </div>
        <CardButton
          variant="primary"
          onClick={send}
          disabled={!valid.length || overSeats || sending}
          aria-busy={sending || undefined}
          icon={sending ? <Loader2 aria-hidden="true" className="size-3.5 motion-safe:animate-spin" /> : undefined}
          className="min-w-[7.5rem]"
        >
          {sending ? "Sending" : valid.length > 1 ? `Send ${valid.length} invites` : "Send invite"}
        </CardButton>
      </div>
      {roleMeta?.description && (
        <p className="px-5 pt-1.5 text-[12px] leading-4 text-[color:var(--bjork-text-muted)]">{roleMeta.description}</p>
      )}

      {pending.length > 0 && (
        <div className="mt-4 border-t border-[color:var(--bjork-border)] px-2 py-2">
          <p className="px-3 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-[color:var(--bjork-text-muted)]">
            Pending · {pending.length}
          </p>
          <ul>
            <AnimatePresence initial={false}>
              {pending.map((inv) => {
                const exp = expiry(inv);
                return (
                  <motion.li
                    key={inv.id}
                    layout={!reduce}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                    animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                    transition={{ duration: 0.22, ease: ease.out }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center gap-3 rounded-[10px] px-3 py-2 hover:bg-[color:var(--bjork-card-hover)]">
                      <span
                        aria-hidden="true"
                        className="grid size-7 shrink-0 place-items-center rounded-full border border-dashed border-[color:var(--bjork-border-strong)] text-[11px] font-medium uppercase text-[color:var(--bjork-text-muted)]"
                      >
                        {inv.email[0]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] leading-5">{inv.email}</p>
                        <p className={cn("text-[11px] leading-4", exp === "Expired" ? "text-[color:var(--bjork-error)]" : "text-[color:var(--bjork-text-muted)]")}>
                          {roles.find((r) => r.id === inv.role)?.label ?? inv.role}
                          {exp && ` · ${exp}`}
                        </p>
                      </div>
                      <CardButton
                        size="sm"
                        variant="ghost"
                        disabled={resent.has(inv.id)}
                        onClick={() => resend(inv)}
                        aria-label={resent.has(inv.id) ? `Invite resent to ${inv.email}` : `Resend invite to ${inv.email}`}
                        className="px-2"
                      >
                        {resent.has(inv.id) ? (
                          <>
                            <Check aria-hidden="true" className="size-3.5 text-[color:var(--bjork-success)]" />
                            Sent
                          </>
                        ) : (
                          "Resend"
                        )}
                      </CardButton>
                      <button
                        type="button"
                        onClick={() => revoke(inv)}
                        aria-label={`Revoke invite for ${inv.email}`}
                        className={cn(
                          "grid size-8 cursor-pointer place-items-center rounded-[8px] text-[color:var(--bjork-text-muted)] transition-colors hover:bg-[color:var(--bjork-error-soft)] hover:text-[color:var(--bjork-error)]",
                          focusRing,
                        )}
                      >
                        <X aria-hidden="true" className="size-3.5" />
                      </button>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </div>
      )}

      {inviteLink && (
        <div className={cn("flex items-center gap-3 border-t border-[color:var(--bjork-border)] bg-[color:var(--bjork-card-raised)] px-5 py-3", pending.length === 0 && "mt-4")}>
          <Link2 aria-hidden="true" className="size-4 shrink-0 text-[color:var(--bjork-text-muted)]" />
          <span className="sr-only">{inviteLink}</span>
          <p className="min-w-0 flex-1 text-[12px] leading-4 text-[color:var(--bjork-text-muted)]">
            Anyone with the link joins as {roles.find((r) => r.id === linkRole)?.label ?? linkRole}
          </p>
          <CardButton size="sm" onClick={copyLink} icon={linkCopied ? <Check aria-hidden="true" className="size-3.5 text-[color:var(--bjork-success)]" /> : undefined}>
            {linkCopied ? "Copied" : "Copy link"}
          </CardButton>
        </div>
      )}
      <LiveRegion message={message} />
    </CardFrame>
  );
}
