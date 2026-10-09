"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, Pause, Play, SkipBack, SkipForward, Speaker } from "lucide-react";
import { LiveRegion } from "@/components/bjork-ui/_core/a11y";
import { ease } from "@/components/bjork-ui/_core/motion";
import {
  CardFrame,
  focusRing,
  useCardTheme,
  useReducedMotionSafe,
  type CardTheme,
} from "@/components/bjork-ui/cards/card-kit";
import { cn } from "@/lib/utils";

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  /** Seconds. */
  duration: number;
  /** Two colours for the generated cover. */
  colors?: [string, string];
  artworkUrl?: string;
}

export interface NowPlayingCardProps {
  tracks?: Track[];
  defaultIndex?: number;
  defaultPlaying?: boolean;
  /** Seconds into the first track. */
  defaultPosition?: number;
  /** Output device label, e.g. "Studio speakers". Omit to hide the row. */
  device?: string;
  onPlayingChange?: (playing: boolean) => void;
  onTrackChange?: (track: Track, index: number) => void;
  onSeek?: (seconds: number) => void;
  onLikeChange?: (trackId: string, liked: boolean) => void;
  /** Ids of liked tracks at mount. */
  defaultLiked?: string[];
  theme?: CardTheme;
  className?: string;
}

export const NOW_PLAYING_SAMPLE: Track[] = [
  { id: "t1", title: "Low Tide Radio", artist: "Marisol Vane", album: "Saltwater Hours", duration: 214, colors: ["#ec5c13", "#3b1d6e"] },
  { id: "t2", title: "Glasshouse", artist: "The Quiet Engines", album: "Glasshouse", duration: 187, colors: ["#2f6f5e", "#d9c89f"] },
  { id: "t3", title: "Northbound, 4 a.m.", artist: "Iko Brandt", album: "Night Freight", duration: 246, colors: ["#24324a", "#e86e6e"] },
  { id: "t4", title: "Paper Lanterns", artist: "Marisol Vane", album: "Saltwater Hours", duration: 198, colors: ["#f2b544", "#7a4b2a"] },
];

const EQ_KEYFRAMES =
  "@keyframes bjork-eq { 0%,100% { transform: scaleY(0.3); } 50% { transform: scaleY(1); } }";

