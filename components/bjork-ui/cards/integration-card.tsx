"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, ChevronDown, Lock, RefreshCw } from "lucide-react";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import { ease } from "@/components/bjork-ui/_core/motion";
import {
  CardButton,
  CardFrame,
  Pill,
  focusRing,
  useCardTheme,
  useClock,
  useReducedMotionSafe,
  type CardTheme,
  type PillTone,
} from "@/components/bjork-ui/cards/card-kit";
import { cn } from "@/lib/utils";

export type IntegrationStatus = "disconnected" | "connecting" | "connected" | "error" | "reauth";

export interface IntegrationScope {
  id: string;
  label: string;
  description?: string;
  /** Required scopes are always granted and cannot be unticked. */
  required?: boolean;
}

export interface IntegrationApp {
  name: string;
  publisher: string;
  description: string;
  /** Tile colour for the generated monogram. */
  color: string;
  /** Replaces the monogram, e.g. an <img> or SVG logo. */
  logo?: ReactNode;
}

export interface ConnectedAccount {
  /** Who the connection authenticates as, e.g. an email or workspace. */
  name: string;
  /** Epoch ms. */
  connectedAt: number;
  /** Epoch ms. */
  lastSyncedAt?: number;
}

export interface IntegrationCardProps {
  app?: IntegrationApp;
  /** Your product, drawn on the left of the handshake. */
  host?: { name: string; color: string; logo?: ReactNode };
  scopes?: IntegrationScope[];
  /** Controlled status. Omit to let the card run the flow itself. */
  status?: IntegrationStatus;
  defaultStatus?: IntegrationStatus;
  account?: ConnectedAccount;
  defaultAccount?: ConnectedAccount;
  /** Runs the OAuth hand-off. Resolve with the account, reject to show the error state. Without it the card simulates a 1.6s handshake. */
  onConnect?: (scopeIds: string[]) => Promise<ConnectedAccount>;
  onDisconnect?: () => void | Promise<void>;
  /** Resolves with the new sync time. Without it the card simulates a sync. */
  onSync?: () => Promise<number>;
  onAutoSyncChange?: (on: boolean) => void;
  errorMessage?: string;
  /** Epoch ms. Freezes the clock for previews and tests. */
  now?: number;
  theme?: CardTheme;
  className?: string;
}

export const INTEGRATION_SAMPLE = {
  app: {
    name: "Ledgerline",
    publisher: "Ledgerline Labs",
    description: "Sync invoices, payouts and customers into your books every hour.",
    color: "#2f6f5e",
  } satisfies IntegrationApp,
  host: { name: "Fieldwork", color: "#ec5c13" },
  scopes: [
    { id: "invoices.read", label: "Read invoices", description: "Line items, totals and status", required: true },
    { id: "customers.read", label: "Read customers", description: "Names, emails and billing addresses", required: true },
    { id: "payouts.read", label: "Read payouts", description: "Settlement dates and fees" },
    { id: "invoices.write", label: "Mark invoices paid", description: "Write payment status back to Ledgerline" },
  ] satisfies IntegrationScope[],
  account: {
    name: "finance@northpeak.co",
    connectedAt: Date.UTC(2026, 9, 6, 15),
    lastSyncedAt: Date.UTC(2026, 9, 8, 11, 56),
  } satisfies ConnectedAccount,
  now: Date.UTC(2026, 9, 8, 12),
};

const STATUS: Record<IntegrationStatus, { label: string; tone: PillTone }> = {
  disconnected: { label: "Not connected", tone: "neutral" },
  connecting: { label: "Connecting", tone: "accent" },
  connected: { label: "Connected", tone: "success" },
  error: { label: "Failed", tone: "error" },
  reauth: { label: "Needs attention", tone: "warning" },
};

