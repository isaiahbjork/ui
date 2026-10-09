"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SVGProps,
} from "react";
import {
  Bell,
  Check,
  CreditCard,
  Download,
  KeyRound,
  Laptop,
  Monitor,
  Moon,
  Palette,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import {
  BlockButton,
  BlockDialog,
  BlockField,
  BlockSpinner,
  BlockSwitch,
  InitialsAvatar,
  Kbd,
  blockRoot,
  focusRing,
  inputClass,
  useAppBlockTheme,
  useBlockToast,
  type AppBlockTheme,
} from "@/components/bjork-ui/blocks/app-block-kit";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------------------------------------- */

export type SettingsSection = "profile" | "notifications" | "appearance" | "security" | "billing";

export interface SettingsProfile {
  name: string;
  username: string;
  email: string;
  bio: string;
  timezone: string;
}

export type NotificationChannel = "email" | "push";

export interface NotificationPrefs {
  /** Event id -> channels that are on. */
  events: Record<string, Record<NotificationChannel, boolean>>;
  digest: "instant" | "hourly" | "daily";
  quietHours: { enabled: boolean; from: string; to: string };
}

export interface SettingsSession {
  id: string;
  device: string;
  kind: "desktop" | "mobile";
  location: string;
  lastActive: string;
  current?: boolean;
}

export interface SettingsInvoice {
  id: string;
  date: string;
  amount: string;
  status: "paid" | "due";
}

export interface AppSettingsProps {
  profile?: SettingsProfile;
  notifications?: NotificationPrefs;
  sessions?: SettingsSession[];
  invoices?: SettingsInvoice[];
  defaultSection?: SettingsSection;
  /** Called with only the parts that changed. Throw to show an error. */
  onSave?: (changes: { profile?: SettingsProfile; notifications?: NotificationPrefs }) => Promise<void> | void;
  /** Throw with a message to reject (e.g. a wrong current password). */
  onChangePassword?: (current: string, next: string) => Promise<void> | void;
  onRevokeSession?: (id: string) => void;
  onToggleTwoFactor?: (enabled: boolean) => void;
  onDeleteAccount?: () => void;
  /** Theme picked under Appearance. The block re-themes itself either way. */
  onThemeChange?: (theme: AppBlockTheme) => void;
  /** Rejects these usernames as taken. */
  takenUsernames?: string[];
  theme?: AppBlockTheme;
  className?: string;
}

/* ----------------------------------------------------------------------------------------------------------
 * Sample data
 * -------------------------------------------------------------------------------------------------------- */

const SAMPLE_PROFILE: SettingsProfile = {
  name: "Rhea Castillo",
  username: "rhea",
  email: "rhea@halcyon.app",
  bio: "Design engineer. I look after the dashboard and the parts of it nobody notices until they break.",
  timezone: "America/Los_Angeles",
};

const NOTIFICATION_EVENTS: { id: string; label: string; hint: string; locked?: NotificationChannel[] }[] = [
  { id: "mentions", label: "Mentions", hint: "Someone @mentions you in a comment or doc." },
  { id: "assigned", label: "Assigned to you", hint: "An issue or review is handed to you." },
  { id: "comments", label: "Comments on your work", hint: "Replies on docs and issues you created." },
  { id: "digest", label: "Weekly summary", hint: "A Monday recap of what moved in your workspace." },
  { id: "product", label: "Product updates", hint: "New features, at most twice a month." },
  { id: "security", label: "Security alerts", hint: "New sign-ins and changes to your password.", locked: ["email"] },
];

const SAMPLE_NOTIFICATIONS: NotificationPrefs = {
  events: {
    mentions: { email: true, push: true },
    assigned: { email: true, push: true },
    comments: { email: false, push: true },
    digest: { email: true, push: false },
    product: { email: false, push: false },
    security: { email: true, push: true },
  },
  digest: "hourly",
  quietHours: { enabled: true, from: "22:00", to: "07:00" },
};

const SAMPLE_SESSIONS: SettingsSession[] = [
  { id: "s1", device: "Chrome on macOS", kind: "desktop", location: "San Francisco, US", lastActive: "Active now", current: true },
  { id: "s2", device: "Halcyon for iOS", kind: "mobile", location: "San Francisco, US", lastActive: "2 hours ago" },
  { id: "s3", device: "Firefox on Windows", kind: "desktop", location: "Lisbon, PT", lastActive: "Sep 29" },
  { id: "s4", device: "Safari on iPadOS", kind: "mobile", location: "Oakland, US", lastActive: "Sep 12" },
];

const SAMPLE_INVOICES: SettingsInvoice[] = [
  { id: "INV-2026-010", date: "Oct 1, 2026", amount: "$588.00", status: "due" },
  { id: "INV-2026-009", date: "Sep 1, 2026", amount: "$588.00", status: "paid" },
  { id: "INV-2026-008", date: "Aug 1, 2026", amount: "$539.00", status: "paid" },
  { id: "INV-2026-007", date: "Jul 1, 2026", amount: "$539.00", status: "paid" },
];

const TIMEZONES = [
  { id: "Pacific/Honolulu", label: "Honolulu (GMT−10)" },
  { id: "America/Los_Angeles", label: "Los Angeles (GMT−7)" },
  { id: "America/Denver", label: "Denver (GMT−6)" },
  { id: "America/Chicago", label: "Chicago (GMT−5)" },
  { id: "America/New_York", label: "New York (GMT−4)" },
  { id: "Europe/London", label: "London (GMT+1)" },
  { id: "Europe/Lisbon", label: "Lisbon (GMT+1)" },
  { id: "Europe/Berlin", label: "Berlin (GMT+2)" },
  { id: "Asia/Kolkata", label: "Kolkata (GMT+5:30)" },
  { id: "Asia/Tokyo", label: "Tokyo (GMT+9)" },
  { id: "Australia/Sydney", label: "Sydney (GMT+11)" },
];

const SECTIONS: { id: SettingsSection; label: string; hint: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { id: "profile", label: "Profile", hint: "How you appear to your team.", icon: UserRound },
  { id: "notifications", label: "Notifications", hint: "What reaches you, and where.", icon: Bell },
  { id: "appearance", label: "Appearance", hint: "Theme and density. Applies right away.", icon: Palette },
  { id: "security", label: "Security", hint: "Password, two-factor and where you're signed in.", icon: ShieldCheck },
  { id: "billing", label: "Billing", hint: "Plan, seats and invoices.", icon: CreditCard },
];

const BIO_MAX = 160;
const USERNAME_RE = /^[a-z0-9](?:[a-z0-9-]{1,22}[a-z0-9])$/;

function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function profileErrors(p: SettingsProfile, taken: string[]) {
  const errors: Partial<Record<keyof SettingsProfile, string>> = {};
  if (!p.name.trim()) errors.name = "Add the name your team knows you by.";
  if (!USERNAME_RE.test(p.username)) errors.username = "3 to 24 lowercase letters, numbers or dashes, not starting or ending with a dash.";
  else if (taken.includes(p.username)) errors.username = `“${p.username}” is taken. Try another.`;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(p.email.trim())) errors.email = "That doesn't look like an email address.";
  if (p.bio.length > BIO_MAX) errors.bio = `Keep it under ${BIO_MAX} characters.`;
  return errors;
}

