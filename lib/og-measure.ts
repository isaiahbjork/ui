// Text measurement for the share cards. Satori lays text out but can't shrink a
// name to fit, so we measure with the same TTF it renders with: advance widths
// from hmtx through the cmap. Kerning (GPOS) is ignored, which makes every
// measurement a touch wider than the render, so a name that fits here fits there.

export interface FontMetrics {
  /** Advance width of `text` at `size` px with Satori's per-glyph letterSpacing. */
  width: (text: string, size: number, letterSpacing?: number) => number;
}

export function readFontMetrics(buf: Buffer): FontMetrics {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tables: Record<string, number> = {};
  const numTables = dv.getUint16(4);
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    const tag = String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
    tables[tag] = dv.getUint32(o + 8);
  }
  const upm = dv.getUint16(tables.head + 18);
  const numHMetrics = dv.getUint16(tables.hhea + 34);
  const advance = (glyph: number) => dv.getUint16(tables.hmtx + 4 * Math.min(glyph, numHMetrics - 1));

  // Unicode BMP subtable, format 4.
  const cmap = tables.cmap;
  let sub = -1;
  for (let i = 0; i < dv.getUint16(cmap + 2); i++) {
    const platform = dv.getUint16(cmap + 4 + i * 8);
    const encoding = dv.getUint16(cmap + 6 + i * 8);
    const offset = dv.getUint32(cmap + 8 + i * 8);
    if (dv.getUint16(cmap + offset) !== 4) continue;
    if ((platform === 3 && encoding === 1) || platform === 0) sub = cmap + offset;
    if (platform === 3) break;
  }
  if (sub < 0) throw new Error("og-measure: no format 4 cmap");
  const segX2 = dv.getUint16(sub + 6);
  const ends = sub + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;

  const glyphOf = (code: number) => {
    for (let i = 0; i < segX2 / 2; i++) {
      if (dv.getUint16(ends + i * 2) < code) continue;
      const start = dv.getUint16(starts + i * 2);
      if (start > code) return 0;
      const delta = dv.getInt16(deltas + i * 2);
      const ro = dv.getUint16(ranges + i * 2);
      if (ro === 0) return (code + delta) & 0xffff;
      const g = dv.getUint16(ranges + i * 2 + ro + 2 * (code - start));
      return g === 0 ? 0 : (g + delta) & 0xffff;
    }
    return 0;
  };

  const cache = new Map<string, number>();
  const em = (text: string) => {
    let units = cache.get(text);
    if (units === undefined) {
      units = 0;
      for (const ch of text) units += advance(glyphOf(ch.codePointAt(0) ?? 32));
      cache.set(text, units);
    }
    return units / upm;
  };

  return {
    width: (text, size, letterSpacing = 0) => em(text) * size + letterSpacing * [...text].length,
  };
}

// Satori wraps at spaces and after hyphens, never inside a word.
export function breakableParts(text: string) {
  return text.split(/\s+/).flatMap((word) => word.split(/(?<=-)/));
}

/** Greedy line count, the way Satori wraps. */
export function lineCount(text: string, maxWidth: number, measure: (s: string) => number) {
  let lines = 1;
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (!line || measure(next) <= maxWidth) line = next;
    else {
      lines += 1;
      line = word;
    }
  }
  return lines;
}
