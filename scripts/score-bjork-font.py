"""Score Bjork Grotesk builds.

    python scripts/score-bjork-font.py                       # latest Alpha + Display Regular
    BJORK_SCORE_PROFILE=display python scripts/score-bjork-font.py
    BJORK_SCORE_FONT=path/to/font.woff2 python scripts/score-bjork-font.py
    python scripts/score-bjork-font.py --family BjorkGroteskAlpha v13   # all six styles
    python scripts/score-bjork-font.py --compare                     # previous vs current release
    BJORK_SEARCH=1 python scripts/score-bjork-font.py                # grid search over generator knobs

Two scores are reported:

* `legacy` - the original metric, unchanged: distance from Geist and density targets
  tuned around v12. It rewards staying close to the previous release, not quality.
* `quality` - measurable type-design correctness: hmtx/outline consistency (FreeType
  vs CoreText positioning), truly tabular figures, x-height alignment, stroke contrast,
  composite metrics, baseline integrity, vertical metrics, OpenType features, italic
  angle vs metadata, spacing/kerning coherence with Geist and pair collisions.
"""

import itertools
import json
import math
import os
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

import numpy as np
from fontTools.pens.basePen import BasePen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
GENERATOR = ROOT / "scripts/generate-bjork-font.py"
GEIST_CANDIDATES = (
    ROOT / "node_modules/next/dist/next-devtools/server/font/geist-latin.woff2",
    ROOT / "node_modules/next/dist/client/components/react-dev-overlay/font/geist-latin.woff2",
)
GEIST = next((p for p in GEIST_CANDIDATES if p.exists()), GEIST_CANDIDATES[0])
FONTS = Path(os.getenv("BJORK_FONTS_DIR", ROOT / "public/fonts"))
RELEASES = {"BjorkGroteskAlpha": ("v12", "v13"), "BjorkGroteskDisplay": ("v2", "v3")}
ALPHA_REGULAR = FONTS / f"BjorkGroteskAlpha-Regular-{RELEASES['BjorkGroteskAlpha'][1]}.woff2"
DISPLAY_REGULAR = FONTS / f"BjorkGroteskDisplay-Regular-{RELEASES['BjorkGroteskDisplay'][1]}.woff2"
FK_RASTER = FONTS / "FKRasterGroteskTrial-Rounded.woff2"
STYLES = ("Regular", "Medium", "Semibold", "Bold", "Italic", "BoldItalic")

TEXT_SAMPLES = [
    ("brand", "BJORK UI FONT", 96),
    ("accent_brand", "BJORK UI  Bjork  facade", 72),
    ("ui", "Component archive 05.13.26", 32),
    ("lower", "Quiet grotesk systems for Bjork UI", 40),
    ("small", "Review Bjork UI specimen 12,840 active users", 18),
    ("numbers", "0123456789 12,840 04:19 38ms", 36),
]

KEY_CHARS = "BJORKUIQRGatekyrst0123456789"
SIGNATURE_CHARS = "BJORKQRKktayg"
LOWER = "abcdefghijklmnopqrstuvwxyz"
DIGITS = ("zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine")


# ---------------------------------------------------------------------------
# legacy score (unchanged maths)


def instantiate_font(source: Path, weight: int = 400) -> TTFont:
    from fontTools.varLib import instancer

    font = TTFont(source)
    if "fvar" in font:
        font = instancer.instantiateVariableFont(font, {"wght": weight}, inplace=False)
    return font


def save_ttf(source: Path, destination: Path) -> None:
    font = TTFont(source)
    font.flavor = None
    font.save(destination)


def glyph_metrics(font: TTFont, chars: str) -> dict[str, dict[str, float]]:
    cmap = font.getBestCmap()
    glyf = font["glyf"]
    hmtx = font["hmtx"]
    out = {}
    units = font["head"].unitsPerEm
    for char in chars:
        glyph_name = cmap.get(ord(char))
        if not glyph_name:
            continue
        glyph = glyf[glyph_name]
        glyph.recalcBounds(glyf)
        advance, lsb = hmtx[glyph_name]
        x_min = glyph.xMin or 0
        y_min = glyph.yMin or 0
        x_max = glyph.xMax or 0
        y_max = glyph.yMax or 0
        out[char] = {
            "advance": advance / units,
            "width": (x_max - x_min) / units,
            "height": (y_max - y_min) / units,
            "lsb": lsb / units,
            "x_min": x_min / units,
            "x_max": x_max / units,
            "y_min": y_min / units,
            "y_max": y_max / units,
        }
    return out


