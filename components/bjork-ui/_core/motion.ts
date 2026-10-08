// Shared springs, easings and durations. Components import these instead of inventing values.

export const springs = {
  press: { type: "spring", stiffness: 500, damping: 30, mass: 0.6 },
  snappy: { type: "spring", stiffness: 400, damping: 25, mass: 1 },
  standard: { type: "spring", stiffness: 300, damping: 30, mass: 0.8 },
  soft: { type: "spring", stiffness: 200, damping: 25, mass: 1.2 },
  settle: { type: "spring", stiffness: 380, damping: 30, mass: 0.8 },
  blurIn: { type: "spring", stiffness: 400, damping: 28, mass: 0.6 },
} as const;

export const ease = {
  out: [0.23, 1, 0.32, 1],
  inOut: [0.77, 0, 0.175, 1],
  drawer: [0.32, 0.72, 0, 1],
} as const;

export const easeCss = {
  out: "cubic-bezier(0.23,1,0.32,1)",
  inOut: "cubic-bezier(0.77,0,0.175,1)",
  drawer: "cubic-bezier(0.32,0.72,0,1)",
} as const;

export const durations = { press: 140, tooltip: 160, menu: 200, panel: 280 } as const; // ms

// Cubic bezier easing for canvas and rAF code. Returns progress y for input x in [0, 1].
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  const sampleDX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;

  const solveX = (x: number) => {
    let s = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(s) - x;
      if (Math.abs(err) < 1e-6) return s;
      const d = sampleDX(s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    let lo = 0;
    let hi = 1;
    s = x;
    while (lo < hi) {
      const v = sampleX(s);
      if (Math.abs(v - x) < 1e-6) return s;
      if (x > v) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
      if (hi - lo < 1e-7) break;
    }
    return s;
  };

  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return sampleY(solveX(t));
  };
}
