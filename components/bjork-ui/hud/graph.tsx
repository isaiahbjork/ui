"use client";

import { useId, useState, type CSSProperties } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { useReducedMotion } from "framer-motion";
import { BJORK_PALETTE, type BjorkTone } from "@/components/bjork-ui/_core/palette";
import { useBjorkTone } from "@/components/bjork-ui/_core/tone";
import { surfaceVars } from "@/components/bjork-ui/_core/surface";

interface HudAreaChartPoint {
  time: string;
  value: number;
}

interface HudAreaChartProps {
  showYAxis: boolean;
  data: HudAreaChartPoint[];
  /** Fill under the line. Defaults to the ember accent. */
  gradientColor?: string;
  /** Line colour. Defaults to the ember accent. */
  borderColor?: string;
  /** Gridline colour. Defaults to the surface border token. */
  dotColor?: string;
  /** @deprecated The plot uses hairline gridlines now. Accepted so existing call sites still compile. */
  dotSize?: number;
  /** Gridline opacity. */
  dotOpacity?: number;
  scale?: number;
  /** Follows the theme when omitted. */
  tone?: BjorkTone;
}

const formatValue = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function HudAreaChart({
  showYAxis = false,
  data = [],
  gradientColor,
  borderColor,
  dotColor,
  dotOpacity,
  scale = 1,
  tone: toneProp,
}: HudAreaChartProps) {
  const tone = useBjorkTone(toneProp);
  const pal = BJORK_PALETTE[tone];
  const reduce = !!useReducedMotion();
  const gradientId = `hud-graph-fill-${useId().replace(/:/g, "")}`;

  const line = borderColor ?? pal.accent;
  const fill = gradientColor ?? pal.accent;
  const grid = dotColor ?? pal.border;

  const [hovered, setHovered] = useState<HudAreaChartPoint | null>(null);
  const latest = data.length > 0 ? data[data.length - 1] : null;
  const shown = hovered ?? latest;

  const handleMouseMove = (state: { activePayload?: Array<{ payload: HudAreaChartPoint }> }) => {
    const payload = state?.activePayload?.[0]?.payload;
    if (payload) setHovered({ time: payload.time, value: payload.value });
  };

  const axisTick = { fill: pal.textMuted, fontSize: 11, className: "font-mono tabular-nums" };

  const cardVars = surfaceVars(tone) as CSSProperties;

  return (
    <div
      className="relative h-80 w-96"
      style={{ transform: `scale(${scale})`, transformOrigin: "center center" }}
    >
      <div
        className="flex h-full w-full flex-col rounded-[16px] border border-[color:var(--bjork-border)] bg-[color:var(--bjork-surface)] p-4 shadow-[var(--bjork-shadow-surface)]"
        style={cardVars}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span
            className="font-mono text-[11px] uppercase tracking-[0.08em] tabular-nums"
            style={{ color: pal.textMuted }}
          >
            {hovered ? hovered.time : latest ? `Latest · ${latest.time}` : "Latest"}
          </span>
          <span className="font-mono text-[11px] tabular-nums" style={{ color: pal.text }}>
            {shown ? formatValue.format(shown.value) : "--"}
          </span>
        </div>

        <div className="mt-3 min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 6, right: 6, left: 0, bottom: 0 }}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHovered(null)}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={fill} stopOpacity={0.26} />
                  <stop offset="65%" stopColor={fill} stopOpacity={0.06} />
                  <stop offset="100%" stopColor={fill} stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid vertical={false} stroke={grid} strokeOpacity={dotOpacity ?? 1} strokeWidth={1} />

              <XAxis
                dataKey="time"
                axisLine={false}
                tickLine={false}
                tick={axisTick}
                interval="preserveStartEnd"
                minTickGap={24}
                height={22}
                tickMargin={6}
              />
              <YAxis hide={!showYAxis} axisLine={false} tickLine={false} tick={axisTick} width={36} tickMargin={6} />

              <Area
                type="monotone"
                dataKey="value"
                stroke={line}
                strokeWidth={1.5}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{ r: 3, fill: line, stroke: pal.surface, strokeWidth: 1.5 }}
                isAnimationActive={!reduce}
                animationDuration={900}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