/* ----------------------------------------------------------------------------------------------------------
 * Block
 * -------------------------------------------------------------------------------------------------------- */

export function AppSettings({
  profile = SAMPLE_PROFILE,
  notifications = SAMPLE_NOTIFICATIONS,
  sessions = SAMPLE_SESSIONS,
  invoices = SAMPLE_INVOICES,
  defaultSection = "profile",
  onSave,
  onChangePassword,
  onRevokeSession,
  onToggleTwoFactor,
  onDeleteAccount,
  onThemeChange,
  takenUsernames = ["admin", "support", "halcyon"],
  theme = "auto",
  className,
}: AppSettingsProps) {
  const [appearance, setAppearance] = useState<AppBlockTheme>(theme);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const { style } = useAppBlockTheme(appearance);
  const toast = useBlockToast();

  const [section, setSection] = useState<SettingsSection>(defaultSection);
  // Saved values and the working drafts. Drafts survive switching sections, and one bar saves them all.
  const [savedProfile, setSavedProfile] = useState(profile);
  const [savedPrefs, setSavedPrefs] = useState(notifications);
  const [draftProfile, setDraftProfile] = useState(profile);
  const [draftPrefs, setDraftPrefs] = useState(notifications);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [twoFactorOpen, setTwoFactorOpen] = useState(false);
  const [twoFactor, setTwoFactor] = useState(false);
  const [sessionList, setSessionList] = useState(sessions);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusHeading = useRef(false);

  const profileDirty = !sameJson(savedProfile, draftProfile);
  const prefsDirty = !sameJson(savedPrefs, draftPrefs);
  const dirtyCount = (profileDirty ? 1 : 0) + (prefsDirty ? 1 : 0);
  const errors = useMemo(() => profileErrors(draftProfile, takenUsernames), [draftProfile, takenUsernames]);
  const modalOpen = deleteOpen || twoFactorOpen;

  useEffect(() => {
    if (!focusHeading.current) return;
    focusHeading.current = false;
    headingRef.current?.focus({ preventScroll: true });
  }, [section]);

  const goTo = (next: SettingsSection) => {
    if (next === section) return;
    focusHeading.current = true;
    setSection(next);
  };

  const save = async () => {
    if (saving || dirtyCount === 0) return;
    if (profileDirty && Object.keys(errors).length > 0) {
      setShowErrors(true);
      if (section !== "profile") goTo("profile");
      toast.show("Fix the highlighted profile fields first.", "error");
      return;
    }
    setSaving(true);
    try {
      await onSave?.({
        profile: profileDirty ? draftProfile : undefined,
        notifications: prefsDirty ? draftPrefs : undefined,
      });
      if (!onSave) await new Promise((r) => setTimeout(r, 700));
      setSavedProfile(draftProfile);
      setSavedPrefs(draftPrefs);
      setShowErrors(false);
      toast.show("Settings saved", "success");
    } catch (error) {
      toast.show(error instanceof Error ? error.message : "Couldn't save. Try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setDraftProfile(savedProfile);
    setDraftPrefs(savedPrefs);
    setShowErrors(false);
    toast.show("Changes discarded");
  };

  const onRootKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s" && !modalOpen) {
      event.preventDefault();
      void save();
    }
  };

  const meta = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  return (
    <div
      className={cn(blockRoot, "h-full flex-col", density === "compact" && "[--set-gap:14px]", className)}
      style={style}
      onKeyDown={onRootKeyDown}
    >
      <div className="flex min-h-0 flex-1 flex-col" inert={modalOpen}>
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[color:var(--bjork-border)] px-4 @3xl:px-6">
          <h1 className="font-bjork-display text-[20px] font-bold italic leading-none tracking-[-0.02em]">Settings</h1>
          <span aria-hidden="true" className="text-[color:var(--bjork-text-faint)]">/</span>
          <span className="truncate text-[13px] text-[color:var(--bjork-text-muted)]">{meta.label}</span>
          <span className="ml-auto hidden items-center gap-1.5 text-[11.5px] text-[color:var(--bjork-text-soft)] @2xl:flex">
            <Kbd>⌘</Kbd>
            <Kbd>S</Kbd>
            <span>to save</span>
          </span>
        </header>

        <div className="flex min-h-0 flex-1 flex-col @3xl:flex-row">
          <SectionNav value={section} onChange={goTo} dirty={{ profile: profileDirty, notifications: prefsDirty }} />

          <main className="@container/main relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div
              className={cn(
                "mx-auto flex w-full max-w-[760px] flex-col px-4 pt-6 @3xl:px-8 @3xl:pt-8",
                density === "compact" ? "gap-4" : "gap-6",
                dirtyCount > 0 ? "pb-28" : "pb-12",
              )}
            >
              <div>
                <h2
                  ref={headingRef}
                  tabIndex={-1}
                  className="text-[20px] font-semibold tracking-[-0.02em] outline-none @3xl/main:text-[22px]"
                >
                  {meta.label}
                </h2>
                <p className="mt-1 text-[13px] text-[color:var(--bjork-text-muted)]">{meta.hint}</p>
              </div>

              {section === "profile" && (
                <ProfileSection
                  draft={draftProfile}
                  saved={savedProfile}
                  errors={showErrors ? errors : {}}
                  liveErrors={errors}
                  onChange={setDraftProfile}
                  onDelete={() => setDeleteOpen(true)}
                />
              )}
              {section === "notifications" && <NotificationsSection draft={draftPrefs} onChange={setDraftPrefs} />}
              {section === "appearance" && (
                <AppearanceSection
                  theme={appearance}
                  density={density}
                  onTheme={(next) => {
                    setAppearance(next);
                    onThemeChange?.(next);
                    toast.show(`Theme set to ${next === "auto" ? "system" : next}`);
                  }}
                  onDensity={setDensity}
                />
              )}
              {section === "security" && (
                <SecuritySection
                  twoFactor={twoFactor}
                  sessions={sessionList}
                  onChangePassword={async (current, next) => {
                    if (onChangePassword) await onChangePassword(current, next);
                    else {
                      await new Promise((r) => setTimeout(r, 800));
                      if (current === "wrong") throw new Error("That isn't your current password.");
                    }
                    toast.show("Password updated. Other sessions stay signed in.", "success");
                  }}
                  onTwoFactor={(next) => {
                    if (next) setTwoFactorOpen(true);
                    else {
                      setTwoFactor(false);
                      onToggleTwoFactor?.(false);
                      toast.show("Two-factor authentication turned off");
                    }
                  }}
                  onRevoke={(id) => {
                    const target = sessionList.find((s) => s.id === id);
                    setSessionList((list) => list.filter((s) => s.id !== id));
                    onRevokeSession?.(id);
                    toast.show(`Signed out ${target?.device ?? "session"}`);
                  }}
                  onRevokeOthers={() => {
                    const others = sessionList.filter((s) => !s.current);
                    others.forEach((s) => onRevokeSession?.(s.id));
                    setSessionList((list) => list.filter((s) => s.current));
                    toast.show(`Signed out ${others.length} other ${others.length === 1 ? "session" : "sessions"}`);
                  }}
                />
              )}
              {section === "billing" && <BillingSection invoices={invoices} onNotify={(m) => toast.show(m)} />}
            </div>
          </main>
        </div>

        <SaveBar count={dirtyCount} saving={saving} onSave={save} onDiscard={discard} />
      </div>

      <DeleteAccountDialog
        open={deleteOpen}
        username={savedProfile.username}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleteOpen(false);
          onDeleteAccount?.();
          toast.show("Account scheduled for deletion in 14 days", "error");
        }}
      />
      <TwoFactorDialog
        open={twoFactorOpen}
        email={savedProfile.email}
        onClose={() => setTwoFactorOpen(false)}
        onVerified={() => {
          setTwoFactorOpen(false);
          setTwoFactor(true);
          onToggleTwoFactor?.(true);
          toast.show("Two-factor authentication is on", "success");
        }}
      />
      {toast.node}
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------------------
 * Section nav: a vertical list beside the content, a horizontal scroller above it on narrow containers.
 * -------------------------------------------------------------------------------------------------------- */

