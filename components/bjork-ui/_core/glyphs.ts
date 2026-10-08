// Samples inked pixels of a text string onto a grid. Used for dust, scatter and particle text.

export interface SampleTextOptions {
  text: string;
  font: string;
  width: number;
  height: number;
  step: number;
  align?: "left" | "center";
  baseline?: number;
  dpr?: number;
}

// Returns interleaved x,y in CSS px for every grid point where the glyph is inked (alpha > 128).
export async function sampleText(opts: SampleTextOptions): Promise<Float32Array> {
  if (typeof document === "undefined") return new Float32Array(0);
  const { text, font, width, height, step, align = "left", dpr = 1 } = opts;
  const baseline = opts.baseline ?? height / 2;

  await document.fonts.load(font);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return new Float32Array(0);

  ctx.scale(dpr, dpr);
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#000";
  ctx.fillText(text, align === "center" ? width / 2 : 0, baseline);

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const points: number[] = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const px = Math.min(canvas.width - 1, Math.floor(x * dpr));
      const py = Math.min(canvas.height - 1, Math.floor(y * dpr));
      const alpha = data[(py * canvas.width + px) * 4 + 3];
      if (alpha > 128) points.push(x, y);
    }
  }
  return new Float32Array(points);
}
