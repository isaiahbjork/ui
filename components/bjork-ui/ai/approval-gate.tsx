"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import { easeCss } from "@/components/bjork-ui/_core/motion";
import {
  FOCUS_RING,
  PRESS,
  useAiTone,
  useControllable,
  useReduceMotion,
  type BjorkTone,
} from "@/components/bjork-ui/ai/_shared";
import { StrokeMorphIcon } from "@/components/bjork-ui/utilities/stroke-morph-icon";
import { cn } from "@/lib/utils";

export type ApprovalRisk = "low" | "medium" | "high";
export type ApprovalStatus = "pending" | "approved" | "denied";

export interface ApprovalRequest {
  id: string;
  /** What will happen, in plain words: "Send email to 214 customers". */
  action: string;
  /** Tool that will run, shown in mono. */
  tool: string;
  /** What the tool acts on, e.g. "segment · churn-risk-q3". */
  target?: string;
  risk: ApprovalRisk;
  /** One line on why the risk level was chosen. */
  riskReason?: string;
  /** Arguments preview. Long values truncate and expand. */
  params?: Record<string, string | number | boolean | null>;
  /** Side effects, e.g. "Will charge $49.00 to card •4242". */
  effects?: string[];
}

export interface ApprovalDecision {
  status: Exclude<ApprovalStatus, "pending">;
  /** Optional reason the person gave when denying, or "Timed out". */
  reason?: string;
  /** "Always allow this tool for the session" was ticked. */
  alwaysAllow: boolean;
  /** Epoch ms of the decision. */
  at: number;
}

export interface ApprovalGateProps {
  request: ApprovalRequest;
  status?: ApprovalStatus;
  defaultStatus?: ApprovalStatus;
  /** Fires once per decision, with the reason and the session preference. */
  onDecision?: (decision: ApprovalDecision) => void;
  /** High risk only: Approve must be held for ~1.2s. Reduced motion uses a two-step confirm instead. */
  requireHold?: boolean;
  /** Auto-deny after this many ms. The countdown pauses while the gate is hovered or focused. */
  timeoutMs?: number;
  /** Move focus into the gate on mount: the Approve button for low and medium risk, the gate itself for high. */
  autoFocus?: boolean;
  /** Demo/preview only: a fixed clock for the receipt time. */
  now?: number;
  /** Demo/preview only: freeze the hold fill (0 to 1) and the timeout hairline (0 to 1 remaining). */
  pose?: { hold?: number; remaining?: number };
  tone?: BjorkTone;
  className?: string;
}

export const SAMPLE_APPROVAL_REQUESTS: ApprovalRequest[] = [
  {
    id: "req_bulk_email",
    action: "Send email to 214 customers",
    tool: "send_bulk_email",
    target: "segment · churn-risk-q3",
    risk: "high",
    riskReason: "Irreversible. Sent emails cannot be recalled.",
    params: {
      from: "ada@fieldnotes.dev",
      subject: "A note about your Studio plan",
      body:
        "Hi {{first_name}}, we noticed you haven't opened Fieldnotes in a while. We've moved your workspace to the new editor and kept every draft exactly where you left it. If anything feels off, reply to this email and a person will answer.",
      track_opens: true,
    },
    effects: ["Will email 214 recipients from ada@fieldnotes.dev", "Will log a campaign in Halcyon CRM"],
  },
  {
    id: "req_charge",
    action: "Charge Maren Osei for the annual upgrade",
    tool: "create_charge",
    target: "cus_8Hq2Lm",
    risk: "medium",
    riskReason: "Moves money. Refundable within 30 days.",
    params: { amount: "49.00", currency: "USD", description: "Studio annual upgrade (prorated)" },
    effects: ["Will charge $49.00 to card •4242"],
  },
  {
    id: "req_read",
    action: "Read the Q3 retention sheet",
    tool: "read_file",
    target: "drive://growth/q3-retention.csv",
    risk: "low",
    riskReason: "Read-only. Nothing is changed.",
    params: { path: "growth/q3-retention.csv", max_rows: 500 },
  },
];

