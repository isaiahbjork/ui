// Shared chart math for the Charts collection: nice ticks, scales, damping, colour and number formatting.
// Pure functions only. Every chart imports what it needs by path.

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Maps v from [d0, d1] to [r0, r1]. Degenerate domains map to the range midpoint.
export function scaleLinear(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const span = d1 - d0;
  if (!(Math.abs(span) > 1e-12)) return () => (r0 + r1) / 2;
  const k = (r1 - r0) / span;
  return (v: number) => r0 + (v - d0) * k;
}

// Frame-rate independent approach: moves `cur` toward `target` with time constant `tau` seconds.
export function damp(cur: number, target: number, tau: number, dt: number): number {
  if (tau <= 0) return target;
  return target + (cur - target) * Math.exp(-dt / tau);
}

// A "nice" step (1, 2, 2.5 or 5 x 10^k) that splits `span` into roughly `count` intervals.
export function niceStep(span: number, count = 5): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1;
  const raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const r = raw / mag;
  const m = r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10;
  return m * mag;
}

// Tick values at a nice step, inclusive of the domain ends when they land on the step.
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!(hi > lo)) return [lo];
  const step = niceStep(hi - lo, count);
  const first = Math.ceil(lo / step - 1e-9);
  const last = Math.floor(hi / step + 1e-9);
  const out: number[] = [];
  for (let n = first; n <= last; n++) out.push(Number((n * step).toFixed(12)));
  return out;
}

// Expands [lo, hi] outward to the nearest nice step, so the outer gridlines sit on round values.
export function niceDomain(lo: number, hi: number, count = 5): [number, number] {
  if (!(hi > lo)) {
    const pad = Math.max(Math.abs(hi) * 0.1, 1);
    return [lo - pad, hi + pad];
  }
  const step = niceStep(hi - lo, count);
  return [Math.floor(lo / step + 1e-9) * step, Math.ceil(hi / step - 1e-9) * step];
}

// Half-pixel snap for crisp 1px hairlines.
export function crisp(v: number): number {
  return Math.round(v) + 0.5;
}

// --- Colour -------------------------------------------------------------------------------------

const rgbCache = new Map<string, [number, number, number, number]>();

// Parses #rgb, #rrggbb and rgba()/rgb() strings. Returns [r, g, b, a].
export function parseColor(c: string): [number, number, number, number] {
  const hit = rgbCache.get(c);
  if (hit) return hit;
  let out: [number, number, number, number] = [0, 0, 0, 1];
  const s = c.trim();
  if (s.startsWith("#")) {
    let h = s.slice(1);
    if (h.length === 3) h = h.split("").map((ch) => ch + ch).join("");
    const n = parseInt(h.slice(0, 6), 16);
    out = [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  } else {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(",").map((x) => parseFloat(x));
      out = [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 1];
    }
  }
  rgbCache.set(c, out);
  return out;
}

// The colour at alpha `a`, multiplied with any alpha the colour already has.
export function withAlpha(c: string, a: number): string {
  const [r, g, b, a0] = parseColor(c);
  return `rgba(${r},${g},${b},${+(a0 * a).toFixed(4)})`;
}

// Mixes two opaque colours in sRGB. t = 0 gives `a`.
export function mixColor(a: string, b: string, t: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  const r = Math.round(lerp(ca[0], cb[0], t));
  const g = Math.round(lerp(ca[1], cb[1], t));
  const bl = Math.round(lerp(ca[2], cb[2], t));
  return `rgb(${r},${g},${bl})`;
}

// --- Numbers ------------------------------------------------------------------------------------

const fmtCache = new Map<string, Intl.NumberFormat>();
function nf(opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", opts);
    fmtCache.set(key, f);
  }
  return f;
}

