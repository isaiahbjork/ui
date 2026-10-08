// Pure spring math, no React. Units: stiffness k, damping d (coefficient), mass m, time in seconds.

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
}

export interface SpringState {
  x: number;
  v: number;
}

// Damping ratio zeta = d / (2 * sqrt(k * m)).
export function dampingRatio(c: SpringConfig): number {
  return c.damping / (2 * Math.sqrt(c.stiffness * c.mass));
}

// Analytic position at time t for a spring from `from` to `to` with initial velocity v0.
export function springAt(t: number, c: SpringConfig, from = 0, to = 1, v0 = 0): number {
  const w0 = Math.sqrt(c.stiffness / c.mass);
  const z = dampingRatio(c);
  const y0 = from - to;
  let y: number;

  if (Math.abs(z - 1) < 1e-9) {
    // Critically damped.
    y = Math.exp(-w0 * t) * (y0 + (v0 + w0 * y0) * t);
  } else if (z < 1) {
    // Underdamped.
    const wd = w0 * Math.sqrt(1 - z * z);
    y = Math.exp(-z * w0 * t) * (y0 * Math.cos(wd * t) + ((v0 + z * w0 * y0) / wd) * Math.sin(wd * t));
  } else {
    // Overdamped.
    const s = w0 * Math.sqrt(z * z - 1);
    const r1 = -z * w0 + s;
    const r2 = -z * w0 - s;
    const B = (v0 - r1 * y0) / (r2 - r1);
    const A = y0 - B;
    y = A * Math.exp(r1 * t) + B * Math.exp(r2 * t);
  }
  return to + y;
}

// Overshoot as a fraction of the total travel. Zero when critically or overdamped.
export function overshoot(c: SpringConfig): number {
  const z = dampingRatio(c);
  if (z >= 1) return 0;
  return Math.exp((-Math.PI * z) / Math.sqrt(1 - z * z));
}

// Seconds until the spring stays within epsilon of its target (fraction of travel).
// Found by scanning backwards from a bound derived from the slowest decay rate.
export function settleTime(c: SpringConfig, epsilon = 0.001): number {
  const w0 = Math.sqrt(c.stiffness / c.mass);
  const z = dampingRatio(c);
  const slowest = z < 1 ? z * w0 : (z - Math.sqrt(z * z - 1)) * w0;
  const tEnd = (Math.log(1 / epsilon) / slowest) * 1.5 + 0.05;
  const steps = 4000;
  const dt = tEnd / steps;
  const band = epsilon;
  let last = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i * dt;
    if (Math.abs(springAt(t, c, 1, 0, 0)) >= band) last = t;
  }
  return last + dt;
}

// Semi-implicit Euler, substepped at 1/240 s. Mutates the state in place.
export function stepSpring(s: SpringState, target: number, c: SpringConfig, dt: number): void {
  const h0 = 1 / 240;
  let remaining = dt;
  while (remaining > 0) {
    const h = Math.min(h0, remaining);
    const a = (-c.stiffness * (s.x - target) - c.damping * s.v) / c.mass;
    s.v += a * h;
    s.x += s.v * h;
    remaining -= h;
  }
}