def metric_distance(a, b, chars: str) -> float:
    values = []
    for char in chars:
        if char not in a or char not in b:
            continue
        for key in ("advance", "width", "height", "lsb", "x_min", "x_max", "y_min", "y_max"):
            values.append(abs(a[char][key] - b[char][key]))
    return float(np.mean(values)) if values else 0


def render_vector(font_path: Path) -> np.ndarray:
    with tempfile.NamedTemporaryFile(suffix=".ttf") as tmp:
        save_ttf(font_path, Path(tmp.name))
        strips = []
        for _label, text, size in TEXT_SAMPLES:
            font = ImageFont.truetype(tmp.name, size=size)
            image = Image.new("L", (1600, 180), 0)
            draw = ImageDraw.Draw(image)
            draw.text((18, 28), text, font=font, fill=255)
            box = image.getbbox()
            if box:
                crop = image.crop(box).resize((360, 64))
            else:
                crop = Image.new("L", (360, 64), 0)
            strips.append(np.asarray(crop, dtype=np.float32).reshape(-1) / 255)
        return np.concatenate(strips)


def render_density(font_path: Path, text: str, size: int) -> float:
    with tempfile.NamedTemporaryFile(suffix=".ttf") as tmp:
        save_ttf(font_path, Path(tmp.name))
        font = ImageFont.truetype(tmp.name, size=size)
        image = Image.new("L", (1400, 180), 0)
        draw = ImageDraw.Draw(image)
        draw.text((18, 38), text, font=font, fill=255)
        box = image.getbbox()
        if not box:
            return 0
        crop = np.asarray(image.crop(box), dtype=np.float32) / 255
        return float(np.mean(crop))


def rhythm_score(metrics) -> float:
    lower_advances = np.array([metrics[c]["advance"] for c in LOWER if c in metrics])
    digit_advances = np.array([metrics[c]["advance"] for c in "0123456789" if c in metrics])
    lower_cv = float(np.std(lower_advances) / max(np.mean(lower_advances), 0.001))
    digit_cv = float(np.std(digit_advances) / max(np.mean(digit_advances), 0.001))
    return max(0, 1 - abs(lower_cv - 0.29) * 2.2) * 0.65 + max(0, 1 - digit_cv * 18) * 0.35


def closeness(value: float, target: float, tolerance: float) -> float:
    return max(0, 1 - abs(value - target) / tolerance)


def score_current(font_path: Path, profile: str = "alpha") -> dict[str, float]:
    geist_font = instantiate_font(GEIST, 400)
    bjork_font = TTFont(font_path)
    geist_metrics = glyph_metrics(geist_font, KEY_CHARS + LOWER)
    bjork_metrics = glyph_metrics(bjork_font, KEY_CHARS + LOWER)

    metric_diff = metric_distance(bjork_metrics, geist_metrics, KEY_CHARS)
    lower_diff = metric_distance(bjork_metrics, geist_metrics, LOWER)
    signature_diff = metric_distance(bjork_metrics, geist_metrics, SIGNATURE_CHARS)
    rhythm = rhythm_score(bjork_metrics)

    geist_vector = render_vector(GEIST)
    bjork_vector = render_vector(font_path)
    raster_vector = render_vector(FK_RASTER)
    visual_from_geist = float(np.mean(np.abs(bjork_vector - geist_vector)))
    visual_from_raster = float(np.mean(np.abs(bjork_vector - raster_vector)))
    small_density_ratio = render_density(font_path, "Review Bjork UI specimen 12,840", 16) / max(
        render_density(GEIST, "Review Bjork UI specimen 12,840", 16), 0.001
    )
    display_density_ratio = render_density(font_path, "BJORK UI FONT", 72) / max(
        render_density(GEIST, "BJORK UI FONT", 72), 0.001
    )

    if profile == "display":
        distinct = closeness(visual_from_geist, 0.16, 0.08)
        density = closeness(display_density_ratio, 0.98, 0.18)
        small_density = closeness(small_density_ratio, 0.94, 0.2)
        signature = closeness(signature_diff, 0.048, 0.035)
        metric_control = max(0, 1 - max(0, metric_diff - 0.13) * 4)
        lowercase_control = max(0, 1 - max(0, lower_diff - 0.07) * 6)
    else:
        distinct = closeness(visual_from_geist, 0.12, 0.055)
        density = closeness(display_density_ratio, 0.9, 0.16)
        small_density = closeness(small_density_ratio, 0.88, 0.14)
        signature = closeness(signature_diff, 0.032, 0.03)
        metric_control = max(0, 1 - max(0, metric_diff - 0.075) * 4)
        lowercase_control = max(0, 1 - max(0, lower_diff - 0.045) * 7)

    not_gimmick = max(0, min(1, (visual_from_raster - 0.16) / 0.12))
    score = (
        distinct * 0.2
        + not_gimmick * 0.12
        + metric_control * 0.15
        + lowercase_control * 0.14
        + rhythm * 0.15
        + density * 0.1
        + small_density * 0.08
        + signature * 0.06
    )

    return {
        "score": round(score * 100, 2),
        "profile": profile,
        "visual_from_geist": round(visual_from_geist, 5),
        "visual_from_raster": round(visual_from_raster, 5),
        "metric_diff_key": round(metric_diff, 5),
        "metric_diff_lower": round(lower_diff, 5),
        "signature_diff": round(signature_diff, 5),
        "rhythm": round(rhythm, 5),
        "small_density_ratio": round(small_density_ratio, 5),
        "display_density_ratio": round(display_density_ratio, 5),
    }


