"use client";

import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { Pause, Play } from "lucide-react";
import {
  blockFrame,
  blockToneProps,
  focusRing,
  Reveal,
  SectionHeader,
  useBlockReducedMotion,
  type BlockTone,
} from "@/components/bjork-ui/blocks/marketing-kit";
import { cn } from "@/lib/utils";

export interface Testimonial {
  id: string;
  quote: string;
  name: string;
  role: string;
  company: string;
  /** Image URL. Without it the card shows initials. */
  avatar?: string;
  /** A headline number for the quote, such as "41% fewer failed runs". */
  metric?: { value: string; label: string };
}

export interface WallStat {
  value: string;
  label: string;
}

export interface MarketingTestimonialsWallProps {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  stats?: WallStat[];
  testimonials: Testimonial[];
  /** "drift" scrolls the columns slowly on wide screens; "static" lays them out as a masonry wall. */
  motion?: "drift" | "static";
  /** Seconds for one column to loop. Columns run at slightly different speeds. Default 60. */
  speed?: number;
  /** Cards shown on phones before "Show all". Default 4. */
  collapsedCount?: number;
  tone?: BlockTone;
  className?: string;
}

export const MARKETING_TESTIMONIALS_SAMPLE: MarketingTestimonialsWallProps = {
  eyebrow: "Customers",
  title: "Teams ship agents with fewer surprises.",
  description: "From two-person startups to support teams answering a million tickets a month.",
  stats: [
    { value: "41%", label: "fewer failed runs in the first month" },
    { value: "3.2x", label: "faster to find the step that broke" },
    { value: "1,800", label: "teams tracing in production" },
  ],
  testimonials: [
    {
      id: "t1",
      quote:
        "We used to find out a refund agent was looping from the bill. Now the alert fires on the third retry and the trace shows us exactly which tool returned garbage.",
      name: "Maya Okafor",
      role: "Head of Support Engineering",
      company: "Northbay Outfitters",
      metric: { value: "41%", label: "fewer failed runs" },
    },
    {
      id: "t2",
      quote: "Replay is the feature. Rewind to the step before it broke, change the prompt, run it again. That loop used to take an afternoon.",
      name: "Tomás Ferreira",
      role: "Staff Engineer",
      company: "Ledgerline",
    },
    {
      id: "t3",
      quote: "Two lines in, and our first trace showed a search call we had forgotten we were making on every turn.",
      name: "Priya Raman",
      role: "Founding Engineer",
      company: "Quillstack",
    },
    {
      id: "t4",
      quote: "Cost per run changed how we review prompts. A pull request that doubles token spend now gets caught before it merges.",
      name: "Jonah Lindqvist",
      role: "Engineering Manager",
      company: "Fernway Health",
      metric: { value: "$18k", label: "saved in the first quarter" },
    },
    {
      id: "t5",
      quote: "Masking happens in the SDK, which was the only way legal would let us send traces anywhere at all.",
      name: "Adaeze Nwosu",
      role: "Security Lead",
      company: "Copperleaf Bank",
    },
    {
      id: "t6",
      quote: "The waterfall made the slow step obvious. It was never the model. It was the CRM lookup, every single time.",
      name: "Lena Brandt",
      role: "Platform Engineer",
      company: "Tidewater Freight",
    },
    {
      id: "t7",
      quote: "I keep it open on a second screen during launches. J and K through the steps, R to replay. It feels like a debugger, not a dashboard.",
      name: "Kenji Moriyama",
      role: "AI Engineer",
      company: "Halcyon Labs",
    },
    {
      id: "t8",
      quote: "We moved three agents and four teams onto one project in a week. Everyone looks at the same trace when something goes wrong.",
      name: "Sofia Marchetti",
      role: "Director of Engineering",
      company: "Brightmoor",
    },
    {
      id: "t9",
      quote: "Alerts that read like sentences sounds like marketing until you get paged at 2am and the page tells you what actually happened.",
      name: "Daniel Achterberg",
      role: "SRE",
      company: "Parcelpoint",
    },
  ],
};

const WALL_KEYFRAMES =
  "@keyframes bjork-wall-drift { from { transform: translate3d(0,0,0); } to { transform: translate3d(0,-50%,0); } }";

// Muted tints for initials, picked by name so a person keeps their colour.
const TINTS = ["#ec5c13", "#5f9f78", "#6f86c9", "#c49a3a", "#a8749b", "#4f9aa6"];

function tintFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function toColumns<T>(items: T[], count: number): T[][] {
  const columns: T[][] = Array.from({ length: count }, () => []);
  items.forEach((item, index) => columns[index % count].push(item));
  return columns;
}

/**
 * A wall of customer quotes. On wide screens the columns drift upward at slightly different speeds,
 * pause on hover or focus, and carry a pause button; on phones and under reduced motion the wall is a
 * still list with a "Show all" control.
 */
export function MarketingTestimonialsWall({
  eyebrow,
  title,
  description,
  stats,
  testimonials,
  motion = "drift",
  speed = 60,
  collapsedCount = 4,
  tone = "auto",
  className,
}: MarketingTestimonialsWallProps) {
  const titleId = useId();
  const listId = useId();
  const toneProps = blockToneProps(tone);
  const reduce = useBlockReducedMotion();
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const drift = motion === "drift" && !reduce;
  const visibleOnPhone = expanded ? testimonials : testimonials.slice(0, collapsedCount);
  const hiddenCount = testimonials.length - collapsedCount;

  return (
    <section
      aria-labelledby={titleId}
      {...toneProps}
      className={cn(
        "@container w-full overflow-hidden bg-[var(--bjork-bg)] py-20 font-bjork-alpha text-[color:var(--bjork-text)] @3xl:py-28",
        toneProps.className,
        className,
      )}
    >
      <style>{WALL_KEYFRAMES}</style>
      <div className={blockFrame}>
        <div className="flex flex-col gap-10 @4xl:flex-row @4xl:items-end @4xl:justify-between">
          <SectionHeader id={titleId} eyebrow={eyebrow} title={title} description={description} />
          {stats && stats.length > 0 ? (
            <dl className="grid grid-cols-1 gap-x-8 gap-y-5 @md:grid-cols-3 @4xl:max-w-[520px] @4xl:shrink-0">
              {stats.map((stat) => (
                <div key={stat.label} className="flex flex-col-reverse gap-1 border-l border-[color:var(--bjork-border-strong)] pl-4">
                  <dt className="text-[12.5px] leading-5 text-[color:var(--bjork-text-muted)]">{stat.label}</dt>
                  <dd className="font-bjork-display text-[30px] font-semibold leading-none tracking-[-0.04em] tabular-nums">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        {/* Phones: a still list with a disclosure. */}
        <div className="mt-12 @2xl:hidden">
          <ul id={listId} className="flex flex-col gap-3">
            {visibleOnPhone.map((testimonial) => (
              <li key={testimonial.id}>
                <QuoteCard testimonial={testimonial} />
              </li>
            ))}
          </ul>
          {hiddenCount > 0 ? (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => setExpanded((value) => !value)}
              className={cn(
                "mt-4 h-11 w-full rounded-[13px] border border-[color:var(--bjork-border-strong)] bg-[var(--bjork-surface)] text-[14px] font-medium text-[color:var(--bjork-text)] shadow-[var(--bjork-shadow-soft)] transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none",
                focusRing,
              )}
            >
              {expanded ? "Show fewer" : `Show all ${testimonials.length} stories`}
            </button>
          ) : null}
        </div>

        {/* Tablets and up. */}
        <div className="relative mt-14 hidden @2xl:block">
          {drift ? (
            <>
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  aria-pressed={paused}
                  onClick={() => setPaused((value) => !value)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full border border-[color:var(--bjork-border)] bg-[var(--bjork-surface)] px-3 text-[12px] text-[color:var(--bjork-text-medium)] transition-colors duration-150 hover:text-[color:var(--bjork-text)]",
                    focusRing,
                  )}
                >
                  {paused ? <Play aria-hidden className="size-3" /> : <Pause aria-hidden className="size-3" />}
                  {paused ? "Play" : "Pause"}
                  <span className="sr-only"> scrolling quotes</span>
                </button>
              </div>
              <DriftWall testimonials={testimonials} paused={paused} speed={speed} columns={3} className="hidden @5xl:grid" />
              <DriftWall testimonials={testimonials} paused={paused} speed={speed} columns={2} className="grid @5xl:hidden" />
            </>
          ) : (
            <>
              <StaticWall testimonials={testimonials} columns={3} className="hidden @5xl:grid" />
              <StaticWall testimonials={testimonials} columns={2} className="grid @5xl:hidden" />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function DriftWall({
  testimonials,
  paused,
  speed,
  columns,
  className,
}: {
  testimonials: Testimonial[];
  paused: boolean;
  speed: number;
  columns: number;
  className?: string;
}) {
  const lanes = toColumns(testimonials, columns);
  return (
    <div
      className={cn("group/wall relative h-[680px] gap-3 overflow-hidden", className)}
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        maskImage: "linear-gradient(to bottom, transparent, #000 12%, #000 88%, transparent)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent, #000 12%, #000 88%, transparent)",
      }}
    >
      {lanes.map((lane, laneIndex) => (
        <div key={laneIndex} className="min-w-0">
          <div
            className="flex flex-col will-change-transform [animation-play-state:var(--wall-state)] group-hover/wall:[animation-play-state:paused] group-focus-within/wall:[animation-play-state:paused]"
            style={
              {
                animationName: "bjork-wall-drift",
                animationDuration: `${speed * (1 + laneIndex * 0.18)}s`,
                animationTimingFunction: "linear",
                animationIterationCount: "infinite",
                animationDelay: `${-laneIndex * 7}s`,
                "--wall-state": paused ? "paused" : "running",
              } as CSSProperties
            }
          >
            {/* The second copy closes the loop. Screen readers and keyboards only meet the first. */}
            {[0, 1].map((copy) => (
              <ul
                key={copy}
                aria-hidden={copy === 1 ? true : undefined}
                inert={copy === 1 ? true : undefined}
                className="flex flex-col gap-3 pb-3"
              >
                {lane.map((testimonial) => (
                  <li key={testimonial.id}>
                    <QuoteCard testimonial={testimonial} />
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StaticWall({ testimonials, columns, className }: { testimonials: Testimonial[]; columns: number; className?: string }) {
  const lanes = toColumns(testimonials, columns);
  return (
    <div className={cn("gap-3", className)} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {lanes.map((lane, laneIndex) => (
        <ul key={laneIndex} className="flex min-w-0 flex-col gap-3">
          {lane.map((testimonial, index) => (
            <Reveal key={testimonial.id} as="li" delay={(laneIndex + index) * 0.05}>
              <QuoteCard testimonial={testimonial} />
            </Reveal>
          ))}
        </ul>
      ))}
    </div>
  );
}

function QuoteCard({ testimonial }: { testimonial: Testimonial }) {
  const featured = Boolean(testimonial.metric);
  const tint = tintFor(testimonial.name);
  return (
    <figure
      className={cn(
        "flex flex-col gap-5 rounded-[20px] border p-6",
        featured
          ? "border-[color:var(--bjork-border-strong)] bg-[var(--bjork-surface)] shadow-[var(--bjork-shadow-surface)]"
          : "border-[color:var(--bjork-border)] bg-[var(--bjork-surface)] shadow-[var(--bjork-shadow-panel)]",
      )}
    >
      {testimonial.metric ? (
        <div className="flex items-baseline gap-2.5 border-b border-[color:var(--bjork-border-muted)] pb-4">
          <span className="font-bjork-display text-[34px] font-semibold leading-none tracking-[-0.045em] text-[color:var(--bjork-accent)] tabular-nums">
            {testimonial.metric.value}
          </span>
          <span className="text-[13px] leading-5 text-[color:var(--bjork-text-muted)]">{testimonial.metric.label}</span>
        </div>
      ) : null}
      <blockquote
        className={cn(
          "text-pretty text-[color:var(--bjork-text-strong)]",
          featured ? "text-[16.5px] leading-7 tracking-[-0.01em]" : "text-[15px] leading-[1.65]",
        )}
      >
        <p>&ldquo;{testimonial.quote}&rdquo;</p>
      </blockquote>
      <figcaption className="flex items-center gap-3">
        {testimonial.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={testimonial.avatar} alt="" className="size-9 shrink-0 rounded-full object-cover" />
        ) : (
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-full text-[12px] font-semibold"
            style={{
              color: tint,
              background: `color-mix(in srgb, ${tint} 14%, transparent)`,
              boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tint} 26%, transparent)`,
            }}
          >
            {initials(testimonial.name)}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-medium text-[color:var(--bjork-text)]">{testimonial.name}</span>
          <span className="block truncate text-[12.5px] text-[color:var(--bjork-text-muted)]">
            {testimonial.role}, {testimonial.company}
          </span>
        </span>
      </figcaption>
    </figure>
  );
}