const HOLD_MS = 1200;
const DRAIN_SPEED = 3; // a released hold drains three times faster than it fills
const TWO_STEP_MS = 3000;
const WARN_MS = 10_000;
const LONG_VALUE = 56;

const RISK: Record<ApprovalRisk, { label: string; color: string }> = {
  low: { label: "Low risk", color: "var(--bjork-text-muted)" },
  medium: { label: "Medium risk", color: "var(--bjork-warning)" },
  high: { label: "High risk", color: "var(--bjork-error)" },
};

function clockTime(at: number): string {
  return new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const BTN =
  "relative inline-flex h-8 min-w-[76px] cursor-pointer select-none items-center justify-center overflow-hidden rounded-[9px] px-3 text-[13px] font-medium leading-5 transition-[background-color,color,border-color] duration-150";
const BTN_QUIET =
  "border border-[color:var(--bjork-border)] text-[color:var(--bjork-text-medium)] hover:border-[color:var(--bjork-border-strong)] hover:bg-[color:var(--bjork-surface-active)] hover:text-[color:var(--bjork-text)]";

/** Human-in-the-loop confirmation for a tool call: what, where, how risky, then Approve or Deny. */
export function ApprovalGate({
  request,
  status,
  defaultStatus = "pending",
  onDecision,
  requireHold = false,
  timeoutMs,
  autoFocus = false,
  now,
  pose,
  tone: toneProp,
  className,
}: ApprovalGateProps) {
  const { style } = useAiTone(toneProp);
  const reduce = useReduceMotion();
  const titleId = useId();
  const descId = useId();
  const reasonId = useId();
  const holdHintId = useId();
  const [current, setStatus] = useControllable<ApprovalStatus>(status, defaultStatus, undefined);
  const [record, setRecord] = useState<ApprovalDecision | null>(null);
  const [always, setAlways] = useState(false);
  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState("");
  const [armed, setArmed] = useState(false);
  const [paused, setPaused] = useState(false);

  const rootRef = useRef<HTMLElement>(null);
  const approveRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);
  const denyRef = useRef<HTMLButtonElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const holdLabelRef = useRef<HTMLSpanElement>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const hairRef = useRef<HTMLSpanElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);

  const holdMode = requireHold && request.risk === "high";
  const twoStep = holdMode && reduce;
  const pending = current === "pending";
  const posed = pose !== undefined;
  const risk = RISK[request.risk];

  const decide = useCallback(
    (next: ApprovalDecision["status"], why?: string) => {
      const decision: ApprovalDecision = {
        status: next,
        reason: why?.trim() || undefined,
        alwaysAllow: next === "approved" && always,
        at: now ?? Date.now(),
      };
      // Focus follows the decision to the receipt, so it is not lost on a control that just went inert.
      const hadFocus = rootRef.current?.contains(document.activeElement) ?? false;
      setRecord(decision);
      setStatus(next);
      if (hadFocus) requestAnimationFrame(() => receiptRef.current?.focus());
      setDenying(false);
      onDecision?.(decision);
    },
    [always, now, onDecision, setStatus],
  );
  const decideRef = useRef(decide);
  useLayoutEffect(() => {
    decideRef.current = decide;
  });

  // Announce the outcome, derived during render.
  const [announce, setAnnounce] = useState({ status: current, message: "" });
  if (announce.status !== current) {
    setAnnounce({
      status: current,
      message:
        current === "approved"
          ? `Approved: ${request.action}`
          : current === "denied"
            ? `Denied: ${request.action}`
            : `Approval needed: ${request.action}`,
    });
  }

  useEffect(() => {
    if (!autoFocus) return;
    if (request.risk === "high") rootRef.current?.focus();
    else approveRef.current?.focus();
  }, [autoFocus, request.id, request.risk]);

  useEffect(() => {
    if (denying) reasonRef.current?.focus();
  }, [denying]);

  // Two-step confirm disarms itself.
  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(false), TWO_STEP_MS);
    return () => window.clearTimeout(id);
  }, [armed]);

  // ----- Timeout. The hairline and seconds are written to the DOM; React renders only on pause and expiry.
  const pausedRef = useRef(paused);
  useLayoutEffect(() => {
    pausedRef.current = paused || denying;
  });
  useEffect(() => {
    if (!pending || timeoutMs === undefined || posed) return;
    let left = timeoutMs;
    let last = performance.now();
    let raf = 0;
    const paint = () => {
      const f = Math.max(0, left / timeoutMs);
      if (hairRef.current) {
        hairRef.current.style.transform = `scaleX(${f})`;
        hairRef.current.style.background = left < WARN_MS ? "var(--bjork-warning)" : "var(--bjork-text-soft)";
      }
      if (countRef.current) countRef.current.textContent = `${Math.ceil(left / 1000)}s`;
    };
    const loop = (t: number) => {
      const dt = t - last;
      last = t;
      if (!pausedRef.current) left -= dt;
      paint();
      if (left <= 0) {
        decideRef.current("denied", "Timed out");
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    paint();
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pending, timeoutMs, posed]);

  // ----- Press and hold.
  const hold = useRef({ p: 0, dir: 0, raf: 0, last: 0 });
  const paintFill = (p: number) => {
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${p})`;
    if (holdLabelRef.current) holdLabelRef.current.style.clipPath = `inset(0 ${100 - p * 100}% 0 0)`;
  };
  const step = (t: number) => {
    const h = hold.current;
    const dt = t - h.last;
    h.last = t;
    h.p = Math.min(1, Math.max(0, h.p + (h.dir * dt * (h.dir < 0 ? DRAIN_SPEED : 1)) / HOLD_MS));
    paintFill(h.p);
    if (h.p >= 1) {
      h.dir = 0;
      h.raf = 0;
      decideRef.current("approved");
      return;
    }
    if (h.p <= 0 && h.dir < 0) {
      h.dir = 0;
      h.raf = 0;
      return;
    }
    h.raf = requestAnimationFrame(step);
  };
  const startHold = () => {
    const h = hold.current;
    h.dir = 1;
    if (!h.raf) {
      h.last = performance.now();
      h.raf = requestAnimationFrame(step);
    }
  };
  const releaseHold = () => {
    const h = hold.current;
    if (h.dir === 0) return;
    h.dir = -1;
    if (!h.raf) {
      h.last = performance.now();
      h.raf = requestAnimationFrame(step);
    }
  };
  useEffect(() => {
    const h = hold.current;
    return () => cancelAnimationFrame(h.raf);
  }, []);

  const onApproveClick = (e: ReactMouseEvent<HTMLButtonElement>) => {
    if (!holdMode) return decide("approved");
    // Reduced motion, or an assistive-tech click with no pointer: confirm in two steps instead of holding.
    if (twoStep || e.detail === 0) {
      if (armed) decide("approved");
      else setArmed(true);
    }
  };
  const onApproveKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!holdMode || twoStep || (e.key !== " " && e.key !== "Enter")) return;
    e.preventDefault();
    if (!e.repeat) startHold();
  };
  const onApproveKeyUp = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!holdMode || twoStep || (e.key !== " " && e.key !== "Enter")) return;
    e.preventDefault();
    releaseHold();
  };

  const submitDeny = () => decide("denied", reason);

  const approveLabel = holdMode
    ? twoStep || armed
      ? armed
        ? "Confirm approve"
        : "Approve"
      : "Hold to approve"
    : "Approve";

  const params = Object.entries(request.params ?? {});

  return (
    <section
      ref={rootRef}
      tabIndex={-1}
      aria-labelledby={titleId}
      aria-describedby={descId}
      style={style}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
      className={cn(
        "@container relative w-full max-w-[560px] font-bjork-alpha text-[color:var(--bjork-text)]",
        FOCUS_RING,
        "rounded-[12px]",
        className,
      )}
    >
      {/* Pending card */}
      <div
        className="grid"
        aria-hidden={!pending || undefined}
        inert={!pending}
        style={{
          gridTemplateRows: pending ? "1fr" : "0fr",
          opacity: pending ? 1 : 0,
          transition: reduce ? "none" : `grid-template-rows 280ms ${easeCss.drawer}, opacity 200ms ${easeCss.drawer}`,
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="relative overflow-hidden rounded-[12px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-surface)] px-4 pb-3.5 pt-3">
            <div className="flex min-h-6 items-center justify-between gap-3">
              <span className="font-mono text-[10px] uppercase leading-4 tracking-[0.08em] text-[color:var(--bjork-text-faint)]">
                Approval needed
              </span>
              <span className="flex shrink-0 items-center gap-2.5">
                {timeoutMs !== undefined && (
                  <span className="whitespace-nowrap font-mono text-[11px] leading-4 tabular-nums text-[color:var(--bjork-text-faint)]">
                    {paused || denying ? (
                      "Paused"
                    ) : (
                      <>
                        Auto-deny{" "}
                        <span ref={countRef} className="inline-block min-w-[3ch] text-right">
                          {posed ? `${Math.ceil(((pose?.remaining ?? 1) * timeoutMs) / 1000)}s` : ""}
                        </span>
                      </>
                    )}
                  </span>
                )}
                <span
                  className="inline-flex h-5 items-center rounded-[5px] border px-1.5 font-mono text-[10px] uppercase leading-none tracking-[0.08em]"
                  style={{
                    color: risk.color,
                    borderColor: `color-mix(in srgb, ${risk.color} 34%, transparent)`,
                    background: `color-mix(in srgb, ${risk.color} 8%, transparent)`,
                  }}
                >
                  {risk.label}
                </span>
              </span>
            </div>

            <h3 id={titleId} className="mt-2 text-[15px] font-semibold leading-[22px] text-balance">
              {request.action}
            </h3>
            <p className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2 text-[12px] leading-5">
              <span className="font-mono text-[color:var(--bjork-text-medium)]">{request.tool}</span>
              {request.target && (
                <span className="min-w-0 truncate text-[color:var(--bjork-text-muted)]">→ {request.target}</span>
              )}
            </p>
            <p id={descId} className="mt-1.5 flex items-start gap-2 text-[12px] leading-[18px] text-[color:var(--bjork-text-soft)]">
              <span aria-hidden="true" className="mt-[6px] size-1.5 shrink-0 rounded-full" style={{ background: risk.color }} />
              <span>
                <span className="sr-only">{risk.label}. </span>
                {request.riskReason ?? risk.label}
              </span>
            </p>

            {params.length > 0 && (
              <dl className="mt-3 overflow-hidden rounded-[8px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-field-inset)] py-1">
                {params.map(([key, value]) => (
                  <Param key={key} name={key} value={value} />
                ))}
              </dl>
            )}

            {request.effects && request.effects.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1" aria-label="Effects">
                {request.effects.map((effect) => (
                  <li key={effect} className="flex items-start gap-2 text-[13px] leading-5 text-[color:var(--bjork-text-medium)]">
                    <span aria-hidden="true" className="mt-[3px] grid size-3.5 shrink-0 place-items-center">
                      <StrokeMorphIcon name="arrow-right" size={12} strokeWidth={1.75} color="var(--bjork-text-faint)" />
                    </span>
                    {effect}
                  </li>
                ))}
              </ul>
            )}

            {/* Deny reason */}
            <div
              className="grid"
              inert={!denying}
              style={{
                gridTemplateRows: denying ? "1fr" : "0fr",
                opacity: denying ? 1 : 0,
                transition: reduce ? "none" : `grid-template-rows 240ms ${easeCss.drawer}, opacity 240ms ${easeCss.drawer}`,
              }}
            >
              {/* Negative margin plus padding leaves room for the input's focus ring inside the clip. */}
              <div className="-mx-1 -mb-1 min-h-0 overflow-hidden px-1 pb-1">
                <div className="flex flex-col gap-1.5 pt-3">
                  <label htmlFor={reasonId} className="text-[12px] leading-4 text-[color:var(--bjork-text-muted)]">
                    Reason <span className="text-[color:var(--bjork-text-faint)]">(optional, sent to the assistant)</span>
                  </label>
                  <input
                    id={reasonId}
                    ref={reasonRef}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitDeny();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setDenying(false);
                        denyRef.current?.focus();
                      }
                    }}
                    placeholder="Wrong segment, use churn-risk-q4"
                    className={cn(
                      "h-8 w-full min-w-0 rounded-[8px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-field)] px-2.5 text-[13px] text-[color:var(--bjork-text)] placeholder:text-[color:var(--bjork-text-faint)]",
                      FOCUS_RING,
                    )}
                  />
                </div>
              </div>
            </div>

            <div className="mt-3.5 flex flex-col gap-3 @[440px]:flex-row @[440px]:items-center @[440px]:justify-between">
              <label className="flex min-h-7 cursor-pointer items-center gap-2 text-[12px] leading-4 text-[color:var(--bjork-text-muted)]">
                <input
                  type="checkbox"
                  checked={always}
                  onChange={(e) => setAlways(e.target.checked)}
                  className={cn(
                    "size-3.5 shrink-0 cursor-pointer rounded-[4px] accent-[color:var(--bjork-accent)]",
                    FOCUS_RING,
                  )}
                />
                <span>
                  Always allow <span className="font-mono text-[11px]">{request.tool}</span> this session
                </span>
              </label>
              <div className="flex shrink-0 items-center justify-end gap-2">
                {denying ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setDenying(false);
                        denyRef.current?.focus();
                      }}
                      className={cn(BTN, BTN_QUIET, "min-w-0 border-transparent", FOCUS_RING, PRESS)}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={submitDeny}
                      className={cn(
                        BTN,
                        "border border-[color:color-mix(in_srgb,var(--bjork-error)_40%,transparent)] text-[color:var(--bjork-error)] hover:bg-[color:color-mix(in_srgb,var(--bjork-error)_8%,transparent)]",
                        FOCUS_RING,
                        PRESS,
                      )}
                    >
                      Deny
                    </button>
                  </>
                ) : (
                  <button
                    ref={denyRef}
                    type="button"
                    onClick={() => {
                      setArmed(false);
                      setDenying(true);
                    }}
                    className={cn(BTN, BTN_QUIET, FOCUS_RING, PRESS)}
                  >
                    Deny…
                  </button>
                )}
                <button
                  ref={approveRef}
                  type="button"
                  aria-describedby={holdMode ? holdHintId : undefined}
                  onClick={onApproveClick}
                  onPointerDown={(e) => {
                    if (!holdMode || twoStep || e.button !== 0) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    startHold();
                  }}
                  onPointerUp={releaseHold}
                  onPointerCancel={releaseHold}
                  onLostPointerCapture={releaseHold}
                  onKeyDown={onApproveKeyDown}
                  onKeyUp={onApproveKeyUp}
                  onBlur={releaseHold}
                  onContextMenu={(e) => holdMode && e.preventDefault()}
                  className={cn(
                    BTN,
                    "min-w-[132px] touch-none bg-[color:var(--bjork-accent-fill)] text-[color:var(--bjork-accent-foreground)] hover:brightness-110",
                    holdMode && !twoStep && "bg-[color:var(--bjork-accent-soft)] text-[color:var(--bjork-accent-ink)] ring-1 ring-inset ring-[color:var(--bjork-accent-muted)] hover:brightness-100",
                    armed && "bg-[color:var(--bjork-accent-fill)] text-[color:var(--bjork-accent-foreground)]",
                    FOCUS_RING,
                    !holdMode && PRESS,
                  )}
                >
                  <span className="relative">{approveLabel}</span>
                  {holdMode && !twoStep && (
                    <span
                      ref={fillRef}
                      aria-hidden="true"
                      className="absolute inset-0 origin-left bg-[color:var(--bjork-accent-fill)]"
                      style={{ transform: `scaleX(${pose?.hold ?? 0})` }}
                    />
                  )}
                  {holdMode && !twoStep && (
                    // The label is drawn twice: ink on the empty track, and foreground clipped to the fill.
                    <span
                      ref={holdLabelRef}
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 grid place-items-center text-[color:var(--bjork-accent-foreground)]"
                      style={{ clipPath: `inset(0 ${100 - (pose?.hold ?? 0) * 100}% 0 0)` }}
                    >
                      {approveLabel}
                    </span>
                  )}
                </button>
              </div>
            </div>
            {holdMode && (
              <span id={holdHintId} className="sr-only">
                {twoStep ? "Press twice to confirm." : "Press and hold for about one second."}
              </span>
            )}

            {timeoutMs !== undefined && (
              <span
                ref={hairRef}
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-px origin-left"
                style={{
                  transform: `scaleX(${posed ? (pose?.remaining ?? 1) : 1})`,
                  background: "var(--bjork-text-soft)",
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Receipt */}
      <div
        className="grid"
        aria-hidden={pending || undefined}
        style={{
          gridTemplateRows: pending ? "0fr" : "1fr",
          opacity: pending ? 0 : 1,
          transition: reduce ? "none" : `grid-template-rows 280ms ${easeCss.drawer}, opacity 280ms ${easeCss.drawer} 80ms`,
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <div ref={receiptRef} tabIndex={-1} className="outline-none">
            <Receipt request={request} status={current} record={record} />
          </div>
        </div>
      </div>

      <LiveRegion message={announce.message} />
    </section>
  );
}

function Receipt({
  request,
  status,
  record,
}: {
  request: ApprovalRequest;
  status: ApprovalStatus;
  record: ApprovalDecision | null;
}) {
  if (status === "pending") return <div className="h-9" />;
  const approved = status === "approved";
  const reason = record?.reason;
  return (
    <div className="flex min-h-9 min-w-0 items-center gap-2.5 py-2">
      <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center">
        <StrokeMorphIcon
          name={approved ? "check" : "close"}
          size={16}
          strokeWidth={1.75}
          color={approved ? "var(--bjork-success)" : "var(--bjork-text-muted)"}
        />
      </span>
      <span className="flex min-w-0 flex-1 items-baseline gap-2 text-[13px] leading-5">
        <span className="shrink-0 font-medium text-[color:var(--bjork-text)]">
          {approved ? "Approved" : "Denied"}
          {record && !reason && (
            <span className="font-mono text-[11px] font-normal tabular-nums text-[color:var(--bjork-text-faint)]">
              {" "}
              · {clockTime(record.at)}
            </span>
          )}
          {reason && <span className="font-normal text-[color:var(--bjork-text-muted)]"> — {reason}</span>}
        </span>
        <span className="min-w-0 truncate text-[color:var(--bjork-text-faint)]">{request.action}</span>
      </span>
      {record?.alwaysAllow && (
        <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--bjork-text-faint)] @[420px]:inline">
          Always allowed
        </span>
      )}
    </div>
  );
}

function Param({ name, value }: { name: string; value: string | number | boolean | null }) {
  const [open, setOpen] = useState(false);
  const text = value === null ? "null" : String(value);
  const long = text.length > LONG_VALUE || text.includes("\n");
  const literal = typeof value !== "string";
  return (
    <div className="grid grid-cols-[minmax(64px,auto)_1fr] items-baseline gap-x-3 px-3 py-1 @[440px]:grid-cols-[112px_1fr]">
      <dt className="truncate font-mono text-[11px] leading-5 text-[color:var(--bjork-text-faint)]">{name}</dt>
      <dd className="flex min-w-0 items-baseline gap-2">
        <span
          className={cn(
            "min-w-0 font-mono text-[12px] leading-5",
            literal ? "text-[color:var(--bjork-accent-ink)]" : "text-[color:var(--bjork-text-medium)]",
            open ? "whitespace-pre-wrap break-words" : "truncate",
          )}
        >
          {text}
        </span>
        {long && (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Show full"} ${name}`}
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "-my-1 inline-flex h-7 shrink-0 cursor-pointer items-center self-start rounded-[6px] px-1.5 font-mono text-[11px] text-[color:var(--bjork-text-muted)] hover:text-[color:var(--bjork-text)]",
              FOCUS_RING,
            )}
          >
            {open ? "less" : "more"}
          </button>
        )}
      </dd>
    </div>
  );
}