# ---------------------------------------------------------------------------
# quality score


class _Flatten(BasePen):
    """Flattened outline: polygon points plus left/right ink extent per sample row."""

    def __init__(self, glyphset=None, ys=None):
        super().__init__(glyphset)
        self.ys = ys or []
        self.left = [math.inf] * len(self.ys)
        self.right = [-math.inf] * len(self.ys)
        self.points = []
        self.start = self.cur = None

    def _moveTo(self, p):
        self.start = self.cur = p
        self.points.append(p)

    def _lineTo(self, p):
        self._seg(self.cur, p)
        self.cur = p

    def _qCurveToOne(self, p1, p2):
        p0 = self.cur
        for i in range(1, 9):
            t = i / 8
            u = 1 - t
            pt = (u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1])
            self._seg(self.cur, pt)
            self.cur = pt

    def _curveToOne(self, p1, p2, p3):
        p0 = self.cur
        for i in range(1, 9):
            t = i / 8
            u = 1 - t
            pt = tuple(u**3 * a + 3 * u * u * t * b + 3 * u * t * t * c + t**3 * d for a, b, c, d in zip(p0, p1, p2, p3))
            self._seg(self.cur, pt)
            self.cur = pt

    def _closePath(self):
        if self.cur is not None and self.start is not None and self.cur != self.start:
            self._seg(self.cur, self.start)
        self.cur = self.start

    _endPath = _closePath

    def _seg(self, a, b):
        self.points.append(b)
        (x0, y0), (x1, y1) = a, b
        if y0 == y1 or not self.ys:
            return
        lo, hi = min(y0, y1), max(y0, y1)
        i0 = int(np.searchsorted(self.ys, lo, "left"))
        i1 = int(np.searchsorted(self.ys, hi, "right"))
        for i in range(i0, i1):
            x = x0 + (self.ys[i] - y0) * (x1 - x0) / (y1 - y0)
            self.left[i] = min(self.left[i], x)
            self.right[i] = max(self.right[i], x)


ROWS = list(range(-320, 1000, 6))


def row(y):
    return int(round((y - ROWS[0]) / 6))


def draw_flat(glyf, name, pen):
    """Draw a glyph in stored glyf coordinates, components resolved (no hmtx shift)."""
    coords, ends, flags = glyf[name].getCoordinates(glyf)
    if not len(coords):
        return
    glyph = Glyph()
    glyph.numberOfContours = len(ends)
    glyph.coordinates = coords
    glyph.endPtsOfContours = list(ends)
    glyph.flags = flags
    glyph.draw(pen, glyf)