function relative(ms: number, now: number) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} ${d === 1 ? "day" : "days"} ago`;
}

/**
 * Connect a third-party app. Shows the permissions it asks for, walks through the OAuth hand-off and,
 * once connected, the account, sync state and a guarded disconnect.
 */
export function IntegrationCard({
  app = INTEGRATION_SAMPLE.app,
  host = INTEGRATION_SAMPLE.host,
  scopes = INTEGRATION_SAMPLE.scopes,
  status: statusProp,
  defaultStatus = "disconnected",
  account: accountProp,
  defaultAccount,
  onConnect,
  onDisconnect,
  onSync,
  onAutoSyncChange,
  errorMessage = "The authorization window was closed before access was granted.",
  now,
  theme = "auto",
  className,
}: IntegrationCardProps) {
  const { style } = useCardTheme(theme);
  const reduce = useReducedMotionSafe();
  const clock = useClock(now, 30_000);
  const titleId = useId();
  const scopesId = useId();

  const [innerStatus, setInnerStatus] = useState<IntegrationStatus>(defaultStatus);
  const [innerAccount, setInnerAccount] = useState<ConnectedAccount | undefined>(defaultAccount);
  const status = statusProp ?? innerStatus;
  const account = accountProp ?? innerAccount;

  const [granted, setGranted] = useState(() => new Set(scopes.map((s) => s.id)));
  const [scopesOpen, setScopesOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [message, setMessage] = useState("");
  const attempt = useRef(0);
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => () => void (attempt.current += 1), []);

  const connect = async () => {
    const id = ++attempt.current;
    setInnerStatus("connecting");
    setMessage(`Connecting to ${app.name}`);
    const ids = scopes.filter((s) => s.required || granted.has(s.id)).map((s) => s.id);
    try {
      const acct = onConnect
        ? await onConnect(ids)
        : await new Promise<ConnectedAccount>((resolve) =>
            setTimeout(
              () => resolve({ ...INTEGRATION_SAMPLE.account, connectedAt: Date.now(), lastSyncedAt: Date.now() }),
              1600,
            ),
          );
      if (id !== attempt.current) return;
      setInnerAccount(acct);
      setInnerStatus("connected");
      setMessage(`Connected to ${app.name} as ${acct.name}`);
    } catch {
      if (id !== attempt.current) return;
      setInnerStatus("error");
      setMessage(`Could not connect to ${app.name}`);
    }
  };

  const cancel = () => {
    attempt.current += 1;
    setInnerStatus("disconnected");
    setMessage("Connection cancelled");
  };

  const disconnect = async () => {
    setConfirming(false);
    await onDisconnect?.();
    setInnerStatus("disconnected");
    setInnerAccount(undefined);
    setMessage(`Disconnected ${app.name}`);
    requestAnimationFrame(() => primaryRef.current?.focus());
  };

  const sync = async () => {
    if (syncing) return;
    setSyncing(true);
    setMessage("Syncing");
    const at = onSync ? await onSync() : await new Promise<number>((r) => setTimeout(() => r(Date.now()), 1200));
    setInnerAccount((a) => (a ? { ...a, lastSyncedAt: at } : a));
    setSyncing(false);
    setMessage("Sync complete");
  };

  const editable = status === "disconnected" || status === "error";
  const meta = STATUS[status];

  return (
    <CardFrame aria-labelledby={titleId} aria-busy={status === "connecting" || undefined} className={className} style={style}>
      <div className="px-5 pt-5">
        <div className="flex items-start justify-between gap-3">
          <Handshake host={host} app={app} status={status} reduce={reduce} />
          <Pill tone={meta.tone} dot pulse={status === "connecting"}>
            {meta.label}
          </Pill>
        </div>

        <h3 id={titleId} className="mt-4 text-[15px] font-semibold leading-5">
          {app.name}
        </h3>
        <p className="text-[12px] leading-4 text-[color:var(--bjork-text-muted)]">by {app.publisher}</p>
        <p className="mt-2 text-[13px] leading-5 text-[color:var(--bjork-text-medium)]">{app.description}</p>
      </div>

      {/* Permissions */}
      <div className="mt-4 border-y border-[color:var(--bjork-border)]">
        <button
          type="button"
          aria-expanded={scopesOpen}
          aria-controls={scopesId}
          onClick={() => setScopesOpen((o) => !o)}
          className={cn(
            "flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-3 text-left text-[13px] transition-colors hover:bg-[color:var(--bjork-card-hover)]",
            focusRing,
            "focus-visible:ring-inset focus-visible:ring-offset-0",
          )}
        >
          <span className="font-medium">
            Permissions{" "}
            <span className="font-normal text-[color:var(--bjork-text-muted)]">
              · {scopes.filter((s) => s.required || granted.has(s.id)).length} of {scopes.length}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-4 text-[color:var(--bjork-text-muted)] transition-transform duration-200 motion-reduce:transition-none",
              scopesOpen && "rotate-180",
            )}
          />
        </button>
        <div
          id={scopesId}
          className="grid"
          inert={!scopesOpen}
          aria-hidden={!scopesOpen || undefined}
          style={{
            gridTemplateRows: scopesOpen ? "1fr" : "0fr",
            transition: reduce ? "none" : "grid-template-rows 260ms cubic-bezier(0.32,0.72,0,1)",
          }}
        >
          <ul className="min-h-0 overflow-hidden">
            {scopes.map((s) => {
              const on = s.required || granted.has(s.id);
              return (
                <li key={s.id} className="px-5 pb-3 first:pt-1">
                  <label
                    className={cn(
                      "flex items-start gap-3",
                      !s.required && editable ? "cursor-pointer" : "cursor-default",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={s.required || !editable}
                      onChange={(e) =>
                        setGranted((g) => {
                          const n = new Set(g);
                          if (e.target.checked) n.add(s.id);
                          else n.delete(s.id);
                          return n;
                        })
                      }
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-0.5 grid size-4 shrink-0 place-items-center rounded-[5px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[color:var(--bjork-accent)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[color:var(--bjork-ring-offset)]",
                        on
                          ? "border-transparent bg-[color:var(--bjork-accent-fill)] text-[color:var(--bjork-accent-foreground)]"
                          : "border-[color:var(--bjork-border-strong)]",
                        (s.required || !editable) && "opacity-60",
                      )}
                    >
                      {on && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[13px] leading-5">
                        {s.label}
                        {s.required && (
                          <>
                            <Lock aria-hidden="true" className="size-3 text-[color:var(--bjork-text-soft)]" />
                            <span className="sr-only">(required)</span>
                          </>
                        )}
                      </span>
                      {s.description && (
                        <span className="block text-[12px] leading-4 text-[color:var(--bjork-text-muted)]">{s.description}</span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* State body */}
      <div className="px-5 py-4">
        {(status === "connected" || status === "reauth") && account && (
          <dl className="mb-4 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5 text-[12px] leading-4">
            <dt className="text-[color:var(--bjork-text-muted)]">Account</dt>
            <dd className="truncate text-right">{account.name}</dd>
            <dt className="text-[color:var(--bjork-text-muted)]">Connected</dt>
            <dd className="text-right">{clock === null ? "—" : relative(account.connectedAt, clock)}</dd>
            <dt className="text-[color:var(--bjork-text-muted)]">Last sync</dt>
            <dd className="text-right">
              {syncing ? "Syncing…" : account.lastSyncedAt && clock !== null ? relative(account.lastSyncedAt, Math.max(clock, account.lastSyncedAt)) : "—"}
            </dd>
          </dl>
        )}

        {status === "connected" && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <span id={`${titleId}-auto`} className="text-[13px]">
              Sync every hour
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={autoSync}
              aria-labelledby={`${titleId}-auto`}
              onClick={() => {
                setAutoSync((v) => !v);
                onAutoSyncChange?.(!autoSync);
              }}
              className={cn(
                "relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 motion-reduce:transition-none",
                autoSync ? "bg-[color:var(--bjork-accent-fill)]" : "bg-[color:var(--bjork-track)]",
                focusRing,
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.3)] transition-transform duration-200 motion-reduce:transition-none",
                  autoSync && "translate-x-4",
                )}
              />
            </button>
          </div>
        )}

        {status === "error" && (
          <p role="alert" className="mb-4 flex items-start gap-2 text-[12px] leading-4 text-[color:var(--bjork-error)]">
            <AlertTriangle aria-hidden="true" className="mt-px size-3.5 shrink-0" />
            {errorMessage}
          </p>
        )}
        {status === "reauth" && (
          <p className="mb-4 flex items-start gap-2 text-[12px] leading-4 text-[color:var(--bjork-warning)]">
            <AlertTriangle aria-hidden="true" className="mt-px size-3.5 shrink-0" />
            Access expired. Reconnect to resume syncing.
          </p>
        )}

        <AnimatePresence initial={false} mode="wait">
          {confirming ? (
            <motion.div
              key="confirm"
              role="alertdialog"
              aria-label={`Disconnect ${app.name}?`}
              initial={{ opacity: 0, y: reduce ? 0 : 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: ease.out }}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <p className="text-[12px] leading-4 text-[color:var(--bjork-text-medium)]">Stop syncing and revoke access?</p>
              <div className="flex gap-1.5">
                <CardButton size="sm" variant="ghost" onClick={() => setConfirming(false)} autoFocus>
                  Keep
                </CardButton>
                <CardButton size="sm" variant="danger" onClick={disconnect}>
                  Disconnect
                </CardButton>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={status}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-2"
            >
              {(status === "disconnected" || status === "error" || status === "reauth") && (
                <CardButton ref={primaryRef} variant="primary" onClick={connect} className="flex-1">
                  {status === "disconnected" ? `Connect ${app.name}` : status === "error" ? "Try again" : "Reconnect"}
                </CardButton>
              )}
              {status === "connecting" && (
                <>
                  <span className="flex-1 text-[12px] text-[color:var(--bjork-text-muted)]">Waiting for {app.name} to approve…</span>
                  <CardButton size="sm" variant="ghost" onClick={cancel}>
                    Cancel
                  </CardButton>
                </>
              )}
              {status === "connected" && (
                <>
                  <CardButton
                    onClick={sync}
                    disabled={syncing}
                    className="flex-1"
                    icon={
                      <RefreshCw
                        aria-hidden="true"
                        className={cn("size-3.5", syncing && "motion-safe:animate-spin")}
                      />
                    }
                  >
                    {syncing ? "Syncing" : "Sync now"}
                  </CardButton>
                  <CardButton variant="ghost" onClick={() => setConfirming(true)}>
                    Disconnect
                  </CardButton>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <LiveRegion message={message} />
    </CardFrame>
  );
}

function Tile({ name, color, logo }: { name: string; color: string; logo?: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-[12px] text-[17px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_0_0_1px_rgba(0,0,0,0.12),0_6px_14px_-8px_rgba(0,0,0,0.5)]"
      style={{ background: `linear-gradient(160deg, ${color}, color-mix(in oklab, ${color} 70%, black))` }}
    >
      {logo ?? name.slice(0, 1)}
    </span>
  );
}

function Handshake({
  host,
  app,
  status,
  reduce,
}: {
  host: { name: string; color: string; logo?: ReactNode };
  app: IntegrationApp;
  status: IntegrationStatus;
  reduce: boolean;
}) {
  const linked = status === "connected";
  const busy = status === "connecting";
  const broken = status === "error" || status === "reauth";
  const lineColor = linked
    ? "var(--bjork-success)"
    : broken
      ? status === "error"
        ? "var(--bjork-error)"
        : "var(--bjork-warning)"
      : "var(--bjork-border-strong)";

  return (
    <div className="flex items-center" aria-hidden="true">
      <Tile {...host} />
      <div className="relative mx-1 h-11 w-14">
        <svg viewBox="0 0 56 44" className="absolute inset-0 size-full overflow-visible">
          <line
            x1="2"
            y1="22"
            x2="54"
            y2="22"
            stroke={lineColor}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray={linked ? undefined : "2 4"}
            style={{ transition: "stroke 300ms" }}
          />
          {busy && !reduce && (
            <>
              {[0, 1, 2].map((i) => (
                <motion.circle
                  key={i}
                  r="2"
                  cy="22"
                  fill="var(--bjork-accent)"
                  initial={{ cx: 2, opacity: 0 }}
                  animate={{ cx: [2, 54], opacity: [0, 1, 1, 0] }}
                  transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.36, ease: "easeInOut" }}
                />
              ))}
            </>
          )}
        </svg>
        <span
          className={cn(
            "absolute left-1/2 top-1/2 grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border bg-[color:var(--bjork-card)] transition-[transform,opacity] duration-300 motion-reduce:transition-none",
            linked || broken ? "scale-100 opacity-100" : "scale-50 opacity-0",
          )}
          style={{ borderColor: lineColor, color: lineColor }}
        >
          {broken ? <span className="text-[11px] font-bold leading-none">!</span> : <Check className="size-3" strokeWidth={3} />}
        </span>
      </div>
      <Tile name={app.name} color={app.color} logo={app.logo} />
    </div>
  );
}