function SectionNav({
  value,
  onChange,
  dirty,
}: {
  value: SettingsSection;
  onChange: (section: SettingsSection) => void;
  dirty: Partial<Record<SettingsSection, boolean>>;
}) {
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const onKeyDown = (event: ReactKeyboardEvent, index: number) => {
    let next = -1;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") next = (index + 1) % SECTIONS.length;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = (index - 1 + SECTIONS.length) % SECTIONS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = SECTIONS.length - 1;
    if (next < 0) return;
    event.preventDefault();
    refs.current[next]?.focus();
  };
  return (
    <nav
      aria-label="Settings sections"
      className="hide-scrollbar shrink-0 overflow-x-auto border-b border-[color:var(--bjork-border)] @3xl:w-[220px] @3xl:overflow-visible @3xl:border-b-0 @3xl:border-r @3xl:bg-[var(--bjork-panel)]"
    >
      <ul className="flex gap-1 px-3 py-2 @3xl:flex-col @3xl:gap-0.5 @3xl:px-3 @3xl:py-4">
        {SECTIONS.map((s, i) => {
          const active = s.id === value;
          const Icon = s.icon;
          return (
            <li key={s.id} className="shrink-0">
              <a
                ref={(el) => {
                  refs.current[i] = el;
                }}
                href={`#${s.id}`}
                aria-current={active ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  onChange(s.id);
                }}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={cn(
                  "relative flex h-9 items-center gap-2.5 whitespace-nowrap rounded-[9px] px-3 text-[13.5px] transition-colors duration-150",
                  active
                    ? "bg-[var(--bjork-surface)] font-medium text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-soft),0_0_0_1px_var(--bjork-border)]"
                    : "text-[color:var(--bjork-text-medium)] hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)]",
                  focusRing,
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={cn("size-4 shrink-0", active ? "text-[color:var(--blk-accent-ink)]" : "text-[color:var(--bjork-text-muted)]")}
                />
                {s.label}
                {dirty[s.id] && (
                  <>
                    <span aria-hidden="true" className="ml-auto size-1.5 rounded-full bg-[var(--bjork-accent)] @max-3xl:ml-0" />
                    <span className="sr-only">(unsaved changes)</span>
                  </>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ----------------------------------------------------------------------------------------------------------
 * Shared section pieces
 * -------------------------------------------------------------------------------------------------------- */

function Card({
  title,
  description,
  children,
  footer,
  tone = "neutral",
  id,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  tone?: "neutral" | "danger";
  id?: string;
}) {
  const headingId = useId();
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        "overflow-hidden rounded-[16px] border bg-[var(--bjork-surface)] shadow-[var(--bjork-shadow-surface)]",
        tone === "danger" ? "border-[color:color-mix(in_oklab,var(--blk-error)_35%,var(--bjork-border))]" : "border-[color:var(--bjork-border)]",
      )}
    >
      <div className="px-4 pb-4 pt-4 @2xl/main:px-5 @2xl/main:pt-5">
        <h3 id={headingId} className={cn("text-[14.5px] font-semibold tracking-[-0.01em]", tone === "danger" && "text-[color:var(--blk-error)]")}>
          {title}
        </h3>
        {description && <p className="mt-1 text-[12.5px] leading-[1.5] text-[color:var(--bjork-text-muted)]">{description}</p>}
        <div className="mt-4">{children}</div>
      </div>
      {footer && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--bjork-border)] bg-[var(--bjork-panel)] px-4 py-3 text-[12.5px] text-[color:var(--bjork-text-muted)] @2xl/main:px-5">
          {footer}
        </div>
      )}
    </section>
  );
}

function SaveBar({
  count,
  saving,
  onSave,
  onDiscard,
}: {
  count: number;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const visible = count > 0 || saving;
  return (
    <div
      role="region"
      aria-label="Unsaved changes"
      aria-hidden={!visible}
      inert={!visible}
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-3 transition-[opacity,transform] duration-[260ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-opacity @3xl:pl-[232px]",
        visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
      )}
    >
      <div className="pointer-events-auto flex w-full max-w-[600px] items-center gap-3 rounded-[14px] border border-[color:var(--bjork-border-strong)] bg-[var(--bjork-menu)] py-2 pl-4 pr-2 shadow-[var(--bjork-shadow-menu)] backdrop-blur-xl">
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[var(--bjork-accent)]" />
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium" aria-live="polite">
          {saving ? "Saving…" : count > 1 ? "Unsaved changes in 2 sections" : "You have unsaved changes"}
        </p>
        <BlockButton variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
          Discard
        </BlockButton>
        <BlockButton variant="primary" size="sm" onClick={onSave} disabled={saving} className="min-w-[72px]">
          {saving ? <BlockSpinner /> : "Save"}
        </BlockButton>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------------------
 * Profile
 * -------------------------------------------------------------------------------------------------------- */

function ProfileSection({
  draft,
  saved,
  errors,
  liveErrors,
  onChange,
  onDelete,
}: {
  draft: SettingsProfile;
  saved: SettingsProfile;
  errors: Partial<Record<keyof SettingsProfile, string>>;
  liveErrors: Partial<Record<keyof SettingsProfile, string>>;
  onChange: (next: SettingsProfile) => void;
  onDelete: () => void;
}) {
  // A field shows its error once it has been left, or after a failed save.
  const [touched, setTouched] = useState<Partial<Record<keyof SettingsProfile, boolean>>>({});
  const [avatar, setAvatar] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bioId = useId();
  const tzId = useId();
  const set = <K extends keyof SettingsProfile>(key: K, value: SettingsProfile[K]) => onChange({ ...draft, [key]: value });
  const errorFor = (key: keyof SettingsProfile) => errors[key] ?? (touched[key] ? liveErrors[key] : undefined) ?? null;
  const blur = (key: keyof SettingsProfile) => () => setTouched((t) => ({ ...t, [key]: true }));

  useEffect(() => {
    return () => {
      if (avatar) URL.revokeObjectURL(avatar);
    };
  }, [avatar]);

  const emailChanged = draft.email.trim() !== saved.email;
  const bioLeft = BIO_MAX - draft.bio.length;

  return (
    <>
      <Card title="Public profile" description="Shown on your comments, docs and in the member directory.">
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-4">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element -- a local object URL preview
              <img src={avatar} alt="" className="size-16 shrink-0 rounded-full object-cover ring-1 ring-[color:var(--bjork-border)]" />
            ) : (
              <InitialsAvatar name={draft.name || "?"} size={64} />
            )}
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <BlockButton size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
                  <Upload aria-hidden="true" />
                  Upload photo
                </BlockButton>
                {avatar && (
                  <BlockButton size="sm" variant="ghost" onClick={() => setAvatar(null)}>
                    Remove
                  </BlockButton>
                )}
              </div>
              <p className="text-[12px] text-[color:var(--bjork-text-soft)]">PNG or JPG, square works best.</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setAvatar(URL.createObjectURL(file));
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2">
            <BlockField
              label="Full name"
              value={draft.name}
              autoComplete="name"
              onChange={(e) => set("name", e.target.value)}
              onBlur={blur("name")}
              error={errorFor("name")}
            />
            <div className="flex min-w-0 flex-col gap-1.5">
              <UsernameField
                value={draft.username}
                onChange={(v) => set("username", v.toLowerCase())}
                onBlur={blur("username")}
                error={errorFor("username")}
              />
            </div>
          </div>

          <BlockField
            label="Email"
            type="email"
            autoComplete="email"
            value={draft.email}
            onChange={(e) => set("email", e.target.value)}
            onBlur={blur("email")}
            error={errorFor("email")}
            labelAside={
              !emailChanged ? (
                <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[color:var(--blk-success)]">
                  <Check aria-hidden="true" className="size-3" />
                  Verified
                </span>
              ) : undefined
            }
            hint={emailChanged ? `We'll send a confirmation link to the new address. ${saved.email} stays active until you click it.` : undefined}
          />

          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <label htmlFor={bioId} className="text-[12.5px] font-medium text-[color:var(--bjork-text-medium)]">
                Bio
              </label>
              <span
                className={cn(
                  "font-mono text-[11px] tabular-nums",
                  bioLeft < 0 ? "text-[color:var(--blk-error)]" : bioLeft < 20 ? "text-[color:var(--blk-warning)]" : "text-[color:var(--bjork-text-soft)]",
                )}
                aria-hidden="true"
              >
                {bioLeft}
              </span>
            </div>
            <textarea
              id={bioId}
              rows={3}
              value={draft.bio}
              onChange={(e) => set("bio", e.target.value)}
              onBlur={blur("bio")}
              aria-invalid={errorFor("bio") ? true : undefined}
              aria-describedby={`${bioId}-note`}
              className={cn(inputClass, "h-auto resize-none py-2.5 leading-[1.5]")}
            />
            <p id={`${bioId}-note`} className={cn("text-[12px]", errorFor("bio") ? "text-[color:var(--blk-error)]" : "text-[color:var(--bjork-text-soft)]")}>
              {errorFor("bio") ?? `${Math.max(0, bioLeft)} characters left. Links aren't clickable here.`}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={tzId} className="text-[12.5px] font-medium text-[color:var(--bjork-text-medium)]">
              Time zone
            </label>
            <select
              id={tzId}
              value={draft.timezone}
              onChange={(e) => set("timezone", e.target.value)}
              className={cn(inputClass, "cursor-pointer appearance-none bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-9")}
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='none' stroke='%23888' stroke-width='1.5' stroke-linecap='round'%3E%3Cpath d='m3 4.5 3 3 3-3'/%3E%3C/svg%3E\")",
              }}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.id} value={tz.id}>
                  {tz.label}
                </option>
              ))}
            </select>
            <p className="text-[12px] text-[color:var(--bjork-text-soft)]">Used for due dates, digests and quiet hours.</p>
          </div>
        </div>
      </Card>

      <Card
        tone="danger"
        title="Delete account"
        description="Removes your profile, your private docs and your access to every workspace. Shared docs stay with their workspace."
      >
        <BlockButton variant="danger" size="sm" onClick={onDelete}>
          <Trash2 aria-hidden="true" />
          Delete account…
        </BlockButton>
      </Card>
    </>
  );
}