function clock(s: number) {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * A now-playing card: generated cover, scrubbable progress, transport controls, like and the next
 * track. Playback is simulated with a clock; wire the callbacks to your player.
 */
export function NowPlayingCard({
  tracks = NOW_PLAYING_SAMPLE,
  defaultIndex = 0,
  defaultPlaying = false,
  defaultPosition = 0,
  device = "Studio speakers",
  onPlayingChange,
  onTrackChange,
  onSeek,
  onLikeChange,
  defaultLiked = [],
  theme = "auto",
  className,
}: NowPlayingCardProps) {
  const { style } = useCardTheme(theme);
  const reduce = useReducedMotionSafe();
  const titleId = useId();

  const [index, setIndex] = useState(defaultIndex);
  const [playing, setPlaying] = useState(defaultPlaying);
  const [position, setPosition] = useState(defaultPosition);
  const [liked, setLiked] = useState(() => new Set(defaultLiked));
  const [direction, setDirection] = useState(1);
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);

  const track = tracks[index];
  const next = tracks[(index + 1) % tracks.length];

  const goTo = (i: number, dir: number, announce = true) => {
    const n = ((i % tracks.length) + tracks.length) % tracks.length;
    setIndex(n);
    setPosition(0);
    setDirection(dir);
    onTrackChange?.(tracks[n], n);
    if (announce) setMessage(`Now playing ${tracks[n].title} by ${tracks[n].artist}`);
  };

  // Simulated playback clock. Paused while scrubbing.
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  useEffect(() => {
    if (!playing || dragging || !track) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      setPosition((p) => p + dt);
    }, 250);
    return () => window.clearInterval(id);
  }, [playing, dragging, track]);

  // Roll over to the next track at the end.
  useEffect(() => {
    if (track && position >= track.duration) {
      const n = (indexRef.current + 1) % tracks.length;
      const id = requestAnimationFrame(() => {
        setIndex(n);
        setPosition(0);
        setDirection(1);
        onTrackChange?.(tracks[n], n);
        setMessage(`Now playing ${tracks[n].title} by ${tracks[n].artist}`);
      });
      return () => cancelAnimationFrame(id);
    }
  }, [position, track, tracks, onTrackChange]);

  if (!track) {
    return (
      <CardFrame aria-label="Nothing playing" className={className} style={style}>
        <div className="flex items-center gap-4 p-5">
          <span className="grid size-16 place-items-center rounded-[12px] border border-dashed border-[color:var(--bjork-border-strong)] text-[color:var(--bjork-text-soft)]">
            <Play aria-hidden="true" className="size-5" />
          </span>
          <div>
            <p className="text-[14px] font-medium">Nothing playing</p>
            <p className="text-[12px] text-[color:var(--bjork-text-muted)]">Pick something to start a session.</p>
          </div>
        </div>
      </CardFrame>
    );
  }

  const togglePlay = () => {
    setPlaying(!playing);
    onPlayingChange?.(!playing);
  };

  const seek = (s: number) => {
    const v = Math.max(0, Math.min(track.duration - 0.5, s));
    setPosition(v);
    onSeek?.(v);
  };

  const prev = () => {
    if (position > 3) seek(0);
    else goTo(index - 1, -1);
  };

  const isLiked = liked.has(track.id);
  const toggleLike = () => {
    const n = new Set(liked);
    if (isLiked) n.delete(track.id);
    else n.add(track.id);
    setLiked(n);
    onLikeChange?.(track.id, !isLiked);
  };

  const pct = Math.min(1, position / track.duration);

  const seekFromPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * track.duration);
  };

  const onSliderKey = (e: ReactKeyboardEvent) => {
    const map: Record<string, number> = {
      ArrowRight: position + 5,
      ArrowUp: position + 5,
      ArrowLeft: position - 5,
      ArrowDown: position - 5,
      PageUp: position + 30,
      PageDown: position - 30,
      Home: 0,
      End: track.duration - 1,
    };
    if (e.key in map) {
      e.preventDefault();
      seek(map[e.key]);
    }
  };

  const iconBtn = cn(
    "grid size-9 cursor-pointer place-items-center rounded-full text-[color:var(--bjork-text-medium)] transition-[color,background-color,transform] duration-150 hover:bg-[color:var(--bjork-card-hover)] hover:text-[color:var(--bjork-text)] active:scale-[0.92] motion-reduce:transition-none motion-reduce:active:scale-100",
    focusRing,
  );

  return (
    <CardFrame aria-labelledby={titleId} aria-roledescription="media player" className={className} style={style} maxWidth={380}>
      <style href="bjork-now-playing-eq" precedence="default">
        {EQ_KEYFRAMES}
      </style>
      <div className="flex items-center gap-4 p-5 pb-4">
        <div className="relative size-[72px] shrink-0 overflow-hidden rounded-[12px] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.6)]">
          <AnimatePresence initial={false} custom={direction}>
            <motion.div
              key={track.id}
              className="absolute inset-0"
              custom={direction}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: direction * 24, scale: 0.92 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: direction * -24, scale: 0.92 }}
              transition={{ duration: 0.32, ease: ease.out }}
            >
              <Cover track={track} />
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="min-w-0 flex-1">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={track.id}
              initial={{ opacity: 0, y: reduce ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : -6 }}
              transition={{ duration: 0.22, ease: ease.out }}
            >
              <h3 id={titleId} className="truncate text-[15px] font-semibold leading-5">
                {track.title}
              </h3>
              <p className="truncate text-[13px] leading-5 text-[color:var(--bjork-text-medium)]">{track.artist}</p>
              {track.album && (
                <p className="truncate text-[12px] leading-4 text-[color:var(--bjork-text-muted)]">{track.album}</p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <button
          type="button"
          aria-pressed={isLiked}
          aria-label={isLiked ? `Remove ${track.title} from liked songs` : `Like ${track.title}`}
          onClick={toggleLike}
          className={cn(iconBtn, "self-start", isLiked && "text-[color:var(--bjork-accent)] hover:text-[color:var(--bjork-accent)]")}
        >
          <motion.span
            key={String(isLiked)}
            initial={reduce || !isLiked ? false : { scale: 0.6 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 14 }}
            className="grid place-items-center"
          >
            <Heart aria-hidden="true" className="size-[18px]" fill={isLiked ? "currentColor" : "none"} />
          </motion.span>
        </button>
      </div>

      {/* Scrubber */}
      <div className="px-5">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(track.duration)}
          aria-valuenow={Math.round(position)}
          aria-valuetext={`${clock(position)} of ${clock(track.duration)}`}
          onKeyDown={onSliderKey}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragging(true);
            seekFromPointer(e);
          }}
          onPointerMove={(e) => dragging && seekFromPointer(e)}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          className={cn("group relative flex h-5 cursor-pointer touch-none items-center rounded-full", focusRing)}
        >
          <span className="relative h-1 w-full overflow-hidden rounded-full bg-[color:var(--bjork-track)] transition-[height] duration-150 group-hover:h-1.5 motion-reduce:transition-none">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-[color:var(--bjork-text)]"
              style={{ width: `${pct * 100}%` }}
            />
          </span>
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--bjork-text)] shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-[opacity,transform] duration-150 motion-reduce:transition-none",
              dragging ? "scale-100" : "scale-90 opacity-0 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100",
            )}
            style={{ left: `${pct * 100}%` }}
          />
        </div>
        <div className="mt-0.5 flex justify-between text-[11px] leading-4 text-[color:var(--bjork-text-muted)]">
          <span>{clock(position)}</span>
          <span>-{clock(track.duration - position)}</span>
        </div>
      </div>

      {/* Transport */}
      <div className="flex items-center justify-center gap-3 px-5 pb-4 pt-2">
        <button type="button" aria-label="Previous track" onClick={prev} className={iconBtn}>
          <SkipBack aria-hidden="true" className="size-[18px]" fill="currentColor" />
        </button>
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={togglePlay}
          className={cn(
            "grid size-12 cursor-pointer place-items-center rounded-full bg-[color:var(--bjork-text)] text-[color:var(--bjork-card)] shadow-[0_8px_18px_-10px_rgba(0,0,0,0.6)] transition-transform duration-150 active:scale-[0.94] motion-reduce:transition-none motion-reduce:active:scale-100",
            focusRing,
          )}
        >
          {playing ? (
            <Pause aria-hidden="true" className="size-5" fill="currentColor" />
          ) : (
            <Play aria-hidden="true" className="ml-0.5 size-5" fill="currentColor" />
          )}
        </button>
        <button type="button" aria-label="Next track" onClick={() => goTo(index + 1, 1)} className={iconBtn}>
          <SkipForward aria-hidden="true" className="size-[18px]" fill="currentColor" />
        </button>
      </div>

      <div className="flex items-center gap-3 border-t border-[color:var(--bjork-border)] px-5 py-3 text-[12px] leading-4">
        {device && (
          <span className="flex min-w-0 items-center gap-1.5 text-[color:var(--bjork-text-medium)]">
            <Equalizer playing={playing} reduce={reduce} />
            <Speaker aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">{device}</span>
          </span>
        )}
        {next && tracks.length > 1 && (
          <button
            type="button"
            onClick={() => goTo(index + 1, 1)}
            className={cn(
              "ml-auto flex min-w-0 cursor-pointer items-center gap-2 rounded-[6px] text-right text-[color:var(--bjork-text-muted)] transition-colors hover:text-[color:var(--bjork-text)]",
              focusRing,
            )}
          >
            <span className="truncate">
              Next: <span className="text-[color:var(--bjork-text-medium)]">{next.title}</span>
            </span>
            <span aria-hidden="true" className="size-5 shrink-0 overflow-hidden rounded-[4px]">
              <Cover track={next} />
            </span>
          </button>
        )}
      </div>
      <LiveRegion message={message} />
    </CardFrame>
  );
}