class Face:
    """A font read the way CoreText draws it: glyf coordinates as stored."""

    def __init__(self, path, weight=None):
        self.path = Path(path)
        self.font = instantiate_font(self.path, weight or 400)
        self.glyf = self.font["glyf"]
        self.hmtx = self.font["hmtx"]
        self.cmap = self.font.getBestCmap()
        self._flat = {}
        self._kern = None

    def name(self, char):
        return self.cmap.get(ord(char))

    def flat(self, name):
        if name not in self._flat:
            pen = _Flatten(None, ROWS)
            draw_flat(self.glyf, name, pen)
            self._flat[name] = pen
        return self._flat[name]

    def bounds(self, name):
        pts = self.flat(name).points
        if not pts:
            return None
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        return min(xs), min(ys), max(xs), max(ys)

    def contour_bounds(self, name):
        pen = RecordingPen()
        draw_flat(self.glyf, name, pen)
        out, cur = [], []
        for op, args in pen.value:
            cur.append((op, args))
            if op in ("closePath", "endPath"):
                f = _Flatten()
                for o, a in cur:
                    getattr(f, o)(*a)
                xs, ys = [p[0] for p in f.points], [p[1] for p in f.points]
                out.append((min(xs), min(ys), max(xs), max(ys)))
                cur = []
        return out

    def single_subst(self, tag):
        mapping = {}
        if "GSUB" not in self.font:
            return mapping
        gsub = self.font["GSUB"].table
        for record in gsub.FeatureList.FeatureRecord:
            if record.FeatureTag != tag:
                continue
            for index in record.Feature.LookupListIndex:
                lookup = gsub.LookupList.Lookup[index]
                for sub in lookup.SubTable:
                    if lookup.LookupType == 7:
                        sub = sub.ExtSubTable
                    mapping.update(getattr(sub, "mapping", {}) or {})
        return mapping

    def features(self):
        tags = set()
        for tag in ("GSUB", "GPOS"):
            if tag in self.font:
                tags |= {r.FeatureTag for r in self.font[tag].table.FeatureList.FeatureRecord}
        return tags

    def kern(self, a, b):
        if self._kern is None:
            gpos = self.font["GPOS"].table
            idx = sorted({i for r in gpos.FeatureList.FeatureRecord if r.FeatureTag == "kern" for i in r.Feature.LookupListIndex})
            self._kern = []
            for i in idx:
                lookup = gpos.LookupList.Lookup[i]
                subs = []
                for sub in lookup.SubTable:
                    if lookup.LookupType == 9:
                        sub = sub.ExtSubTable
                    glyphs = sub.Coverage.glyphs
                    if sub.Format == 1:
                        pairs = {}
                        for first, ps in zip(glyphs, sub.PairSet):
                            for rec in ps.PairValueRecord:
                                pairs[(first, rec.SecondGlyph)] = getattr(rec.Value1, "XAdvance", 0) or 0
                        subs.append((1, set(glyphs), pairs))
                    else:
                        subs.append((2, set(glyphs), sub))
                self._kern.append(subs)
        total = 0
        for subs in self._kern:
            for fmt, cov, data in subs:
                if a not in cov:
                    continue
                if fmt == 1:
                    if (a, b) not in data:
                        continue
                    total += data[(a, b)]
                    break
                c1 = data.ClassDef1.classDefs.get(a, 0)
                c2 = data.ClassDef2.classDefs.get(b, 0)
                total += getattr(data.Class1Record[c1].Class2Record[c2].Value1, "XAdvance", 0) or 0
                break
        return total

    def gap(self, a, b):
        fa, fb = self.flat(a), self.flat(b)
        adv = self.hmtx[a][0] + self.kern(a, b)
        best = math.inf
        for i in range(len(ROWS)):
            if fa.right[i] > -math.inf and fb.left[i] < math.inf:
                best = min(best, adv - fa.right[i] + fb.left[i])
        return best if best < math.inf else None


def _top_below(face, char, limit):
    name = face.name(char)
    ys = [p[1] for p in face.flat(name).points if p[1] < limit]
    return max(ys) if ys else None


def stem_slant(face, char="l"):
    """Angle (degrees, forward positive) of the left edge of a straight stem."""
    f = face.flat(face.name(char))
    rows = [(ROWS[i], f.left[i]) for i in range(len(ROWS)) if 120 <= ROWS[i] <= 520 and f.left[i] < math.inf]
    if len(rows) < 5:
        return 0.0
    ys, xs = np.array(rows).T
    slope = np.polyfit(ys, xs, 1)[0]
    return math.degrees(math.atan(slope))


