// SVG path helpers. Path sampling needs the DOM, so it returns zeros on the server.

const resampleCache = new Map<string, Float32Array>();

// Interleaved x,y points at equal arc length along `d`, including both endpoints.
export function resamplePath(
  d: string,
  count: number,
  viewBox?: [number, number, number, number],
): Float32Array {
  if (typeof document === "undefined") return new Float32Array(count * 2);
  const key = `${d}|${count}|${viewBox ? viewBox.join(",") : ""}`;
  const cached = resampleCache.get(key);
  if (cached) return cached;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  svg.style.visibility = "hidden";
  if (viewBox) svg.setAttribute("viewBox", viewBox.join(" "));
  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("d", d);
  svg.appendChild(path);
  document.body.appendChild(svg);

  const out = new Float32Array(count * 2);
  try {
    const total = path.getTotalLength();
    for (let i = 0; i < count; i++) {
      const at = count === 1 ? 0 : (i / (count - 1)) * total;
      const p = path.getPointAtLength(at);
      out[i * 2] = p.x;
      out[i * 2 + 1] = p.y;
    }
  } finally {
    svg.remove();
  }
  resampleCache.set(key, out);
  return out;
}

// Catmull-Rom through interleaved x,y points, converted to cubic beziers. Returns a path `d`.
export function catmullRomToBezier(points: Float32Array, closed: boolean): string {
  const n = Math.floor(points.length / 2);
  if (n === 0) return "";
  const P = (i: number) => {
    let idx = i;
    if (closed) idx = ((i % n) + n) % n;
    else idx = Math.min(n - 1, Math.max(0, i));
    return [points[idx * 2], points[idx * 2 + 1]] as const;
  };
  const f = (v: number) => v.toFixed(2);
  let d = `M${f(points[0])} ${f(points[1])}`;
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2[0])} ${f(p2[1])}`;
  }
  if (closed) d += " Z";
  return d;
}