function Cover({ track }: { track: Track }) {
  if (track.artworkUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={track.artworkUrl} alt="" className="size-full object-cover" />;
  }
  const [a, b] = track.colors ?? ["#ec5c13", "#1b1b1b"];
  return (
    <span
      aria-hidden="true"
      className="block size-full"
      style={{
        background: `radial-gradient(circle at 30% 75%, ${a} 0 18%, transparent 19%), radial-gradient(circle at 30% 75%, transparent 0 30%, color-mix(in oklab, ${a} 60%, transparent) 31% 33%, transparent 34%), linear-gradient(150deg, ${b}, color-mix(in oklab, ${b} 55%, black))`,
      }}
    />
  );
}

function Equalizer({ playing, reduce }: { playing: boolean; reduce: boolean }) {
  const heights = [0.6, 1, 0.45, 0.8];
  return (
    <span aria-hidden="true" className="flex h-3 items-end gap-[2px]">
      {heights.map((h, i) => (
        <span
          key={i}
          className="w-[2px] origin-bottom rounded-full bg-[color:var(--bjork-accent)]"
          style={{
            height: "100%",
            transform: `scaleY(${playing ? h : 0.25})`,
            animation: playing && !reduce ? `bjork-eq ${0.7 + i * 0.13}s ease-in-out ${i * -0.2}s infinite` : "none",
          }}
        />
      ))}
    </span>
  );
}