def quality(path, geist_weight=None) -> dict:
    face = Face(path)
    font = face.font
    order = font.getGlyphOrder()
    report = {}

    # 1. hmtx LSB == outline xMin (else FreeType and CoreText place glyphs differently)
    bad = 0
    for name in order:
        g = face.glyf[name]
        g.recalcBounds(face.glyf)
        if g.numberOfContours and face.hmtx[name][1] != g.xMin:
            bad += 1
    report["lsb_mismatch"] = bad
    s_lsb = 1 - bad / len(order)

    # 2. figures: tnum must be tabular, pnum must be proportional
    tnum = face.single_subst("tnum")
    pnum = face.single_subst("pnum")
    default = [face.name(c) for c in "0123456789"]
    tab = [face.hmtx[tnum.get(g, g)][0] for g in default]
    prop = [face.hmtx[pnum.get(tnum.get(g, g), pnum.get(g, g))][0] for g in default]
    report["tnum_advances"] = sorted(set(tab))
    report["pnum_cv"] = round(float(np.std(prop) / np.mean(prop)), 4)
    s_tab = 1.0 if len(set(tab)) == 1 else max(0.0, 1 - 25 * float(np.std(tab) / np.mean(tab)))
    s_pnum = 1.0 if report["pnum_cv"] > 0.03 else 0.0

    # 3. x-height alignment over every lowercase group
    x_top = face.bounds(face.name("x"))[3]
    limit = x_top + 50
    flat = {c: _top_below(face, c, limit) for c in "xzvwyuk"}
    flat["ı"] = face.bounds(face.cmap[0x131])[3] if 0x131 in face.cmap else None
    flat["i"] = _top_below(face, "i", limit)
    flat["j"] = _top_below(face, "j", limit)
    rounds = {c: _top_below(face, c, limit + 20) for c in "ocenmhbdpqags"}
    flat_v = [v for v in flat.values() if v is not None]
    round_v = [v for v in rounds.values() if v is not None]
    report["xheight_flat"] = {k: round(v) for k, v in flat.items() if v is not None}
    report["xheight_round"] = {k: round(v) for k, v in rounds.items() if v is not None}
    s_xh = max(0.0, 1 - (np.std(flat_v) / 3 + np.std(round_v) / 5) / 2)
    report["os2_sxHeight"] = font["OS/2"].sxHeight

    # 4. stroke contrast: vertical stem vs horizontal (o top) - Geist runs 1.04-1.40
    i_b = face.bounds(face.name("l"))
    v_stem = None
    lf = face.flat(face.name("l"))
    v_stem = lf.right[row(300)] - lf.left[row(300)]
    outer, inner = sorted(face.contour_bounds(face.name("o")), key=lambda b: (b[2] - b[0]) * (b[3] - b[1]), reverse=True)[:2]
    h_top = outer[3] - inner[3]
    contrast = v_stem / h_top if h_top else 0
    report["contrast_v_over_h"] = round(contrast, 3)
    italic = bool(font["post"].italicAngle) or bool(font["OS/2"].fsSelection & 1)
    if italic:
        contrast *= 1  # measured horizontally; slant barely changes it
    s_contrast = 1.0 if 1.0 <= contrast <= 1.42 else max(0.0, 1 - min(abs(contrast - 1.0), abs(contrast - 1.42)) * 6)

    # 5. composites keep their base metrics (e/é, o/ö, dotless i/i)
    same = total = 0
    for cp, name in face.cmap.items():
        decomposed = unicodedata.normalize("NFD", chr(cp))
        if len(decomposed) < 2 or not unicodedata.category(chr(cp)).startswith("L"):
            continue
        base = face.cmap.get(ord(decomposed[0]))
        if not base:
            continue
        total += 1
        same += abs(face.hmtx[name][0] - face.hmtx[base][0]) <= 1
    report["composite_metric_match"] = f"{same}/{total}"
    s_comp = same / total if total else 1.0

    # 6. flat terminals sit on the baseline
    flat_bottoms = "ABDEFHIKLMNPRTVWXYZhiklmnrvwxz"
    below = [c for c in flat_bottoms if face.bounds(face.name(c))[1] < -1]
    report["below_baseline"] = "".join(below)
    s_base = 1 - len(below) / len(flat_bottoms)

    # 7. vertical metrics
    os2, hhea = font["OS/2"], font["hhea"]
    marks = set()
    if "GDEF" in font and font["GDEF"].table.GlyphClassDef:
        marks = {g for g, c in font["GDEF"].table.GlyphClassDef.classDefs.items() if c == 3}
    y_max = max(face.glyf[g].yMax for g in order if face.glyf[g].numberOfContours and g not in marks)
    y_min = min(face.glyf[g].yMin for g in order if face.glyf[g].numberOfContours and g not in marks)
    checks = [
        hhea.ascent >= y_max - 20,
        -hhea.descent >= -y_min - 20,
        os2.usWinAscent >= y_max,
        os2.usWinDescent >= -y_min,
        (os2.sTypoAscender, os2.sTypoDescender, os2.sTypoLineGap) == (hhea.ascent, hhea.descent, hhea.lineGap),
        bool(os2.fsSelection & (1 << 7)),
        abs(os2.sxHeight - x_top) <= 2,
        abs(os2.sCapHeight - face.bounds(face.name("H"))[3]) <= 2,
    ]
    report["vertical_metrics_ok"] = f"{sum(checks)}/{len(checks)}"
    s_vm = sum(checks) / len(checks)

    # 8. OpenType features
    need = {"kern", "liga", "tnum", "pnum", "frac", "mark", "ccmp"}
    have = face.features()
    report["features"] = sorted(have)
    s_feat = len(need & have) / len(need)

    # 9. italic angle: measured stem slant vs post.italicAngle and caret
    slant = stem_slant(face, "l")
    report["measured_slant_deg"] = round(slant, 2)
    report["post_italicAngle"] = font["post"].italicAngle
    if italic or abs(slant) > 1:
        meta_ok = abs(-font["post"].italicAngle - slant) <= 0.6
        caret = math.degrees(math.atan2(hhea.caretSlopeRun, hhea.caretSlopeRise)) if hhea.caretSlopeRise else 90
        caret_ok = abs(caret - slant) <= 0.6
        range_ok = 6 <= slant <= 13
        s_italic = (meta_ok + caret_ok + 2 * range_ok) / 4
    else:
        s_italic = 1.0

    # 10. spacing + kerning coherence with Geist (closest approach of every letter pair)
    w = geist_weight or {400: 380, 500: 470, 600: 580, 700: 720}.get(os2.usWeightClass, 400)
    ref = Face(GEIST, w)
    letters = "aehilmnorstuvy" + "ABEHJKORTV"
    gaps, ref_gaps = [], []
    collisions = []
    for a in letters:
        for b in letters:
            na, nb = face.name(a), face.name(b)
            g1 = face.gap(na, nb)
            g0 = ref.gap(ref.name(a), ref.name(b))
            if g1 is None or g0 is None:
                continue
            gaps.append(g1)
            ref_gaps.append(g0)
            if g1 < 25 and g0 >= 25:
                collisions.append(a + b)
    gaps, ref_gaps = np.array(gaps), np.array(ref_gaps)
    slope, offset = np.polyfit(ref_gaps, gaps, 1)
    residual = np.abs(gaps - (slope * ref_gaps + offset))
    report["spacing_residual_p90"] = round(float(np.percentile(residual, 90)), 2)
    report["spacing_fit"] = [round(float(slope), 3), round(float(offset), 1)]
    report["collisions"] = collisions[:12]
    s_space = max(0.0, 1 - float(np.percentile(residual, 90)) / 40)
    s_coll = max(0.0, 1 - len(collisions) / 6)

    weights = {
        "lsb": (s_lsb, 0.12),
        "tabular": (s_tab, 0.10),
        "pnum": (s_pnum, 0.03),
        "xheight": (s_xh, 0.10),
        "contrast": (s_contrast, 0.10),
        "composites": (s_comp, 0.08),
        "baseline": (s_base, 0.07),
        "vertical_metrics": (s_vm, 0.07),
        "features": (s_feat, 0.05),
        "italic": (s_italic, 0.08),
        "spacing": (s_space, 0.12),
        "collisions": (s_coll, 0.08),
    }
    report["parts"] = {k: round(v, 3) for k, (v, _) in weights.items()}
    report["quality"] = round(100 * sum(v * wt for v, wt in weights.values()), 2)
    return report


