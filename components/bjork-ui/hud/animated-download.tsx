"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, FileArchive } from "lucide-react";
import { cn } from "@/lib/utils";
import { BJORK_PALETTE, type BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import { surfaceVars } from "@/components/bjork-ui/_core/surface";

interface DownloadProps {
  className?: string;
  /** @deprecated The card is a fixed 360px wide. Accepted so existing call sites still compile. */
  width?: string | number;
  /** @deprecated The card sizes to its content. Accepted so existing call sites still compile. */
  height?: string | number;
  fileName?: string;
  fileSizeMb?: number;
  /** Total transfer time in milliseconds. */
  durationMs?: number;
  /** Follows the theme when omitted. */
  tone?: BjorkTone;
  isAnimating?: boolean;
  /** Holds the card mid-transfer at this progress (0 to 1), for still previews. */
  previewProgress?: number;
  onAnimationComplete?: () => void;
}

type Phase = "idle" | "downloading" | "done";

interface Transfer {
  phase: Phase;
  /** 0 to 1. */
  progress: number;
}

const IDLE: Transfer = { phase: "idle", progress: 0 };

// Ease-out so the bar moves quickly at first and settles into the last few percent.
const easeOut = (t: number) => 1 - (1 - t) ** 3;

function formatEta(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function AnimatedDownload({
  className,
  fileName = "bjork-ui-registry.zip",
  fileSizeMb = 48.6,
  durationMs = 3200,
  tone: toneProp,
  isAnimating = false,
  previewProgress,
  onAnimationComplete,
}: DownloadProps) {
  const tone = useBjorkTone(toneProp);
  const pal = BJORK_PALETTE[tone];
  const reduce = !!useReducedMotion();

  const [transfer, setTransfer] = useState<Transfer>(
    previewProgress === undefined ? IDLE : { phase: "downloading", progress: previewProgress }
  );

  // Keep the latest callback in a ref so an inline handler does not restart the transfer.
  const onCompleteRef = useRef(onAnimationComplete);
  useEffect(() => {
    onCompleteRef.current = onAnimationComplete;
  }, [onAnimationComplete]);

  useEffect(() => {
    if (previewProgress !== undefined) return;
    if (!isAnimating) {
      // A finished transfer stays on its check until the next run or a remount.
      setTransfer((prev) => (prev.phase === "done" ? prev : IDLE));
      return;
    }

    setTransfer({ phase: "downloading", progress: 0 });
    const start = performance.now();
    let holdTimer: ReturnType<typeof setTimeout> | undefined;

    const id = setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / durationMs);
      if (t >= 1) {
        clearInterval(id);
        setTransfer({ phase: "done", progress: 1 });
        // Hold the check for a beat, then tell the parent the run is over.
        holdTimer = setTimeout(() => onCompleteRef.current?.(), 700);
        return;
      }
      setTransfer({ phase: "downloading", progress: easeOut(t) });
    }, 32);

    return () => {
      clearInterval(id);
      if (holdTimer) clearTimeout(holdTimer);
    };
  }, [isAnimating, durationMs, previewProgress]);

  const { phase, progress } = transfer;
  const pct = Math.round(progress * 100);
  const downloadedMb = fileSizeMb * progress;
  const avgMbps = fileSizeMb / (durationMs / 1000);
  // A gentle wobble around the average so the speed readout moves like a real transfer.
  const speed = phase === "downloading" ? avgMbps * (1.06 - 0.12 * Math.cos(progress * Math.PI * 3)) : phase === "done" ? avgMbps : 0;
  const etaSeconds = phase === "downloading" ? (1 - progress) * (durationMs / 1000) : 0;

  const statusLabel = phase === "done" ? "Saved" : phase === "downloading" ? "Downloading" : "Ready";

  const cardVariants = {
    hidden: { opacity: 0, y: reduce ? 0 : 12 },
    visible: { opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] as const } },
  };

  return (
    <motion.div
      className={cn(
        "w-[360px] max-w-full rounded-[16px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-surface)] p-4 shadow-[var(--bjork-shadow-surface)]",
        className,
      )}
      style={surfaceVars(tone) as CSSProperties}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
    >
      <div className="flex items-center gap-3">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border"
          style={{ borderColor: pal.border, background: pal.raised, color: pal.textMedium }}
          aria-hidden
        >
          <FileArchive className="size-[18px]" strokeWidth={1.75} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[13px] leading-5" style={{ color: pal.text }} title={fileName}>
            {fileName}
          </p>
          <p
            className="font-mono text-[11px] uppercase tracking-[0.08em] tabular-nums"
            style={{ color: pal.textMuted }}
            aria-live="polite"
          >
            {statusLabel}
          </p>
        </div>

        {phase === "done" && (
          <motion.span
            className="flex size-6 shrink-0 items-center justify-center rounded-full"
            style={{ background: pal.accentSoft, color: pal.accentInk }}
            initial={reduce ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 18 }}
          >
            <Check className="size-3.5" strokeWidth={2.5} aria-label="Download complete" />
          </motion.span>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div
          role="progressbar"
          aria-label={`Downloading ${fileName}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="relative h-[3px] flex-1 overflow-hidden rounded-full"
          style={{ background: pal.hair }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${pct}%`, background: pal.accent }}
          />
        </div>
        <span className="w-10 text-right font-mono text-[11px] tabular-nums" style={{ color: pal.textMedium }}>
          {pct}%
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 border-t pt-3" style={{ borderColor: pal.border }}>
        <div>
          <dt className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: pal.textMuted }}>
            Size
          </dt>
          <dd className="mt-1 font-mono text-[12px] tabular-nums" style={{ color: pal.text }}>
            {downloadedMb.toFixed(1)}/{fileSizeMb.toFixed(1)} MB
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: pal.textMuted }}>
            Speed
          </dt>
          <dd className="mt-1 font-mono text-[12px] tabular-nums" style={{ color: pal.text }}>
            {speed.toFixed(1)} MB/s
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: pal.textMuted }}>
            Left
          </dt>
          <dd className="mt-1 font-mono text-[12px] tabular-nums" style={{ color: pal.text }}>
            {formatEta(etaSeconds)}
          </dd>
        </div>
      </dl>
    </motion.div>
  );
}
