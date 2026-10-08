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

// Exact solution of y'' = -(k/m) y - (d/m) y' for displacement y0 and velocity v0 at time t.
// Returns displacement and velocity together so stepping can be exact, not integrated.
function solveLinear(t: number, c: SpringConfig, y0: number, v0: number): { y: number; v: number } {
  const w0 = Math.sqrt(c.stiffness / c.mass);
  const z = dampingRatio(c);

  if (Math.abs(z - 1) < 1e-9) {
    // Critically damped.
    const e = Math.exp(-w0 * t);
    const b = v0 + w0 * y0;
    return { y: e * (y0 + b * t), v: e * (b - w0 * (y0 + b * t)) };
  }
  if (z < 1) {
    // Underdamped.
    const wd = w0 * Math.sqrt(1 - z * z);
    const a = z * w0;
    const B = (v0 + a * y0) / wd;
    const e = Math.exp(-a * t);
    const cos = Math.cos(wd * t);
    const sin = Math.sin(wd * t);
    return {
      y: e * (y0 * cos + B * sin),
      v: e * (-a * (y0 * cos + B * sin) + wd * (-y0 * sin + B * cos)),
    };
  }
  // Overdamped.
  const s = w0 * Math.sqrt(z * z - 1);
  const r1 = -z * w0 + s;
  const r2 = -z * w0 - s;
  const B = (v0 - r1 * y0) / (r2 - r1);
  const A = y0 - B;
  const e1 = Math.exp(r1 * t);
  const e2 = Math.exp(r2 * t);
  return { y: A * e1 + B * e2, v: A * r1 * e1 + B * r2 * e2 };
}

// Analytic position at time t for a spring from `from` to `to` with initial velocity v0.
export function springAt(t: number, c: SpringConfig, from = 0, to = 1, v0 = 0): number {
  return to + solveLinear(t, c, from - to, v0).y;
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

// Advances the state by dt towards `target`. Uses the exact solution of the linear spring
// (no integration), so it tracks springAt to rounding error at any step size and stays stable
// for stiff configs where a fixed-step integrator drifts.
export function stepSpring(s: SpringState, target: number, c: SpringConfig, dt: number): void {
  if (dt <= 0) return;
  const r = solveLinear(dt, c, s.x - target, s.v);
  s.x = target + r.y;
  s.v = r.v;
}