def family(prefix: str, version: str) -> dict:
    out = {}
    stems = {}
    for style in STYLES:
        path = FONTS / f"{prefix}-{style}-{version}.woff2"
        if not path.exists():
            continue
        q = quality(path)
        out[style] = {"quality": q["quality"], "parts": q["parts"], "contrast": q["contrast_v_over_h"], "slant": q["measured_slant_deg"]}
        if style in ("Regular", "Medium", "Semibold", "Bold"):
            face = Face(path)
            f = face.flat(face.name("l"))
            stems[style] = f.right[row(300)] - f.left[row(300)]
    steps = [math.log(stems[b] / stems[a]) for a, b in zip(("Regular", "Medium", "Semibold"), ("Medium", "Semibold", "Bold")) if a in stems and b in stems]
    evenness = 1 - float(np.std(steps) / np.mean(steps)) if steps else 0
    out["stems"] = {k: round(v, 1) for k, v in stems.items()}
    out["weight_step_evenness"] = round(evenness, 3)
    qs = [v["quality"] for k, v in out.items() if isinstance(v, dict) and "quality" in v]
    out["family_quality"] = round(0.9 * float(np.mean(qs)) + 10 * max(0.0, evenness), 2)
    return out


# ---------------------------------------------------------------------------
# search


def generate_candidate(params: dict[str, str], version: str, out_dir: Path) -> Path:
    env = os.environ.copy()
    env.update(params)
    env["BJORK_VERSION"] = version
    env["BJORK_ONLY_REGULAR"] = "1"
    env["BJORK_OUT_DIR"] = str(out_dir)
    subprocess.run([sys.executable, str(GENERATOR)], cwd=ROOT, env=env, check=True, stdout=subprocess.DEVNULL)
    prefix = env.get("BJORK_PREFIX", "BjorkGroteskAlpha")
    return out_dir / f"{prefix}-Regular-{version}.woff2"