function UsernameField({
  value,
  onChange,
  onBlur,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  error: string | null;
}) {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className="text-[12.5px] font-medium text-[color:var(--bjork-text-medium)]">
        Username
      </label>
      <div
        className={cn(
          "flex h-10 min-w-0 items-center overflow-hidden rounded-[10px] border bg-[var(--bjork-field)] shadow-[var(--bjork-shadow-soft)] transition-[border-color,box-shadow] duration-150 focus-within:ring-[3px]",
          error
            ? "border-[color:var(--blk-error)] focus-within:ring-[color:var(--blk-error-soft)]"
            : "border-[color:var(--bjork-border)] hover:border-[color:var(--bjork-border-strong)] focus-within:border-[color:var(--bjork-accent)] focus-within:ring-[color:var(--bjork-accent-soft)]",
        )}
      >
        <span aria-hidden="true" className="flex h-full shrink-0 items-center border-r border-[color:var(--bjork-border)] bg-[var(--bjork-field-inset)] px-2.5 font-mono text-[12px] text-[color:var(--bjork-text-soft)]">
          halcyon.app/
        </span>
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          autoComplete="username"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-note`}
          className="h-full min-w-0 flex-1 bg-transparent px-2.5 font-mono text-[13px] text-[color:var(--bjork-text)] outline-none"
        />
      </div>
      <p
        id={`${id}-note`}
        role={error ? "alert" : undefined}
        className={cn("text-[12px] leading-[1.45]", error ? "text-[color:var(--blk-error)]" : "text-[color:var(--bjork-text-soft)]")}
      >
        {error ?? "Your profile link. Changing it redirects the old one for 30 days."}
      </p>
    </>
  );
}

/* ----------------------------------------------------------------------------------------------------------
 * Notifications
 * -------------------------------------------------------------------------------------------------------- */

const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);

function NotificationsSection({ draft, onChange }: { draft: NotificationPrefs; onChange: (next: NotificationPrefs) => void }) {
  const fromId = useId();
  const toId = useId();
  const quietLabelId = useId();
  const setChannel = (event: string, channel: NotificationChannel, on: boolean) =>
    onChange({ ...draft, events: { ...draft.events, [event]: { ...draft.events[event], [channel]: on } } });
  const allOn = (channel: NotificationChannel) =>
    NOTIFICATION_EVENTS.every((e) => e.locked?.includes(channel) || draft.events[e.id]?.[channel]);
  const setAll = (channel: NotificationChannel, on: boolean) => {
    const events = { ...draft.events };
    for (const e of NOTIFICATION_EVENTS) {
      if (e.locked?.includes(channel)) continue;
      events[e.id] = { ...events[e.id], [channel]: on };
    }
    onChange({ ...draft, events });
  };

  return (
    <>
      <Card title="Events" description="Pick a channel per event. Security alerts always go to email.">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Notification channels per event</caption>
          <thead>
            <tr className="text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--bjork-text-soft)]">
              <th scope="col" className="pb-2 font-mono font-normal">Event</th>
              {(["email", "push"] as const).map((ch) => (
                <th key={ch} scope="col" className="w-[64px] pb-2 text-center font-mono font-normal @xl/main:w-[88px]">
                  <button
                    type="button"
                    onClick={() => setAll(ch, !allOn(ch))}
                    className={cn("rounded-[6px] px-1.5 py-0.5 uppercase hover:text-[color:var(--bjork-text)]", focusRing)}
                    aria-label={`${allOn(ch) ? "Turn off" : "Turn on"} all ${ch === "email" ? "email" : "push"} notifications`}
                  >
                    {ch === "email" ? "Email" : "Push"}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_EVENTS.map((e) => (
              <tr key={e.id} className="border-t border-[color:var(--bjork-border-muted)]">
                <th scope="row" className="py-3 pr-3 text-left font-normal">
                  <span className="block text-[13.5px] font-medium">{e.label}</span>
                  <span className="mt-0.5 block text-[12px] leading-[1.45] text-[color:var(--bjork-text-muted)]">{e.hint}</span>
                </th>
                {(["email", "push"] as const).map((ch) => {
                  const locked = e.locked?.includes(ch);
                  return (
                    <td key={ch} className="py-3 text-center">
                      <BlockSwitch
                        checked={locked ? true : Boolean(draft.events[e.id]?.[ch])}
                        disabled={locked}
                        onCheckedChange={(on) => setChannel(e.id, ch, on)}
                        label={`${e.label} by ${ch === "email" ? "email" : "push"}${locked ? ", always on" : ""}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Delivery" description="How often batched email arrives.">
        <ChoiceGroup
          label="Email delivery"
          value={draft.digest}
          onChange={(digest) => onChange({ ...draft, digest })}
          options={[
            { id: "instant", label: "As it happens", hint: "One email per event." },
            { id: "hourly", label: "Hourly bundle", hint: "At most one email an hour." },
            { id: "daily", label: "Daily digest", hint: "Every morning at 8:00." },
          ]}
        />
      </Card>

      <Card title="Quiet hours" description="Push notifications wait until quiet hours end. Security alerts still come through.">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <span id={quietLabelId} className="text-[13.5px] font-medium">
              Pause push notifications overnight
            </span>
            <BlockSwitch
              aria-labelledby={quietLabelId}
              checked={draft.quietHours.enabled}
              onCheckedChange={(enabled) => onChange({ ...draft, quietHours: { ...draft.quietHours, enabled } })}
            />
          </div>
          <div className={cn("flex flex-wrap items-end gap-3 transition-opacity duration-150", !draft.quietHours.enabled && "opacity-45")}>
            {[
              { id: fromId, key: "from" as const, label: "From" },
              { id: toId, key: "to" as const, label: "Until" },
            ].map((f) => (
              <div key={f.key} className="flex flex-col gap-1.5">
                <label htmlFor={f.id} className="text-[12.5px] font-medium text-[color:var(--bjork-text-medium)]">
                  {f.label}
                </label>
                <select
                  id={f.id}
                  disabled={!draft.quietHours.enabled}
                  value={draft.quietHours[f.key]}
                  onChange={(e) => onChange({ ...draft, quietHours: { ...draft.quietHours, [f.key]: e.target.value } })}
                  className={cn(inputClass, "w-[120px] cursor-pointer font-mono tabular-nums")}
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <p className="pb-2.5 text-[12px] text-[color:var(--bjork-text-soft)]">In your time zone.</p>
          </div>
        </div>
      </Card>
    </>
  );
}

/** Radio cards with roving focus. */
function ChoiceGroup<T extends string>({
  label,
  value,
  onChange,
  options,
  columns = 3,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { id: T; label: string; hint?: string; visual?: ReactNode }[];
  columns?: 2 | 3;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, options.findIndex((o) => o.id === value));
  const onKeyDown = (event: ReactKeyboardEvent) => {
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % options.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + options.length) % options.length;
    else return;
    event.preventDefault();
    onChange(options[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("grid grid-cols-1 gap-2.5", columns === 3 ? "@xl/main:grid-cols-3" : "@md/main:grid-cols-2")}
    >
      {options.map((o, i) => {
        const checked = o.id === value;
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(o.id)}
            className={cn(
              "group relative flex cursor-pointer flex-col items-start gap-1 rounded-[12px] border p-3 text-left transition-[border-color,background-color,box-shadow] duration-150",
              checked
                ? "border-[color:var(--bjork-accent)] bg-[var(--bjork-accent-soft)] shadow-[0_0_0_1px_var(--bjork-accent)]"
                : "border-[color:var(--bjork-border)] bg-[var(--bjork-field)] hover:border-[color:var(--bjork-border-strong)]",
              focusRing,
            )}
          >
            {o.visual}
            <span className="flex w-full items-center justify-between gap-2">
              <span className="text-[13px] font-medium">{o.label}</span>
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-4 place-items-center rounded-full border transition-colors duration-150",
                  checked ? "border-[color:var(--blk-accent-fill)] bg-[var(--blk-accent-fill)]" : "border-[color:var(--bjork-border-strong)]",
                )}
              >
                {checked && <span className="size-1.5 rounded-full bg-[var(--blk-accent-fill-ink)]" />}
              </span>
            </span>
            {o.hint && <span className="text-[12px] leading-[1.4] text-[color:var(--bjork-text-muted)]">{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------------------
 * Appearance
 * -------------------------------------------------------------------------------------------------------- */

function ThemeSwatch({ tone }: { tone: "light" | "dark" | "split" }) {
  const light = { bg: "#f7f3ea", panel: "#fffcf6", line: "#e1d7c8", ink: "#171717" };
  const dark = { bg: "#111111", panel: "#1a1a1a", line: "#343434", ink: "#ededed" };
  const pane = (c: typeof light, x: number, w: number) => (
    <g>
      <rect x={x} y="0" width={w} height="60" fill={c.bg} />
      <rect x={x + 8} y="8" width={Math.min(26, w - 12)} height="44" rx="4" fill={c.panel} stroke={c.line} />
      <rect x={x + 40} y="10" width={Math.max(0, w - 50)} height="5" rx="2.5" fill={c.ink} opacity="0.75" />
      <rect x={x + 40} y="20" width={Math.max(0, w - 62)} height="4" rx="2" fill={c.ink} opacity="0.25" />
      <rect x={x + 40} y="30" width={Math.max(0, w - 56)} height="16" rx="3" fill={c.panel} stroke={c.line} />
      <rect x={x + 44} y="36" width="12" height="4" rx="2" fill="#ec5c13" />
    </g>
  );
  return (
    <svg viewBox="0 0 120 60" aria-hidden="true" className="mb-1.5 w-full overflow-hidden rounded-[8px] ring-1 ring-[color:var(--bjork-border)]">
      {tone === "light" && pane(light, 0, 120)}
      {tone === "dark" && pane(dark, 0, 120)}
      {tone === "split" && (
        <>
          <clipPath id="settings-split-l">
            <rect x="0" y="0" width="60" height="60" />
          </clipPath>
          <clipPath id="settings-split-r">
            <rect x="60" y="0" width="60" height="60" />
          </clipPath>
          <g clipPath="url(#settings-split-l)">{pane(light, 0, 120)}</g>
          <g clipPath="url(#settings-split-r)">{pane(dark, 0, 120)}</g>
        </>
      )}
    </svg>
  );
}

function AppearanceSection({
  theme,
  density,
  onTheme,
  onDensity,
}: {
  theme: AppBlockTheme;
  density: "comfortable" | "compact";
  onTheme: (theme: AppBlockTheme) => void;
  onDensity: (density: "comfortable" | "compact") => void;
}) {
  return (
    <>
      <Card title="Theme" description="System follows your device and switches at sunset if it does.">
        <ChoiceGroup<AppBlockTheme>
          label="Theme"
          value={theme}
          onChange={onTheme}
          options={[
            { id: "auto", label: "System", visual: <ThemeSwatch tone="split" />, hint: "Match the device" },
            { id: "light", label: "Light", visual: <ThemeSwatch tone="light" />, hint: "Warm paper" },
            { id: "dark", label: "Dark", visual: <ThemeSwatch tone="dark" />, hint: "Low light" },
          ]}
        />
        <div className="mt-3 flex items-center gap-2 text-[12px] text-[color:var(--bjork-text-soft)]">
          <Monitor aria-hidden="true" className="size-3.5" />
          <Sun aria-hidden="true" className="size-3.5" />
          <Moon aria-hidden="true" className="size-3.5" />
          <span>This preview re-themes as you choose.</span>
        </div>
      </Card>
      <Card title="Density" description="Compact tightens spacing in lists and settings.">
        <ChoiceGroup
          label="Density"
          value={density}
          onChange={onDensity}
          columns={2}
          options={[
            { id: "comfortable", label: "Comfortable", hint: "More room to breathe." },
            { id: "compact", label: "Compact", hint: "More rows on screen." },
          ]}
        />
      </Card>
    </>
  );
}

/* ----------------------------------------------------------------------------------------------------------
 * Security
 * -------------------------------------------------------------------------------------------------------- */

function passwordScore(pw: string) {
  const checks = [pw.length >= 12, /[a-z]/.test(pw) && /[A-Z]/.test(pw), /\d/.test(pw), /[^A-Za-z0-9]/.test(pw)];
  return checks.filter(Boolean).length;
}

function SecuritySection({
  twoFactor,
  sessions,
  onChangePassword,
  onTwoFactor,
  onRevoke,
  onRevokeOthers,
}: {
  twoFactor: boolean;
  sessions: SettingsSession[];
  onChangePassword: (current: string, next: string) => Promise<void>;
  onTwoFactor: (next: boolean) => void;
  onRevoke: (id: string) => void;
  onRevokeOthers: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const twoFaLabel = useId();

  const score = passwordScore(next);
  const errs = {
    current: !current ? "Enter your current password." : serverError,
    next: next.length < 12 ? "Use at least 12 characters." : next === current ? "Pick something different from your current password." : null,
    confirm: confirm !== next ? "The passwords don't match." : null,
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    setServerError(null);
    const first = (["current", "next", "confirm"] as const).find((k) => (k === "current" ? !current : errs[k]));
    if (first) {
      ({ current: currentRef, next: nextRef, confirm: confirmRef })[first].current?.focus();
      return;
    }
    setBusy(true);
    try {
      await onChangePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setSubmitted(false);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Couldn't update the password.");
      currentRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const meterLabel = ["Too weak", "Weak", "Fair", "Good", "Strong"][score];
  const others = sessions.filter((s) => !s.current).length;

  return (
    <>
      <Card title="Password" description="Changing it keeps you signed in here. Try “wrong” as the current password to see the error.">
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <input type="text" name="username" autoComplete="username" className="hidden" defaultValue="" aria-hidden="true" tabIndex={-1} />
          <BlockField
            ref={currentRef}
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
              setServerError(null);
            }}
            error={submitted || serverError ? errs.current : null}
          />
          <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2">
            <div className="flex flex-col gap-2">
              <BlockField
                ref={nextRef}
                label="New password"
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                error={submitted ? errs.next : null}
              />
              <div className="flex items-center gap-2" aria-hidden={next ? undefined : true}>
                <div className="grid flex-1 grid-cols-4 gap-1">
                  {[1, 2, 3, 4].map((n) => (
                    <span
                      key={n}
                      className="h-1 rounded-full transition-colors duration-200"
                      style={{
                        background:
                          next && score >= n
                            ? score <= 1
                              ? "var(--blk-error)"
                              : score === 2
                                ? "var(--blk-warning)"
                                : "var(--blk-success)"
                            : "var(--bjork-surface-active)",
                      }}
                    />
                  ))}
                </div>
                <span className="w-[64px] text-right text-[11.5px] text-[color:var(--bjork-text-muted)]" aria-live="polite">
                  {next ? meterLabel : ""}
                </span>
              </div>
            </div>
            <BlockField
              ref={confirmRef}
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              error={submitted ? errs.confirm : null}
            />
          </div>
          <div className="flex items-center justify-end gap-3">
            <BlockButton type="submit" variant="primary" size="sm" disabled={busy} className="min-w-[132px]">
              {busy ? <BlockSpinner /> : (
                <>
                  <KeyRound aria-hidden="true" />
                  Update password
                </>
              )}
            </BlockButton>
          </div>
        </form>
      </Card>

      <Card
        title="Two-factor authentication"
        description="Ask for a code from an authenticator app when you sign in on a new device."
        footer={
          <>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full"
                style={{ background: twoFactor ? "var(--blk-success)" : "var(--blk-warning)" }}
              />
              {twoFactor ? "On, using an authenticator app" : "Off. Your account is protected by password only."}
            </span>
          </>
        }
      >
        <div className="flex items-center justify-between gap-4">
          <span id={twoFaLabel} className="text-[13.5px] font-medium">
            Require a code at sign-in
          </span>
          <BlockSwitch aria-labelledby={twoFaLabel} checked={twoFactor} onCheckedChange={onTwoFactor} />
        </div>
      </Card>

      <Card
        title="Where you're signed in"
        description="Sign out anything you don't recognise, then change your password."
        footer={
          <>
            <span>
              {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
            </span>
            <BlockButton size="sm" variant="outline" onClick={onRevokeOthers} disabled={others === 0}>
              Sign out other sessions
            </BlockButton>
          </>
        }
      >
        <ul className="-my-1 flex flex-col">
          {sessions.map((s) => {
            const Icon = s.kind === "mobile" ? Smartphone : Laptop;
            return (
              <li key={s.id} className="flex items-center gap-3 border-t border-[color:var(--bjork-border-muted)] py-3 first:border-t-0">
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-[color:var(--bjork-border)] bg-[var(--bjork-field-inset)]">
                  <Icon aria-hidden="true" className="size-[17px] text-[color:var(--bjork-text-muted)]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[13.5px] font-medium">
                    <span className="truncate">{s.device}</span>
                    {s.current && (
                      <span className="shrink-0 rounded-[6px] bg-[var(--blk-success-soft)] px-1.5 py-px text-[10.5px] font-medium text-[color:var(--blk-success)]">
                        This device
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[12px] text-[color:var(--bjork-text-muted)]">
                    {s.location} · {s.lastActive}
                  </p>
                </div>
                {!s.current && (
                  <BlockButton size="sm" variant="ghost" onClick={() => onRevoke(s.id)} aria-label={`Sign out ${s.device} in ${s.location}`}>
                    Sign out
                  </BlockButton>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}

/* ----------------------------------------------------------------------------------------------------------
 * Billing
 * -------------------------------------------------------------------------------------------------------- */

function BillingSection({ invoices, onNotify }: { invoices: SettingsInvoice[]; onNotify: (message: string) => void }) {
  const seats = { used: 12, total: 15 };
  return (
    <>
      <Card
        title="Plan"
        footer={
          <>
            <span>Renews on Nov 1, 2026</span>
            <div className="flex gap-2">
              <BlockButton size="sm" variant="ghost" onClick={() => onNotify("Opening plan comparison")}>
                Compare plans
              </BlockButton>
              <BlockButton size="sm" variant="secondary" onClick={() => onNotify("Seat request sent to billing admin")}>
                Add seats
              </BlockButton>
            </div>
          </>
        }
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[color:var(--blk-accent-ink)]">Scale</p>
            <p className="mt-1 flex items-baseline gap-1">
              <span className="font-bjork-display text-[32px] font-bold italic leading-none tracking-[-0.03em] tabular-nums">$49</span>
              <span className="text-[13px] text-[color:var(--bjork-text-muted)]">per seat / month, billed monthly</span>
            </p>
          </div>
          <div className="w-full max-w-[240px]">
            <div className="flex items-baseline justify-between text-[12px]">
              <span className="font-medium">Seats</span>
              <span className="font-mono tabular-nums text-[color:var(--bjork-text-muted)]">
                {seats.used} / {seats.total}
              </span>
            </div>
            <div
              role="meter"
              aria-label="Seats used"
              aria-valuemin={0}
              aria-valuemax={seats.total}
              aria-valuenow={seats.used}
              aria-valuetext={`${seats.used} of ${seats.total} seats used`}
              className="mt-2 grid h-2 gap-[3px]"
              style={{ gridTemplateColumns: `repeat(${seats.total}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: seats.total }, (_, i) => (
                <span
                  key={i}
                  className="rounded-[2px]"
                  style={{ background: i < seats.used ? "var(--bjork-accent)" : "var(--bjork-surface-active)" }}
                />
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="Payment method"
        footer={
          <>
            <span>Receipts go to billing@halcyon.app</span>
            <BlockButton size="sm" variant="secondary" onClick={() => onNotify("Opening secure card form")}>
              Update card
            </BlockButton>
          </>
        }
      >
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="grid h-9 w-[54px] place-items-center rounded-[7px] bg-[#1a1f71] text-[11px] font-bold italic tracking-[0.02em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
            VISA
          </span>
          <div>
            <p className="font-mono text-[13.5px] tabular-nums">
              <span className="sr-only">Visa ending in </span>
              <span aria-hidden="true">•••• </span>4242
            </p>
            <p className="text-[12px] text-[color:var(--bjork-text-muted)]">Expires 08/28</p>
          </div>
        </div>
      </Card>

      <Card title="Invoices">
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left text-[13px]">
            <caption className="sr-only">Invoices</caption>
            <thead>
              <tr className="font-mono text-[11px] uppercase tracking-[0.08em] text-[color:var(--bjork-text-soft)]">
                <th scope="col" className="px-1 pb-2 font-normal">Invoice</th>
                <th scope="col" className="px-1 pb-2 font-normal">Date</th>
                <th scope="col" className="px-1 pb-2 font-normal">Status</th>
                <th scope="col" className="px-1 pb-2 text-right font-normal">Amount</th>
                <th scope="col" className="w-10 px-1 pb-2 font-normal">
                  <span className="sr-only">Download</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-[color:var(--bjork-border-muted)]">
                  <td className="px-1 py-2.5 font-mono text-[12.5px] text-[color:var(--bjork-text-medium)]">{inv.id}</td>
                  <td className="whitespace-nowrap px-1 py-2.5">{inv.date}</td>
                  <td className="px-1 py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium",
                        inv.status === "paid"
                          ? "bg-[var(--blk-success-soft)] text-[color:var(--blk-success)]"
                          : "bg-[var(--blk-warning-soft)] text-[color:var(--blk-warning)]",
                      )}
                    >
                      {inv.status === "paid" ? "Paid" : "Due Oct 15"}
                    </span>
                  </td>
                  <td className="px-1 py-2.5 text-right font-mono tabular-nums">{inv.amount}</td>
                  <td className="px-1 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => onNotify(`Downloading ${inv.id}.pdf`)}
                      aria-label={`Download ${inv.id} as PDF`}
                      title="Download PDF"
                      className={cn(
                        "inline-grid size-7 place-items-center rounded-[8px] text-[color:var(--bjork-text-muted)] transition-colors hover:bg-[var(--bjork-surface-hover)] hover:text-[color:var(--bjork-text)]",
                        focusRing,
                      )}
                    >
                      <Download aria-hidden="true" className="size-[15px]" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

/* ----------------------------------------------------------------------------------------------------------
 * Dialogs
 * -------------------------------------------------------------------------------------------------------- */

function DeleteAccountDialog({
  open,
  username,
  onClose,
  onConfirm,
}: {
  open: boolean;
  username: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === username;
  const close = () => {
    setTyped("");
    onClose();
  };
  return (
    <BlockDialog
      open={open}
      onClose={close}
      tone="danger"
      title="Delete your account?"
      description={
        <>
          Your account is deactivated now and erased after 14 days. Sign in before then to cancel. To confirm, type{" "}
          <strong className="font-mono font-medium text-[color:var(--bjork-text)]">{username}</strong> below.
        </>
      }
      footer={
        <>
          <BlockButton size="sm" variant="ghost" onClick={close}>
            Cancel
          </BlockButton>
          <BlockButton
            size="sm"
            variant="danger"
            disabled={!matches}
            onClick={() => {
              setTyped("");
              onConfirm();
            }}
          >
            Delete account
          </BlockButton>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!matches) return;
          setTyped("");
          onConfirm();
        }}
      >
        <BlockField
          data-autofocus
          label="Username"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          inputClassName="font-mono"
          placeholder={username}
        />
      </form>
    </BlockDialog>
  );
}

/** A deterministic, QR-like pattern; the real block swaps in the provider's otpauth QR. */
function FauxQr({ seed }: { seed: string }) {
  const cells = useMemo(() => {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
    const out: boolean[] = [];
    for (let i = 0; i < 21 * 21; i += 1) {
      h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
      out.push(((h >>> 7) & 1) === 1);
    }
    return out;
  }, [seed]);
  const finder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
  return (
    <svg viewBox="-2 -2 25 25" aria-hidden="true" className="size-[132px] rounded-[10px] bg-white p-1 shadow-[0_0_0_1px_var(--bjork-border)]">
      {cells.map((on, i) => {
        const x = i % 21;
        const y = Math.floor(i / 21);
        if (finder(x, y) || !on) return null;
        return <rect key={i} x={x} y={y} width="1" height="1" fill="#111" />;
      })}
      {[
        [0, 0],
        [14, 0],
        [0, 14],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x + 0.5} y={y + 0.5} width="6" height="6" fill="none" stroke="#111" />
          <rect x={x + 2} y={y + 2} width="3" height="3" fill="#111" />
        </g>
      ))}
    </svg>
  );
}

function TwoFactorDialog({
  open,
  email,
  onClose,
  onVerified,
}: {
  open: boolean;
  email: string;
  onClose: () => void;
  onVerified: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => {
    setCode("");
    setError(null);
    onClose();
  };
  const verify = async () => {
    if (code.length !== 6) {
      setError("Enter the 6-digit code from your app.");
      return;
    }
    setBusy(true);
    await new Promise((r) => setTimeout(r, 600));
    setBusy(false);
    if (code === "000000") {
      setError("That code has expired. Codes change every 30 seconds.");
      return;
    }
    setCode("");
    setError(null);
    onVerified();
  };
  return (
    <BlockDialog
      open={open}
      onClose={close}
      title="Set up two-factor authentication"
      description="Scan this with 1Password, Authy or Google Authenticator, then enter the code it shows."
      footer={
        <>
          <BlockButton size="sm" variant="ghost" onClick={close}>
            Cancel
          </BlockButton>
          <BlockButton size="sm" variant="primary" onClick={verify} disabled={busy} className="min-w-[96px]">
            {busy ? <BlockSpinner /> : "Verify & turn on"}
          </BlockButton>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4 @container">
        <FauxQr seed={email} />
        <p className="text-center text-[12px] text-[color:var(--bjork-text-muted)]">
          Can&apos;t scan? Enter <span className="select-all font-mono text-[color:var(--bjork-text)]">JBSW Y3DP EHPK 3PXP</span>
        </p>
        <form
          className="w-full max-w-[220px]"
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <BlockField
            data-autofocus
            label="6-digit code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
              setError(null);
            }}
            error={error}
            inputClassName="text-center font-mono text-[18px] tracking-[0.4em]"
            placeholder="••••••"
          />
        </form>
      </div>
    </BlockDialog>
  );
}
