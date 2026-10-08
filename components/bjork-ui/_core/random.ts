// Seeded randomness and noise. Deterministic for a given seed, so previews and tests repeat.

// Small fast PRNG. Returns floats in [0, 1).
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a 32-bit.
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Integer lattice hash to [-1, 1].
function latticeHash(seed: number, x: number, y = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export function valueNoise1D(seed: number): (x: number) => number {
  return (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = latticeHash(seed, i);
    const b = latticeHash(seed, i + 1);
    return a + (b - a) * smooth(f);
  };
}

export function fbm1D(seed: number, octaves = 3): (x: number) => number {
  const layers = Array.from({ length: octaves }, (_, o) => valueNoise1D(seed + o * 101));
  let norm = 0;
  for (let o = 0; o < octaves; o++) norm += 0.5 ** o;
  return (x: number) => {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amp * layers[o](x * freq);
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };
}

export function valueNoise2D(seed: number): (x: number, y: number) => number {
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = smooth(x - xi);
    const fy = smooth(y - yi);
    const a = latticeHash(seed, xi, yi);
    const b = latticeHash(seed, xi + 1, yi);
    const c = latticeHash(seed, xi, yi + 1);
    const d = latticeHash(seed, xi + 1, yi + 1);
    const top = a + (b - a) * fx;
    const bottom = c + (d - c) * fx;
    return top + (bottom - top) * fy;
  };
}