def search() -> None:
    profile = os.getenv("BJORK_SCORE_PROFILE", "alpha")
    grid = {
        "BJORK_STEM_SCALE": ["0.96", "1.0", "1.04"],
        "BJORK_COMPACT_FACTOR": ["0.87", "0.885", "0.9"] if profile == "display" else ["0.91", "0.918", "0.93"],
        "BJORK_XHEIGHT_FACTOR": ["1.02", "1.035"],
        "BJORK_DNA_STRENGTH": ["0.8", "1.0", "1.2"],
    }
    keys = list(grid)
    rows = []
    with tempfile.TemporaryDirectory() as tmp:
        for index, values in enumerate(itertools.product(*(grid[key] for key in keys))):
            params = dict(zip(keys, values))
            params["BJORK_PREFIX"] = "BjorkGroteskDisplay" if profile == "display" else "BjorkGroteskAlpha"
            font_path = generate_candidate(params, f"search{index}", Path(tmp))
            legacy = score_current(font_path, profile)
            q = quality(font_path)
            rows.append({"quality": q["quality"], "legacy": legacy["score"], **params})
    rows.sort(key=lambda row: (row["quality"], row["legacy"]), reverse=True)
    print(json.dumps(rows[:12], indent=2))


def compare() -> None:
    for prefix, (old, new) in RELEASES.items():
        profile = "display" if "Display" in prefix else "alpha"
        for version in (old, new):
            path = FONTS / f"{prefix}-Regular-{version}.woff2"
            if not path.exists():
                continue
            legacy = score_current(path, profile)
            fam = family(prefix, version)
            print(
                json.dumps(
                    {
                        "font": f"{prefix} {version}",
                        "legacy_regular": legacy["score"],
                        "quality_regular": fam["Regular"]["quality"],
                        "family_quality": fam["family_quality"],
                        "styles": {k: v["quality"] for k, v in fam.items() if isinstance(v, dict) and "quality" in v},
                        "stems": fam["stems"],
                        "weight_step_evenness": fam["weight_step_evenness"],
                    }
                )
            )


if __name__ == "__main__":
    profile = os.getenv("BJORK_SCORE_PROFILE", "alpha")
    if os.getenv("BJORK_SEARCH") == "1":
        search()
    elif "--compare" in sys.argv:
        compare()
    elif "--family" in sys.argv:
        i = sys.argv.index("--family")
        print(json.dumps(family(sys.argv[i + 1], sys.argv[i + 2]), indent=2))
    else:
        default_font = DISPLAY_REGULAR if profile == "display" else ALPHA_REGULAR
        font_path = Path(os.getenv("BJORK_SCORE_FONT", str(default_font)))
        result = score_current(font_path, profile)
        result["quality"] = quality(font_path)
        print(json.dumps(result, indent=2))