export function formatNumber(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return "–";
  return nf({ maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(v);
}

export function formatFixed(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "–";
  return nf({ maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
}

// 1,284 / 12.9K / 4.2M. Uses a true minus sign.
export function formatCompact(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return "–";
  const s = nf({ notation: "compact", maximumFractionDigits: digits }).format(Math.abs(v));
  return v < 0 ? `−${s}` : s;
}

export function formatPercent(v: number, digits = 0): string {
  if (!Number.isFinite(v)) return "–";
  const s = nf({ maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Math.abs(v * 100));
  return `${v < 0 ? "−" : ""}${s}%`;
}

// +1.2 / −0.8 / 0. Signed numbers use a true minus and an explicit plus.
export function formatSigned(v: number, format: (n: number) => string = (n) => formatNumber(n)): string {
  if (!Number.isFinite(v)) return "–";
  const body = format(Math.abs(v));
  if (Math.abs(v) < 1e-12) return body;
  return `${v > 0 ? "+" : "−"}${body}`;
}

// Gaussian kernel density at x for a sorted sample, bandwidth h.
export function kde(sample: number[], x: number, h: number): number {
  const n = sample.length;
  if (!n || !(h > 0)) return 0;
  let s = 0;
  const inv = 1 / h;
  for (let i = 0; i < n; i++) {
    const u = (x - sample[i]) * inv;
    if (u > 4 || u < -4) continue;
    s += Math.exp(-0.5 * u * u);
  }
  return s / (n * h * Math.sqrt(2 * Math.PI));
}

// Silverman's rule of thumb bandwidth.
export function silverman(sample: number[]): number {
  const n = sample.length;
  if (n < 2) return 1;
  const mean = sample.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(sample.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const sorted = [...sample].sort((a, b) => a - b);
  const iqr = quantile(sorted, 0.75) - quantile(sorted, 0.25);
  const spread = Math.min(sd, iqr / 1.34) || sd || 1;
  return 0.9 * spread * n ** -0.2;
}

// Linear-interpolated quantile of a sorted array.
export function quantile(sorted: number[], q: number): number {
  const n = sorted.length;
  if (!n) return NaN;
  if (n === 1) return sorted[0];
  const pos = clamp(q, 0, 1) * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(n - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Standard normal sample from a uniform source (Box-Muller).
export function gaussian(rnd: () => number): number {
  const u = Math.max(rnd(), 1e-9);
  const v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// --- Time ---------------------------------------------------------------------------------------

const HOUR = 3600000;
const DAY = 86400000;
const timeFmt = {
  hour: new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "UTC" }),
  day: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
  month: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }),
  monthYear: new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }),
  year: new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "UTC" }),
};

export interface TimeTick {
  t: number;
  label: string;
}

// Calendar-aligned ticks (UTC) for [t0, t1] drawn across `px` pixels, at least `minPx` apart.
export function timeTicks(t0: number, t1: number, px: number, minPx = 64): TimeTick[] {
  const span = t1 - t0;
  if (!(span > 0) || !(px > 0)) return [];
  const maxTicks = Math.max(1, Math.floor(px / minPx));
  const perTick = span / maxTicks;
  const out: TimeTick[] = [];
  const hourSteps = [1, 2, 3, 6, 12];
  for (const k of hourSteps) {
    if (k * HOUR >= perTick) {
      const step = k * HOUR;
      for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
        const d = new Date(t);
        out.push({ t, label: d.getUTCHours() === 0 ? timeFmt.day.format(t) : timeFmt.hour.format(t) });
      }
      return out;
    }
  }
  const daySteps = [1, 2, 3, 7, 14];
  for (const k of daySteps) {
    if (k * DAY >= perTick) {
      const step = k * DAY;
      // Weekly steps land on Mondays.
      const offset = k === 7 || k === 14 ? 4 * DAY : 0;
      for (let t = Math.ceil((t0 - offset) / step) * step + offset; t <= t1; t += step) out.push({ t, label: timeFmt.day.format(t) });
      return out;
    }
  }
  const monthSteps = [1, 2, 3, 6, 12, 24, 60];
  for (const k of monthSteps) {
    if (k * 30.44 * DAY >= perTick) {
      const d0 = new Date(t0);
      let y = d0.getUTCFullYear();
      let m = d0.getUTCMonth();
      // First boundary at or after t0 that is a multiple of k months.
      m = Math.ceil(m / k) * k;
      for (;;) {
        y += Math.floor(m / 12);
        m %= 12;
        const t = Date.UTC(y, m, 1);
        if (t > t1) break;
        if (t >= t0) {
          const label = k >= 12 ? timeFmt.year.format(t) : m === 0 ? timeFmt.monthYear.format(t) : timeFmt.month.format(t);
          out.push({ t, label });
        }
        m += k;
      }
      return out;
    }
  }
  return out;
}

export function formatDateUTC(t: number, style: "day" | "full" = "day"): string {
  if (style === "full") return new Date(t).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return timeFmt.day.format(t);
}
