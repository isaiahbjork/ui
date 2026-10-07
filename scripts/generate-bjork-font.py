"""Generate the Bjork Grotesk family (Alpha text cut + Display cut) from Geist.

    python scripts/generate-bjork-font.py            # both cuts, all styles
    python scripts/generate-bjork-font.py alpha      # one cut
    BJORK_ONLY_REGULAR=1 python scripts/...          # Regular only (used by the scorer's search)

The source is Geist's variable woff2 that ships inside `next`. Every style is built
in seven steps; each step keeps outlines, hmtx, composites, GPOS anchors and kerning
consistent with each other, so the font renders identically on CoreText, FreeType
and DirectWrite.

1. Anisotropic instancing. x coordinates come from a heavier Geist instance so the
   vertical stems survive the horizontal compaction; y coordinates come from the
   target-weight instance so horizontals keep Geist's own contrast (horizontal-only
   scaling of one instance inverts the contrast: verticals end up thinner than
   horizontals). Lowercase y comes from a slightly lighter instance to pre-compensate
   the x-height stretch.
2. Lowercase zone map. Every lowercase glyph (including i, j, ae, dotless forms and
   ligatures) gets the same x-height; everything above the x-height is shifted rather
   than squashed, so ascenders gain a little height and f/t tops keep their weight.
   Accents, the i/j dots and mark anchors follow.
3. Compaction and spacing. Outlines scale by `compact`; sidebearings become
   `spacing * sb + tracking`, so Geist's rhythm is kept and looseness is a single
   uniform term. hmtx LSB always equals the outline xMin. Kerning scales with the
   sidebearings, composites and anchors are re-derived exactly.
4. Bjork DNA. Shear-based edits that keep strokes straight, terminals on their
   alignment zones and stroke weight constant: kicked R/K/k legs, a long J/j hook,
   a longer Q tail, and a longer right arm on t. Part of each reach is given back
   as sidebearing, and pairs the reach still cramps (closest outline approach,
   measured before/after) get half of it back through one extra kern lookup.
5. Figures. Default figures are tabular (one advance for all ten), proportional
   figures live behind `pnum`, and the tabular set is not kerned.
   UI features: `zero` (slashed zero), `case` (dashes, guillemets, bullets and
   brackets centred on the cap height) and `ss01` (serifed capital I).
6. Italic. A real oblique: the angle is in degrees (the previous generator passed
   degrees to a radians API), skewed around half the x-height so glyphs stay centred,
   slightly condensed, and with italicAngle/caret metadata.
7. Metrics, RIBBI names, cleanup, woff2 (no glyph names unless
   BJORK_KEEP_GLYPH_NAMES=1).

Tuning: BJORK_OUT_DIR, BJORK_VERSION, BJORK_PREFIX/BJORK_FAMILY, BJORK_STEM_SCALE,
BJORK_COMPACT_FACTOR, BJORK_SPACING_FACTOR, BJORK_TRACKING, BJORK_XHEIGHT_FACTOR,
BJORK_CONTRAST, BJORK_DNA_STRENGTH, BJORK_Q_TAIL_FACTOR, BJORK_ITALIC_DEGREES.
"""

from __future__ import annotations

import bisect
import copy
import math
import os
import string
import sys
import unicodedata
from dataclasses import dataclass, field, replace
from pathlib import Path

from fontTools.misc.roundTools import otRound
from fontTools.otlLib import builder as otlBuilder
from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import otTables, ttProgram
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphComponent, GlyphCoordinates
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parents[1]
SOURCE_CANDIDATES = (
    ROOT / "node_modules/next/dist/next-devtools/server/font/geist-latin.woff2",
    ROOT / "node_modules/next/dist/client/components/react-dev-overlay/font/geist-latin.woff2",
)
OUT_DIR = Path(os.getenv("BJORK_OUT_DIR", ROOT / "public/fonts"))

DIGITS = ("zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine")
USE_MY_METRICS = 0x0200
ROUND_XY_TO_GRID = 0x0004
CAP_HEIGHT = 710


def env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    return float(value) if value not in (None, "") else default


# ---------------------------------------------------------------------------
# Profiles


@dataclass(frozen=True)
class Style:
    name: str
    css_weight: int
    stem: float  # target vertical stem after compaction (font units)
    italic: bool = False
    tracking: float | None = None  # per-style override of Profile.tracking


@dataclass(frozen=True)
class Dna:
    k_arm: float = 0.0  # K/k arm reach (units)
    k_leg: float = 0.0  # K/k leg kick
    r_leg: float = 0.0  # R leg kick
    j_hook: float = 0.0  # J hook reach to the left
    jj_hook: float = 0.0  # dotless j hook reach
    q_tail: float = 0.0  # Q tail length
    q_flatten: float = 0.35  # how much the Q tail turns towards horizontal
    t_arm: float = 0.0  # t crossbar right arm
    f_arm: float = 0.0  # f crossbar right arm
    leg_room: float = 0.7  # share of a kicked leg (K/k/R) given back as advance
    arm_room: float = 0.45  # share of the t/f arm given back as advance
    hook_room: float = 0.5  # share of the J hook given back as left sidebearing


@dataclass(frozen=True)
class Profile:
    key: str
    family: str
    prefix: str
    version: str
    revision: float
    compact: float  # horizontal outline scale
    spacing: float  # sidebearing scale
    tracking: float  # units added to every sidebearing
    xheight: float  # lowercase x-height factor
    contrast: float  # 1.0 = Geist's natural vertical/horizontal contrast; >1 = more contrast
    italic_angle: float  # degrees, forward slant
    italic_condense: float
    dna: Dna
    styles: tuple[Style, ...] = field(default=())


ALPHA = Profile(
    key="alpha",
    family="Bjork Grotesk Alpha",
    prefix="BjorkGroteskAlpha",
    version="v13",
    revision=13.0,
    compact=0.918,
    spacing=0.918,
    tracking=17.0,
    xheight=1.035,
    contrast=1.0,
    italic_angle=9.0,
    italic_condense=0.985,
    dna=Dna(k_arm=22, k_leg=30, r_leg=34, j_hook=26, jj_hook=12, q_tail=22, t_arm=24, f_arm=0),
    # tracking per weight keeps each style's set width on v12 (layouts do not reflow)
    styles=(
        Style("Regular", 400, 74, tracking=13.75),
        Style("Medium", 500, 93, tracking=14.7),
        Style("Semibold", 600, 116, tracking=15.8),
        Style("Bold", 700, 142, tracking=17.5),
        Style("Italic", 400, 74, italic=True, tracking=13.75),
        Style("Bold Italic", 700, 142, italic=True, tracking=17.5),
    ),
)

DISPLAY = Profile(
    key="display",
    family="Bjork Grotesk Display",
    prefix="BjorkGroteskDisplay",
    version="v3",
    revision=3.0,
    compact=0.885,
    spacing=0.885,
    tracking=11.0,
    xheight=1.02,
    contrast=1.05,
    italic_angle=9.0,
    italic_condense=0.985,
    dna=Dna(k_arm=34, k_leg=46, r_leg=52, j_hook=40, jj_hook=18, q_tail=38, t_arm=38, f_arm=0, arm_room=0.55, hook_room=0.6),
    # tracking per weight keeps each style's set width on v2
    styles=(
        Style("Regular", 400, 79, tracking=10.1),
        Style("Medium", 500, 100, tracking=11.0),
        Style("Semibold", 600, 125, tracking=11.8),
        Style("Bold", 700, 151, tracking=12.3),
        Style("Italic", 400, 79, italic=True, tracking=10.1),
        Style("Bold Italic", 700, 151, italic=True, tracking=12.3),
    ),
)

PROFILES = {"alpha": ALPHA, "display": DISPLAY}


def profile_from_env(profile: Profile) -> Profile:
    """Allow the scorer (and humans) to tune a profile through BJORK_* variables."""
    dna = profile.dna
    strength = env_float("BJORK_DNA_STRENGTH", 1.0)
    if strength != 1.0:
        dna = replace(
            dna,
            **{k: getattr(dna, k) * strength for k in ("k_arm", "k_leg", "r_leg", "j_hook", "jj_hook", "q_tail", "t_arm", "f_arm")},
        )
    dna = replace(dna, q_tail=dna.q_tail * env_float("BJORK_Q_TAIL_FACTOR", 1.0))
    styles = profile.styles
    stem_scale = env_float("BJORK_STEM_SCALE", 1.0)
    if stem_scale != 1.0:
        styles = tuple(replace(s, stem=s.stem * stem_scale) for s in styles)
    return replace(
        profile,
        family=os.getenv("BJORK_FAMILY", profile.family),
        prefix=os.getenv("BJORK_PREFIX", profile.prefix),
        version=os.getenv("BJORK_VERSION", profile.version),
        compact=env_float("BJORK_COMPACT_FACTOR", profile.compact),
        spacing=env_float("BJORK_SPACING_FACTOR", profile.spacing),
        tracking=env_float("BJORK_TRACKING", profile.tracking),
        xheight=env_float("BJORK_XHEIGHT_FACTOR", profile.xheight),
        contrast=env_float("BJORK_CONTRAST", profile.contrast),
        italic_angle=abs(env_float("BJORK_ITALIC_DEGREES", profile.italic_angle)),
        dna=dna,
        styles=styles,
    )


# ---------------------------------------------------------------------------
# Source + stroke model


def find_source() -> Path:
    override = os.getenv("BJORK_SOURCE")
    if override:
        return Path(override)
    for candidate in SOURCE_CANDIDATES:
        if candidate.exists():
            return candidate
    raise SystemExit("Geist variable woff2 not found; run `npm install` first.")


class ContourBounds(RecordingPen):
    def contours(self):
        out, current = [], []
        for op, args in self.value:
            current.append((op, args))
            if op in ("closePath", "endPath"):
                pen = BoundsPen(None)
                for o, a in current:
                    getattr(pen, o)(*a)
                out.append(pen.bounds)
                current = []
        return out


class StrokeModel:
    """Measures Geist's stems at any weight straight from the variable font."""

    def __init__(self, source: Path):
        self.vf = TTFont(source)
        self._v: dict[float, float] = {}
        self._h: dict[float, float] = {}

    def _glyphset(self, weight: float):
        return self.vf.getGlyphSet(location={"wght": weight})

    def vertical(self, weight: float) -> float:
        key = round(weight, 2)
        if key not in self._v:
            pen = BoundsPen(None)
            self._glyphset(weight)["I"].draw(pen)
            self._v[key] = pen.bounds[2] - pen.bounds[0]
        return self._v[key]

    def horizontal(self, weight: float) -> float:
        key = round(weight, 2)
        if key not in self._h:
            pen = ContourBounds()
            self._glyphset(weight)["o"].draw(pen)
            outer, inner = sorted(pen.contours(), key=lambda b: (b[2] - b[0]) * (b[3] - b[1]), reverse=True)[:2]
            self._h[key] = outer[3] - inner[3]
        return self._h[key]

    @staticmethod
    def solve(fn, target: float, lo: float = 100.0, hi: float = 900.0) -> float:
        for _ in range(40):
            mid = (lo + hi) / 2
            if fn(mid) < target:
                lo = mid
            else:
                hi = mid
        return round((lo + hi) / 2, 1)


def style_weights(model: StrokeModel, profile: Profile, style: Style) -> tuple[float, float, float]:
    """x-source weight, uppercase y-source weight, lowercase y-source weight."""
    shrink = profile.compact
    if style.italic:
        shrink *= profile.italic_condense * math.cos(math.radians(profile.italic_angle))
    wx = model.solve(model.vertical, style.stem / shrink)
    w_eff = model.solve(model.vertical, style.stem)
    h_target = model.horizontal(w_eff) / profile.contrast
    wy_uc = model.solve(model.horizontal, h_target)
    wy_lc = model.solve(model.horizontal, h_target / profile.xheight)
    return wx, wy_uc, wy_lc


_INSTANCES: dict[float, TTFont] = {}


def instance(source: Path, weight: float, fresh: bool = False) -> TTFont:
    if fresh:
        return instancer.instantiateVariableFont(TTFont(source), {"wght": weight}, inplace=False)
    if weight not in _INSTANCES:
        _INSTANCES[weight] = instancer.instantiateVariableFont(TTFont(source), {"wght": weight}, inplace=False)
    return _INSTANCES[weight]


# ---------------------------------------------------------------------------
# Helpers


def gpos_lookups(font: TTFont, lookup_type: int):
    if "GPOS" not in font:
        return
    for lookup in font["GPOS"].table.LookupList.Lookup:
        for sub in lookup.SubTable:
            kind = lookup.LookupType
            if kind == 9:
                kind, sub = sub.ExtensionLookupType, sub.ExtSubTable
            if kind == lookup_type:
                yield sub


def iter_anchors(font: TTFont):
    """Yield (glyph_name, anchor) for every mark/base/ligature/mark2 anchor."""
    seen = set()

    def emit(name, anchor):
        if anchor is not None and id(anchor) not in seen:
            seen.add(id(anchor))
            yield name, anchor

    for sub in gpos_lookups(font, 4):
        for name, rec in zip(sub.MarkCoverage.glyphs, sub.MarkArray.MarkRecord):
            yield from emit(name, rec.MarkAnchor)
        for name, rec in zip(sub.BaseCoverage.glyphs, sub.BaseArray.BaseRecord):
            for anchor in rec.BaseAnchor:
                yield from emit(name, anchor)
    for sub in gpos_lookups(font, 5):
        for name, rec in zip(sub.MarkCoverage.glyphs, sub.MarkArray.MarkRecord):
            yield from emit(name, rec.MarkAnchor)
        for name, attach in zip(sub.LigatureCoverage.glyphs, sub.LigatureArray.LigatureAttach):
            for comp in attach.ComponentRecord:
                for anchor in comp.LigatureAnchor:
                    yield from emit(name, anchor)
    for sub in gpos_lookups(font, 6):
        for name, rec in zip(sub.Mark1Coverage.glyphs, sub.Mark1Array.MarkRecord):
            yield from emit(name, rec.MarkAnchor)
        for name, rec in zip(sub.Mark2Coverage.glyphs, sub.Mark2Array.Mark2Record):
            for anchor in rec.Mark2Anchor:
                yield from emit(name, anchor)


def iter_pair_values(font: TTFont):
    for sub in gpos_lookups(font, 2):
        if sub.Format == 1:
            for pair_set in sub.PairSet:
                for rec in pair_set.PairValueRecord:
                    yield rec.Value1
                    yield getattr(rec, "Value2", None)
        else:
            for c1 in sub.Class1Record:
                for c2 in c1.Class2Record:
                    yield c2.Value1
                    yield getattr(c2, "Value2", None)


def scale_kerning(font: TTFont, factor: float) -> None:
    for value in iter_pair_values(font):
        if value is None:
            continue
        for attr in ("XAdvance", "XPlacement"):
            if hasattr(value, attr) and getattr(value, attr):
                setattr(value, attr, otRound(getattr(value, attr) * factor))


def bounds(font: TTFont, name: str):
    glyf = font["glyf"]
    glyph = glyf[name]
    glyph.recalcBounds(glyf)
    if glyph.numberOfContours == 0:
        return None
    return glyph.xMin, glyph.yMin, glyph.xMax, glyph.yMax


def flat_bounds(font: TTFont, name: str):
    coords, _, _ = font["glyf"][name].getCoordinates(font["glyf"])
    if not len(coords):
        return None
    xs = [p[0] for p in coords]
    ys = [p[1] for p in coords]
    return min(xs), min(ys), max(xs), max(ys)


def contours(glyph: Glyph):
    start = 0
    for end in glyph.endPtsOfContours:
        yield list(range(start, end + 1))
        start = end + 1


def lowercase_glyphs(font: TTFont) -> set[str]:
    order = set(font.getGlyphOrder())
    lower = {g for cp, g in font.getBestCmap().items() if unicodedata.category(chr(cp)) == "Ll"}
    lower |= {"dotlessi", "uni0237", "i.loclTRK", "f_f.liga", "fi", "fl", "t_t.liga", "uni0338"}
    return {g for g in lower if g in order}


def is_mark(font: TTFont, name: str) -> bool:
    return font["hmtx"][name][0] == 0 and font["glyf"][name].numberOfContours != 0


def composite_order(font: TTFont) -> list[str]:
    glyf = font["glyf"]
    done: set[str] = set()
    out: list[str] = []

    def visit(name):
        if name in done:
            return
        done.add(name)
        if glyf[name].isComposite():
            for comp in glyf[name].components:
                visit(comp.glyphName)
            out.append(name)

    for name in font.getGlyphOrder():
        visit(name)
    return out


# ---------------------------------------------------------------------------
# 1. anisotropic instancing


def merge_xy(fx: TTFont, fy_uc: TTFont, fy_lc: TTFont, lower: set[str]) -> None:
    gx, gu, gl = fx["glyf"], fy_uc["glyf"], fy_lc["glyf"]
    for name in fx.getGlyphOrder():
        a = gx[name]
        b = (gl if name in lower else gu)[name]
        if a.isComposite():
            for ca, cb in zip(a.components, b.components):
                ca.y = cb.y
        elif a.numberOfContours > 0:
            a.coordinates = GlyphCoordinates([(x, y) for (x, _), (_, y) in zip(a.coordinates, b.coordinates)])
            a.recalcBounds(gx)


# ---------------------------------------------------------------------------
# 2. lowercase zone map


def raise_lowercase(font: TTFont, lower: set[str], factor: float) -> tuple[float, float]:
    glyf = font["glyf"]
    x_height = bounds(font, "x")[3]
    delta = (factor - 1) * x_height

    def zone(y):
        if y <= 0:
            return y
        if y <= x_height:
            return y * factor
        return y + delta

    for name in lower:
        glyph = glyf[name]
        if glyph.isComposite() or glyph.numberOfContours <= 0:
            continue
        glyph.coordinates = GlyphCoordinates([(x, otRound(zone(y))) for x, y in glyph.coordinates])
        glyph.recalcBounds(glyf)

    for name in lower:
        glyph = glyf[name]
        if not glyph.isComposite():
            continue
        for comp in glyph.components:
            if comp.glyphName in lower or not is_mark(font, comp.glyphName):
                continue
            mark_bounds = bounds(font, comp.glyphName)
            if mark_bounds and mark_bounds[1] >= x_height * 0.5:
                comp.y = otRound(comp.y + delta)

    for name, anchor in iter_anchors(font):
        if name in lower:
            anchor.YCoordinate = otRound(zone(anchor.YCoordinate))
    return x_height * factor, delta


# ---------------------------------------------------------------------------
# 3. compaction + spacing


@dataclass
class Spacing:
    compact: float
    spacing: float
    tracking: float
    shift: dict[str, float]  # per-glyph x offset: x' = compact * x + shift
    original_adv: dict[str, int]
    original_bounds: dict[str, tuple]
    original_components: dict[str, list[tuple[str, int, int]]]

    def model(self, adv, x_min, x_max):
        lsb = self.spacing * x_min + self.tracking
        rsb = self.spacing * (adv - x_max) + self.tracking
        return lsb - self.compact * x_min, otRound(lsb + self.compact * (x_max - x_min) + rsb)


def compact_simple(font: TTFont, compact: float, spacing: float, tracking: float) -> Spacing:
    """Scale every simple outline by `compact` and re-space it with the spacing model."""
    glyf, hmtx = font["glyf"], font["hmtx"]
    order = font.getGlyphOrder()
    sp = Spacing(
        compact,
        spacing,
        tracking,
        {},
        {name: hmtx[name][0] for name in order},
        {name: flat_bounds(font, name) for name in order},
        {
            name: [(c.glyphName, c.x, c.y) for c in glyf[name].components]
            for name in order
            if glyf[name].isComposite()
        },
    )
    for name in order:
        glyph = glyf[name]
        if glyph.isComposite():
            continue
        adv = sp.original_adv[name]
        if glyph.numberOfContours <= 0:
            sp.shift[name] = 0.0
            hmtx[name] = (otRound(spacing * adv + 2 * tracking) if adv else 0, 0)
            continue
        c, new_adv = (0.0, 0) if adv == 0 else sp.model(adv, glyph.xMin, glyph.xMax)
        glyph.coordinates = GlyphCoordinates([(otRound(compact * x + c), y) for x, y in glyph.coordinates])
        glyph.recalcBounds(glyf)
        sp.shift[name] = c
        hmtx[name] = (new_adv, glyph.xMin)
    return sp


def build_composites(font: TTFont, sp: Spacing) -> None:
    """Re-derive every composite from its original offsets (idempotent).

    A composite whose outline is `compact * x + shift_C` while each component is
    `compact * x + shift_A` needs offset' = compact * offset + shift_C - shift_A.
    Accented letters and USE_MY_METRICS composites inherit their base metrics
    exactly (v12 kept Geist's wider advances on every composite: o vs ö, i, j)."""
    glyf, hmtx = font["glyf"], font["hmtx"]
    adv0 = sp.original_adv
    for name in composite_order(font):
        glyph = glyf[name]
        original = sp.original_components[name]
        comps = glyph.components
        metric = next((c for c in comps if c.flags & USE_MY_METRICS), None)
        base_index = next((i for i, (g, _, _) in enumerate(original) if adv0[g] > 0), None)
        adv = adv0[name]
        accented = (
            base_index is not None
            and len(original) > 1
            and abs(original[base_index][1]) <= 2
            and abs(adv - adv0[original[base_index][0]]) <= 3
            and all(adv0[g] == 0 for i, (g, _, _) in enumerate(original) if i != base_index)
        )
        if metric is not None:
            c_comp = sp.shift[metric.glyphName]
            new_adv = hmtx[metric.glyphName][0]
        elif accented:
            base = original[base_index][0]
            c_comp = sp.shift[base]
            new_adv = hmtx[base][0]
        else:
            b = sp.original_bounds[name]
            c_comp, new_adv = sp.model(adv, b[0], b[2])
        for comp, (g, x, y) in zip(comps, original):
            comp.x = otRound(sp.compact * x + c_comp - sp.shift[g])
            comp.y = y
        sp.shift[name] = c_comp
        glyph.recalcBounds(glyf)
        hmtx[name] = (new_adv, glyph.xMin)


def compact_positioning(font: TTFont, sp: Spacing) -> None:
    for name, anchor in iter_anchors(font):
        anchor.XCoordinate = otRound(sp.compact * anchor.XCoordinate + sp.shift.get(name, 0.0))
    scale_kerning(font, sp.spacing)


# ---------------------------------------------------------------------------
# 4. Bjork DNA


def _set(font: TTFont, name: str, points) -> None:
    glyph = font["glyf"][name]
    glyph.coordinates = GlyphCoordinates([(otRound(x), otRound(y)) for x, y in points])
    glyph.recalcBounds(font["glyf"])


def dna_k(font: TTFont, name: str, arm: float, leg: float, top: float) -> float:
    """Spread K/k: shear the arm about its stem attachment and the leg about the crotch.

    Both are affine shears that depend only on y, so every straight edge stays
    straight, horizontal stroke thickness is unchanged and the foot stays on the
    baseline (the old generator pushed the leg 13-18 units below it)."""
    glyph = font["glyf"][name]
    pts = list(glyph.coordinates)
    x_min = min(p[0] for p in pts)
    top_pts = [i for i, p in enumerate(pts) if abs(p[1] - top) <= 1]
    stem_right = min(pts[i][0] for i in top_pts if pts[i][0] > x_min + 20) if name == "K" else None
    if stem_right is None:
        stem_top = max(p[1] for p in pts)
        stem_right = min(p[0] for p in pts if p[0] > x_min + 20 and p[1] >= stem_top - 1)
    arm_right = max(top_pts, key=lambda i: pts[i][0])
    arm_left = max((i for i in top_pts if i != arm_right and pts[i][0] > stem_right + 20), key=lambda i: pts[i][0])
    n = len(pts)
    crotch = pts[(arm_right + 1) % n]
    attach = pts[(arm_left - 1) % n]
    y_crotch, y_attach = crotch[1], attach[1]
    out = []
    for x, y in pts:
        if x > stem_right + 2:
            if y < y_crotch:
                x += leg * (y_crotch - y) / y_crotch
            if y_attach < y <= top + 1:
                x += arm * (y - y_attach) / (top - y_attach)
        out.append((x, y))
    _set(font, name, out)
    return max(arm, leg)


def dna_r(font: TTFont, leg: float) -> float:
    """Kick the R leg out with one shear anchored at the bowl junction (no knee)."""
    glyph = font["glyf"]["R"]
    pts = list(glyph.coordinates)
    x_min = min(p[0] for p in pts)
    x_max = max(p[0] for p in pts)
    y0 = 0.472 * CAP_HEIGHT
    split = x_min + 0.59 * (x_max - x_min)
    out = [((x + leg * (y0 - y) / y0) if (y < y0 and x > split) else x, y) for x, y in pts]
    _set(font, "R", out)
    return leg


def dna_hook(font: TTFont, name: str, reach: float, a: float, b: float) -> None:
    """Move the hook of J/j left with a smoothstep ramp across the flat bottom of
    the curve: the terminal translates rigidly, the bowl bottom stretches, no step."""
    glyph = font["glyf"][name]
    pts = list(glyph.coordinates)
    x_min = min(p[0] for p in pts)
    x_max = max(p[0] for p in pts)
    xa = x_min + a * (x_max - x_min)
    xb = x_min + b * (x_max - x_min)
    out = []
    for x, y in pts:
        u = min(1.0, max(0.0, (xb - x) / (xb - xa)))
        out.append((x - reach * u * u * (3 - 2 * u), y))
    _set(font, name, out)


def dna_q(font: TTFont, length: float, flatten: float) -> None:
    """Lengthen the Q tail along its own direction (slightly turned to horizontal)."""
    glyph = font["glyf"]["Q"]
    pts = list(glyph.coordinates)
    outer = min(contours(glyph), key=lambda idx: min(pts[i][1] for i in idx))
    y_min = min(pts[i][1] for i in outer)
    ends = [i for i in outer if pts[i][1] <= y_min + 0.5]
    vectors = []
    pos = {i: k for k, i in enumerate(outer)}
    for i in ends:
        k = pos[i]
        for j in (outer[(k - 1) % len(outer)], outer[(k + 1) % len(outer)]):
            if pts[j][1] > y_min + 20:
                vectors.append((pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]))
    vx = sum(v[0] for v in vectors) / len(vectors)
    vy = sum(v[1] for v in vectors) / len(vectors)
    norm = math.hypot(vx, vy)
    vx, vy = vx / norm + flatten, vy / norm
    norm = math.hypot(vx, vy)
    vx, vy = vx / norm, vy / norm
    out = [(x + length * vx, y + length * vy) if i in ends else (x, y) for i, (x, y) in enumerate(pts)]
    _set(font, "Q", out)


def dna_bar(font: TTFont, name: str, reach: float, x_height: float) -> None:
    """Extend the right end of the crossbar contour of t/f."""
    glyph = font["glyf"][name]
    pts = list(glyph.coordinates)
    best = None
    for idx in contours(glyph):
        ys = [pts[i][1] for i in idx]
        if abs(max(ys) - x_height) <= 4 and max(ys) - min(ys) < 0.3 * x_height:
            best = idx
    if best is None:
        return
    right = max(pts[i][0] for i in best)
    out = [(x + reach, y) if (i in best and x >= right - 1) else (x, y) for i, (x, y) in enumerate(pts)]
    _set(font, name, out)


DNA_REACH_RIGHT = ("K", "k", "R", "t", "f", "Q")
DNA_REACH_LEFT = ("J", "j")


def apply_dna(font: TTFont, dna: Dna, x_height: float, shift: dict[str, float]) -> None:
    hmtx = font["hmtx"]

    def grow(name, extra, move=0.0):
        adv, _ = hmtx[name]
        if move:
            glyph = font["glyf"][name]
            _set(font, name, [(x + move, y) for x, y in glyph.coordinates])
            shift[name] += move
            for owner, anchor in iter_anchors(font):
                if owner == name:
                    anchor.XCoordinate = otRound(anchor.XCoordinate + move)
        hmtx[name] = (otRound(adv + extra), font["glyf"][name].xMin)

    if dna.k_arm or dna.k_leg:
        grow("K", dna.leg_room * dna_k(font, "K", dna.k_arm, dna.k_leg, CAP_HEIGHT))
        grow("k", dna.leg_room * dna_k(font, "k", dna.k_arm * 0.8, dna.k_leg * 0.85, x_height))
    if dna.r_leg:
        grow("R", dna.leg_room * dna_r(font, dna.r_leg))
    if dna.j_hook:
        dna_hook(font, "J", dna.j_hook, 0.25, 0.51)
        grow("J", dna.j_hook * dna.hook_room, move=dna.j_hook * dna.hook_room)
    if dna.jj_hook:
        dna_hook(font, "uni0237", dna.jj_hook, 0.24, 0.55)
        grow("uni0237", 0)
    if dna.q_tail:
        dna_q(font, dna.q_tail, dna.q_flatten)
        grow("Q", 0)
    if dna.t_arm:
        dna_bar(font, "t", dna.t_arm, x_height)
        grow("t", dna.t_arm * dna.arm_room)
    if dna.f_arm:
        dna_bar(font, "f", dna.f_arm, x_height)
        grow("f", dna.f_arm * dna.arm_room)


class _SideProfile(BasePen):
    """Left/right ink extent of an outline at fixed sample heights (flattened curves)."""

    def __init__(self, glyphset, ys):
        super().__init__(glyphset)
        self.ys = ys
        self.left = [math.inf] * len(ys)
        self.right = [-math.inf] * len(ys)
        self.start = self.cur = None

    def _moveTo(self, p):
        self.start = self.cur = p

    def _lineTo(self, p):
        self._segment(self.cur, p)
        self.cur = p

    def _qCurveToOne(self, p1, p2):
        p0 = self.cur
        for i in range(1, 9):
            t = i / 8
            u = 1 - t
            pt = (u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1])
            self._segment(self.cur, pt)
            self.cur = pt

    def _curveToOne(self, p1, p2, p3):
        p0 = self.cur
        for i in range(1, 9):
            t = i / 8
            u = 1 - t
            pt = tuple(u**3 * a + 3 * u * u * t * b + 3 * u * t * t * c + t**3 * d for a, b, c, d in zip(p0, p1, p2, p3))
            self._segment(self.cur, pt)
            self.cur = pt

    def _closePath(self):
        if self.cur is not None and self.start is not None and self.cur != self.start:
            self._segment(self.cur, self.start)
        self.cur = self.start

    def _endPath(self):
        self.cur = self.start

    def _segment(self, a, b):
        (x0, y0), (x1, y1) = a, b
        if y0 == y1:
            return
        lo, hi = (y0, y1) if y0 < y1 else (y1, y0)
        for i in range(bisect.bisect_left(self.ys, lo), bisect.bisect_right(self.ys, hi)):
            x = x0 + (self.ys[i] - y0) * (x1 - x0) / (y1 - y0)
            if x < self.left[i]:
                self.left[i] = x
            if x > self.right[i]:
                self.right[i] = x


PROFILE_YS = list(range(-320, 1000, 6))


def side_profiles(font: TTFont, names) -> dict[str, tuple[list[float], list[float], int]]:
    glyphset = font.getGlyphSet()
    out = {}
    for name in names:
        pen = _SideProfile(glyphset, PROFILE_YS)
        glyphset[name].draw(pen)
        out[name] = (pen.left, pen.right, font["hmtx"][name][0])
    return out


def kern_value(font: TTFont, first: str, second: str) -> int:
    """Kerning HarfBuzz would apply for a pair (first matching subtable per lookup)."""
    gpos = font["GPOS"].table
    indices = sorted({i for r in gpos.FeatureList.FeatureRecord if r.FeatureTag == "kern" for i in r.Feature.LookupListIndex})
    total = 0
    for index in indices:
        lookup = gpos.LookupList.Lookup[index]
        for sub in lookup.SubTable:
            if lookup.LookupType == 9:
                sub = sub.ExtSubTable
            glyphs = sub.Coverage.glyphs
            if first not in glyphs:
                continue
            if sub.Format == 1:
                rec = next((r for r in sub.PairSet[glyphs.index(first)].PairValueRecord if r.SecondGlyph == second), None)
                if rec is None:
                    continue
                total += getattr(rec.Value1, "XAdvance", 0) or 0
                break
            c1 = sub.ClassDef1.classDefs.get(first, 0)
            c2 = sub.ClassDef2.classDefs.get(second, 0)
            value = sub.Class1Record[c1].Class2Record[c2].Value1
            total += getattr(value, "XAdvance", 0) or 0
            break
    return total


def pair_gaps(font: TTFont, profiles, pairs) -> dict[tuple[str, str], float]:
    out = {}
    for a, b in pairs:
        la, ra, adv = profiles[a]
        lb, _, _ = profiles[b]
        kern = kern_value(font, a, b)
        best = math.inf
        for i in range(len(PROFILE_YS)):
            if ra[i] > -math.inf and lb[i] < math.inf:
                best = min(best, adv + kern - ra[i] + lb[i])
        if best < math.inf:
            out[(a, b)] = best
    return out


def dna_pairs(font: TTFont) -> list[tuple[str, str]]:
    cmap = font.getBestCmap()
    partners = string.ascii_letters + string.digits + ".,:;'\")]}?!-"
    names = sorted({cmap[ord(c)] for c in partners if ord(c) in cmap})
    right = [g for g in DNA_REACH_RIGHT if g in cmap.values()]
    left = [g for g in DNA_REACH_LEFT if g in cmap.values()]
    pairs = {(a, b) for a in right for b in names} | {(a, b) for a in names for b in left}
    return sorted(pairs)


def dna_kerning(font: TTFont, before: dict, pairs) -> int:
    """Give back half of any DNA reach that cramps a pair, as one extra kern lookup."""
    names = sorted({g for pair in pairs for g in pair})
    after = pair_gaps(font, side_profiles(font, names), pairs)
    adjust = {}
    for pair, gap_after in after.items():
        gap_before = before.get(pair)
        if gap_before is None:
            continue
        reduction = gap_before - gap_after
        value = 0
        if reduction > 8 and gap_after < 0.85 * gap_before:
            value = 0.5 * reduction
        if gap_after + value < min(45, gap_before):
            value = min(45, gap_before) - gap_after
        if value >= 4:
            adjust[pair] = otRound(value)
    if not adjust:
        return 0
    gpos = font["GPOS"].table
    kern_records = [r for r in gpos.FeatureList.FeatureRecord if r.FeatureTag == "kern"]
    flag = gpos.LookupList.Lookup[kern_records[0].Feature.LookupListIndex[0]].LookupFlag
    values = {}
    for (a, b), v in adjust.items():
        record = otTables.ValueRecord()
        record.XAdvance = v
        values[(a, b)] = (record, None)
    subtable = otlBuilder.buildPairPosGlyphsSubtable(values, font.getReverseGlyphMap())
    lookup = otlBuilder.buildLookup([subtable], flags=flag)
    gpos.LookupList.Lookup.append(lookup)
    gpos.LookupList.LookupCount = len(gpos.LookupList.Lookup)
    index = len(gpos.LookupList.Lookup) - 1
    for record in kern_records:
        if index not in record.Feature.LookupListIndex:
            record.Feature.LookupListIndex.append(index)
            record.Feature.LookupCount = len(record.Feature.LookupListIndex)
    return len(adjust)


# ---------------------------------------------------------------------------
# 5. figures


def simple_from(font: TTFont, name: str, dx: float = 0.0) -> Glyph:
    coords, ends, flags = font["glyf"][name].getCoordinates(font["glyf"])
    glyph = Glyph()
    glyph.numberOfContours = len(ends)
    glyph.coordinates = GlyphCoordinates([(otRound(x + dx), y) for x, y in coords])
    glyph.endPtsOfContours = list(ends)
    glyph.flags = bytearray(f & 0x01 for f in flags)
    glyph.program = ttProgram.Program()
    glyph.program.fromBytecode(b"")
    return glyph


def tabular_figures(font: TTFont, sp: Spacing, compact: float, spacing: float, tracking: float) -> None:
    glyf, hmtx = font["glyf"], font["hmtx"]
    if not all(f"{d}.tf" in hmtx.metrics for d in DIGITS):
        return
    widths = []
    for d in DIGITS:
        b = sp.original_bounds[f"{d}.tf"]
        adv = sp.original_adv[f"{d}.tf"]
        widths.append(spacing * (adv - (b[2] - b[0])) + compact * (b[2] - b[0]) + 2 * tracking)
    tab = otRound(sum(widths) / len(widths))

    order = list(font.getGlyphOrder())
    new_names = [f"{d}.pnum" for d in DIGITS if f"{d}.pnum" not in hmtx.metrics]
    for d in DIGITS:
        tf = f"{d}.tf"
        b = sp.original_bounds[tf]
        centre = tab * ((b[0] + b[2]) / 2) / sp.original_adv[tf]
        cb = flat_bounds(font, tf)
        tab_glyph = simple_from(font, tf, centre - (cb[0] + cb[2]) / 2)
        # the proportional design moves to <digit>.pnum
        glyf.glyphs[f"{d}.pnum"] = copy.deepcopy(glyf[d])
        hmtx.metrics[f"{d}.pnum"] = hmtx[d]
        glyf.glyphs[d] = tab_glyph
        tab_glyph.recalcBounds(glyf)
        hmtx.metrics[d] = (tab, tab_glyph.xMin)
        comp = Glyph()
        comp.numberOfContours = -1
        gc = GlyphComponent()
        gc.glyphName, gc.x, gc.y, gc.flags = d, 0, 0, USE_MY_METRICS | ROUND_XY_TO_GRID
        comp.components = [gc]
        glyf.glyphs[tf] = comp
        comp.recalcBounds(glyf)
        hmtx.metrics[tf] = (tab, comp.xMin)

    order += new_names
    font.setGlyphOrder(order)
    glyf.glyphOrder = order
    font.getReverseGlyphMap(rebuild=True)
    if "GDEF" in font and font["GDEF"].table.GlyphClassDef:
        defs = font["GDEF"].table.GlyphClassDef.classDefs
        for name in new_names:
            defs[name] = 1

    rename = {d: f"{d}.pnum" for d in DIGITS}
    gsub = font["GSUB"].table
    for record in gsub.FeatureList.FeatureRecord:
        if record.FeatureTag != "pnum":
            continue
        for index in record.Feature.LookupListIndex:
            for sub in gsub.LookupList.Lookup[index].SubTable:
                if hasattr(sub, "mapping"):
                    sub.mapping = {**{d: f"{d}.pnum" for d in DIGITS}, **{f"{d}.tf": f"{d}.pnum" for d in DIGITS}}
    # tabular figures are never kerned; proportional figures keep Geist's figure kerning
    gid = font.getReverseGlyphMap()
    for sub in gpos_lookups(font, 2):
        glyphs = [rename.get(g, g) for g in sub.Coverage.glyphs]
        if sub.Format == 1:
            pairs = sorted(zip(glyphs, sub.PairSet), key=lambda p: gid[p[0]])
            sub.Coverage.glyphs = [p[0] for p in pairs]
            sub.PairSet = [p[1] for p in pairs]
            for pair_set in sub.PairSet:
                for rec in pair_set.PairValueRecord:
                    rec.SecondGlyph = rename.get(rec.SecondGlyph, rec.SecondGlyph)
                pair_set.PairValueRecord.sort(key=lambda r: gid[r.SecondGlyph])
        else:
            sub.Coverage.glyphs = sorted(glyphs, key=lambda g: gid[g])
            for cd in (sub.ClassDef1, sub.ClassDef2):
                if cd is not None:
                    cd.classDefs = {rename.get(g, g): c for g, c in cd.classDefs.items()}


# ---------------------------------------------------------------------------
# 5b. UI features: zero (slashed zero), case (cap-height punctuation), ss01 (serifed I)


def add_glyph(font: TTFont, name: str, glyph: Glyph, advance: int) -> None:
    glyf, hmtx = font["glyf"], font["hmtx"]
    order = list(font.getGlyphOrder())
    if name not in order:
        order.append(name)
        font.setGlyphOrder(order)
        glyf.glyphOrder = order
        font.getReverseGlyphMap(rebuild=True)
    glyf.glyphs[name] = glyph
    glyph.recalcBounds(glyf)
    hmtx.metrics[name] = (advance, glyph.xMin if glyph.numberOfContours else 0)
    if "GDEF" in font and font["GDEF"].table.GlyphClassDef:
        font["GDEF"].table.GlyphClassDef.classDefs[name] = 1


def component_glyph(parts, metrics: str | None = None) -> Glyph:
    glyph = Glyph()
    glyph.numberOfContours = -1
    glyph.components = []
    for name, x, y in parts:
        comp = GlyphComponent()
        comp.glyphName, comp.x, comp.y = name, otRound(x), otRound(y)
        comp.flags = ROUND_XY_TO_GRID | (USE_MY_METRICS if name == metrics else 0)
        glyph.components.append(comp)
    return glyph


def polygon_glyph(base: Glyph | None, polygons) -> Glyph:
    coords = list(base.coordinates) if base is not None else []
    ends = list(base.endPtsOfContours) if base is not None else []
    flags = bytearray(base.flags) if base is not None else bytearray()
    for poly in polygons:
        area = sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(poly, poly[1:] + poly[:1]))
        if area > 0:  # TrueType outer contours run clockwise
            poly = poly[::-1]
        coords += [(otRound(x), otRound(y)) for x, y in poly]
        flags += bytearray([1] * len(poly))
        ends.append(len(coords) - 1)
    glyph = Glyph()
    glyph.numberOfContours = len(ends)
    glyph.coordinates = GlyphCoordinates(coords)
    glyph.endPtsOfContours = ends
    glyph.flags = flags
    glyph.program = ttProgram.Program()
    glyph.program.fromBytecode(b"")
    return glyph


def clone_kerning(font: TTFont, source: str, target: str) -> None:
    gid = font.getReverseGlyphMap()
    for sub in gpos_lookups(font, 2):
        glyphs = sub.Coverage.glyphs
        if sub.Format == 1:
            if source in glyphs and target not in glyphs:
                pairs = list(zip(glyphs, sub.PairSet)) + [(target, copy.deepcopy(sub.PairSet[glyphs.index(source)]))]
                pairs.sort(key=lambda p: gid[p[0]])
                sub.Coverage.glyphs = [p[0] for p in pairs]
                sub.PairSet = [p[1] for p in pairs]
            for pair_set in sub.PairSet:
                extra = [copy.deepcopy(r) for r in pair_set.PairValueRecord if r.SecondGlyph == source]
                for r in extra:
                    r.SecondGlyph = target
                if extra and not any(r.SecondGlyph == target for r in pair_set.PairValueRecord):
                    pair_set.PairValueRecord = sorted(pair_set.PairValueRecord + extra, key=lambda r: gid[r.SecondGlyph])
        else:
            if source in glyphs and target not in glyphs:
                sub.Coverage.glyphs = sorted(glyphs + [target], key=lambda g: gid[g])
                if source in sub.ClassDef1.classDefs:
                    sub.ClassDef1.classDefs[target] = sub.ClassDef1.classDefs[source]
            if sub.ClassDef2 is not None and source in sub.ClassDef2.classDefs:
                sub.ClassDef2.classDefs[target] = sub.ClassDef2.classDefs[source]


def add_gsub_feature(font: TTFont, tag: str, mapping: dict[str, str], ui_name: str | None = None) -> None:
    gsub = font["GSUB"].table
    lookup = otlBuilder.buildLookup([otlBuilder.buildSingleSubstSubtable(mapping)])
    gsub.LookupList.Lookup.append(lookup)
    gsub.LookupList.LookupCount = len(gsub.LookupList.Lookup)
    feature = otTables.Feature()
    feature.LookupListIndex = [len(gsub.LookupList.Lookup) - 1]
    feature.LookupCount = 1
    feature.FeatureParams = None
    if ui_name:
        name_id = font["name"].addMultilingualName({"en": ui_name}, ttFont=font, mac=False)
        params = otTables.FeatureParamsStylisticSet()
        params.Version = 0
        params.UINameID = name_id
        feature.FeatureParams = params
    record = otTables.FeatureRecord()
    record.FeatureTag, record.Feature = tag, feature
    records = gsub.FeatureList.FeatureRecord + [record]
    new_index = len(records) - 1
    order = sorted(range(len(records)), key=lambda i: records[i].FeatureTag)
    remap = {old: new for new, old in enumerate(order)}
    gsub.FeatureList.FeatureRecord = [records[i] for i in order]
    gsub.FeatureList.FeatureCount = len(records)
    for script in gsub.ScriptList.ScriptRecord:
        systems = [script.Script.DefaultLangSys] + [r.LangSys for r in script.Script.LangSysRecord]
        for lang in systems:
            if lang is None:
                continue
            lang.FeatureIndex = sorted(remap[i] for i in list(lang.FeatureIndex) + [new_index])
            lang.FeatureCount = len(lang.FeatureIndex)
            if lang.ReqFeatureIndex != 0xFFFF:
                lang.ReqFeatureIndex = remap[lang.ReqFeatureIndex]


def slashed_zero(font: TTFont, name: str) -> Glyph:
    """Slash across the counter whose ends are buried in the ring.

    The bar keeps the font's horizontal stroke weight (capped by the counter width,
    so bold counters stay open) and its corners never reach the outer contour; the
    overlap with the ring is flagged OVERLAP_SIMPLE for CoreText."""
    glyph = font["glyf"][name]
    pts = list(glyph.coordinates)
    rings = sorted(contours(glyph), key=lambda idx: (max(pts[i][0] for i in idx) - min(pts[i][0] for i in idx)))
    inner, outer = rings[0], rings[-1]
    ix0, ix1 = min(pts[i][0] for i in inner), max(pts[i][0] for i in inner)
    iy0, iy1 = min(pts[i][1] for i in inner), max(pts[i][1] for i in inner)
    ox0, ox1 = min(pts[i][0] for i in outer), max(pts[i][0] for i in outer)
    oy0, oy1 = min(pts[i][1] for i in outer), max(pts[i][1] for i in outer)
    top = oy1 - iy1
    cx, cy = (ix0 + ix1) / 2, (iy0 + iy1) / 2
    a, b = (ix1 - ix0) / 2, (iy1 - iy0) / 2  # counter
    oa, ob = (ox1 - ox0) / 2, (oy1 - oy0) / 2  # outer ring
    thick = min(0.9 * top, 0.5 * (ix1 - ix0))
    theta = math.atan2(b, a) * 1.05
    ux, uy = math.cos(theta), math.sin(theta)
    nx, ny = -uy, ux
    margin = 0.35 * top
    ea, eb = oa - margin, ob - margin

    def inside(length):
        for sign in (1, -1):
            for k in (1, -1):
                qx = sign * ux * length + k * nx * thick / 2
                qy = sign * uy * length + k * ny * thick / 2
                if (qx / ea) ** 2 + (qy / eb) ** 2 > 1:
                    return False
        return True

    reach = 1 / math.sqrt((ux / a) ** 2 + (uy / b) ** 2)  # centre line meets the counter
    lo, hi = 0.0, max(oa, ob)
    for _ in range(40):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if inside(mid) else (lo, mid)
    length = max(lo, reach + 0.2 * thick)
    p0 = (cx - ux * length, cy - uy * length)
    p1 = (cx + ux * length, cy + uy * length)
    h = thick / 2
    slash = [
        (p0[0] + nx * h, p0[1] + ny * h),
        (p1[0] + nx * h, p1[1] + ny * h),
        (p1[0] - nx * h, p1[1] - ny * h),
        (p0[0] - nx * h, p0[1] - ny * h),
    ]
    out = polygon_glyph(glyph, [slash])
    out.flags[0] |= 0x40  # OVERLAP_SIMPLE
    return out


CASE_GLYPHS = (
    "hyphen", "endash", "emdash", "guilsinglleft", "guilsinglright", "guillemotleft", "guillemotright",
    "bullet", "periodcentered", "parenleft", "parenright", "bracketleft", "bracketright",
    "braceleft", "braceright", "exclamdown", "questiondown",
)


def ui_features(font: TTFont) -> None:
    glyf, hmtx = font["glyf"], font["hmtx"]
    order = set(font.getGlyphOrder())

    # zero: slashed zero for codes, IDs and hashes (default, tabular and proportional)
    zero_map = {}
    for base, alt in (("zero", "zero.zero"), ("zero.pnum", "zero.pnum.zero")):
        if base in order and not glyf[base].isComposite():
            add_glyph(font, alt, slashed_zero(font, base), hmtx[base][0])
            clone_kerning(font, base, alt)
            zero_map[base] = alt
    if "zero.tf" in order and "zero" in zero_map:
        zero_map["zero.tf"] = zero_map["zero"]
    if zero_map:
        add_gsub_feature(font, "zero", zero_map)

    # case: dashes, guillemets, bullets and brackets centred on the cap height
    case_map = {}
    for name in CASE_GLYPHS:
        if name not in order or f"{name}.case" in order:
            continue
        b = flat_bounds(font, name)
        if b is None:
            continue
        dy = (CAP_HEIGHT - (b[1] + b[3])) / 2
        add_glyph(font, f"{name}.case", component_glyph([(name, 0, dy)], metrics=name), hmtx[name][0])
        clone_kerning(font, name, f"{name}.case")
        case_map[name] = f"{name}.case"
    if "periodcentered.loclCAT" in order and "periodcentered.loclCAT.case" in order:
        case_map["periodcentered.loclCAT"] = "periodcentered.loclCAT.case"
    if case_map:
        add_gsub_feature(font, "case", case_map)

    # ss01: capital I with serifs, so I / l / 1 / | never read alike in UI strings
    b = bounds(font, "I")
    if b:
        stem = b[2] - b[0]
        cx = (b[0] + b[2]) / 2
        t_b = flat_bounds(font, "T")
        bar = max(30.0, min(stem * 0.95, CAP_HEIGHT - max(y for x, y in glyf["T"].coordinates if y < CAP_HEIGHT - 5 and x < t_b[0] + 40)))
        half = 155 + 0.45 * (stem - 74)
        side = 0.62 * hmtx["I"][1]
        width = 2 * half + 2 * side
        shift = side + half - cx
        x0, x1, s0, s1 = cx - half + shift, cx + half + shift, b[0] + shift, b[2] + shift
        beam = [
            (x0, 0), (x0, bar), (s0, bar), (s0, CAP_HEIGHT - bar), (x0, CAP_HEIGHT - bar), (x0, CAP_HEIGHT),
            (x1, CAP_HEIGHT), (x1, CAP_HEIGHT - bar), (s1, CAP_HEIGHT - bar), (s1, bar), (x1, bar), (x1, 0),
        ]
        add_glyph(font, "I.ss01", polygon_glyph(None, [beam]), otRound(width))
        clone_kerning(font, "I", "I.ss01")
        ss01 = {"I": "I.ss01"}
        for accented in ("Iacute", "Icircumflex", "Idieresis", "Igrave"):
            if accented in order and glyf[accented].isComposite():
                parts = [
                    ("I.ss01" if c.glyphName == "I" else c.glyphName, c.x + (0 if c.glyphName == "I" else shift), c.y)
                    for c in glyf[accented].components
                ]
                add_glyph(font, f"{accented}.ss01", component_glyph(parts, metrics="I.ss01"), otRound(width))
                ss01[accented] = f"{accented}.ss01"
        add_gsub_feature(font, "ss01", ss01, ui_name="Serifed capital I")


# ---------------------------------------------------------------------------
# 6. italic


def italicize(font: TTFont, angle: float, condense: float, pivot: float) -> None:
    glyf, hmtx = font["glyf"], font["hmtx"]
    slope = math.tan(math.radians(angle))

    def tx(x, y):
        return condense * x + (y - pivot) * slope

    for name in font.getGlyphOrder():
        glyph = glyf[name]
        adv, _ = hmtx[name]
        if glyph.isComposite():
            for comp in glyph.components:
                comp.x = otRound(condense * comp.x + comp.y * slope)
        elif glyph.numberOfContours > 0:
            glyph.coordinates = GlyphCoordinates([(otRound(tx(x, y)), y) for x, y in glyph.coordinates])
        hmtx[name] = (otRound(adv * condense), 0)
    for name in font.getGlyphOrder():
        glyph = glyf[name]
        glyph.recalcBounds(glyf)
        if glyph.numberOfContours != 0:
            hmtx[name] = (hmtx[name][0], glyph.xMin)
    for _, anchor in iter_anchors(font):
        anchor.XCoordinate = otRound(tx(anchor.XCoordinate, anchor.YCoordinate))
    scale_kerning(font, condense)


# ---------------------------------------------------------------------------
# 7. metrics + names


def set_names(font: TTFont, profile: Profile, style: Style) -> None:
    name = font["name"]
    keep = {0, 13, 14}
    if "GSUB" in font:
        for record in font["GSUB"].table.FeatureList.FeatureRecord:
            params = record.Feature.FeatureParams
            if params is not None and getattr(params, "UINameID", None):
                keep.add(params.UINameID)
    name.names = [n for n in name.names if n.nameID in keep]
    ribbi = style.name in ("Regular", "Italic", "Bold", "Bold Italic")
    family = profile.family if ribbi else f"{profile.family} {style.name}"
    subfamily = style.name if ribbi else "Regular"
    ps_name = f"{profile.family.replace(' ', '')}-{style.name.replace(' ', '')}"
    values = {
        1: family,
        2: subfamily,
        3: f"{profile.revision:.3f};BJRK;{ps_name}",
        4: f"{profile.family} {style.name}",
        5: f"Version {profile.revision:.3f}; derived from Geist 1.401",
        6: ps_name,
        10: f"{profile.family}: a compact grotesk derived from Geist for Bjork UI.",
        13: "This Font Software is licensed under the SIL Open Font License, Version 1.1.",
        14: "https://openfontlicense.org",
    }
    if not ribbi:
        values[16] = profile.family
        values[17] = style.name
    for name_id, value in values.items():
        name.setName(value, name_id, 3, 1, 0x409)


def finalize(font: TTFont, profile: Profile, style: Style, x_height: float) -> None:
    os2, hhea, head, post = font["OS/2"], font["hhea"], font["head"], font["post"]
    for name in font.getGlyphOrder():
        font["glyf"][name].recalcBounds(font["glyf"])
    os2.usWeightClass = style.css_weight
    os2.fsSelection &= ~((1 << 0) | (1 << 5) | (1 << 6))
    os2.fsSelection |= 1 << 7  # USE_TYPO_METRICS
    head.macStyle &= ~0b11
    bold = style.css_weight >= 700
    if style.italic:
        os2.fsSelection |= 1 << 0
        head.macStyle |= 1 << 1
    if bold:
        os2.fsSelection |= 1 << 5
        head.macStyle |= 1 << 0
    if not style.italic and not bold:
        os2.fsSelection |= 1 << 6
    os2.achVendID = "BJRK"
    os2.sTypoAscender, os2.sTypoDescender, os2.sTypoLineGap = 980, -260, 0
    hhea.ascent, hhea.descent, hhea.lineGap = 980, -260, 0
    glyf = font["glyf"]
    y_max = max((glyf[g].yMax for g in font.getGlyphOrder() if glyf[g].numberOfContours), default=0)
    y_min = min((glyf[g].yMin for g in font.getGlyphOrder() if glyf[g].numberOfContours), default=0)
    os2.usWinAscent = max(1050, y_max + 20)
    os2.usWinDescent = max(320, -y_min + 20)
    os2.sxHeight = otRound(x_height)
    os2.sCapHeight = CAP_HEIGHT
    os2.recalcAvgCharWidth(font)
    if style.italic:
        post.italicAngle = -profile.italic_angle
        hhea.caretSlopeRise = 1000
        hhea.caretSlopeRun = otRound(1000 * math.tan(math.radians(profile.italic_angle)))
    else:
        post.italicAngle = 0
        hhea.caretSlopeRise, hhea.caretSlopeRun = 1, 0
    hhea.caretOffset = 0
    head.fontRevision = profile.revision
    if os.getenv("BJORK_KEEP_GLYPH_NAMES") != "1":
        post.formatType = 3.0  # production webfont: no glyph names (~1 KB per file)
    for tag in ("STAT", "MVAR", "HVAR", "VVAR", "fvar", "gvar", "avar", "cvar"):
        if tag in font:
            del font[tag]
    set_names(font, profile, style)


def check(font: TTFont) -> list[str]:
    problems = []
    glyf, hmtx = font["glyf"], font["hmtx"]
    for name in font.getGlyphOrder():
        glyph = glyf[name]
        glyph.recalcBounds(glyf)
        adv, lsb = hmtx[name]
        if glyph.numberOfContours != 0 and lsb != glyph.xMin:
            problems.append(f"{name}: lsb {lsb} != xMin {glyph.xMin}")
    tab = {hmtx[d][0] for d in DIGITS} | {hmtx[f"{d}.tf"][0] for d in DIGITS}
    if len(tab) != 1:
        problems.append(f"tabular figures not tabular: {sorted(tab)}")
    return problems


# ---------------------------------------------------------------------------


def build_style(profile: Profile, style: Style, source: Path, model: StrokeModel) -> Path:
    wx, wy_uc, wy_lc = style_weights(model, profile, style)
    tracking = style.tracking if style.tracking is not None else profile.tracking
    if os.getenv("BJORK_TRACKING"):
        tracking = env_float("BJORK_TRACKING", tracking)
    font = instance(source, wx, fresh=True)
    lower = lowercase_glyphs(font)
    merge_xy(font, instance(source, wy_uc), instance(source, wy_lc), lower)
    x_height, _ = raise_lowercase(font, lower, profile.xheight)

    sp = compact_simple(font, profile.compact, profile.spacing, tracking)
    build_composites(font, sp)
    compact_positioning(font, sp)
    pairs = dna_pairs(font)
    names = sorted({g for pair in pairs for g in pair})
    gaps_before = pair_gaps(font, side_profiles(font, names), pairs)
    apply_dna(font, profile.dna, x_height, sp.shift)
    build_composites(font, sp)
    kerned = dna_kerning(font, gaps_before, pairs)

    tabular_figures(font, sp, profile.compact, profile.spacing, tracking)
    ui_features(font)
    if style.italic:
        italicize(font, profile.italic_angle, profile.italic_condense, x_height / 2)
    finalize(font, profile, style, x_height)
    problems = check(font)
    if problems:
        raise SystemExit(f"{profile.prefix} {style.name}: " + "; ".join(problems[:8]))

    font.flavor = "woff2"
    out = OUT_DIR / f"{profile.prefix}-{style.name.replace(' ', '')}-{profile.version}.woff2"
    out.parent.mkdir(parents=True, exist_ok=True)
    font.save(out)
    print(f"{out}  wght x{wx:.0f} y{wy_uc:.0f}/{wy_lc:.0f}  track {tracking:g}  dna-kern {kerned}  {out.stat().st_size} bytes")
    return out


def main(argv: list[str]) -> None:
    source = find_source()
    model = StrokeModel(source)
    keys = [a for a in argv if a in PROFILES] or ["alpha", "display"]
    prefix_env = os.getenv("BJORK_PREFIX", "")
    if not [a for a in argv if a in PROFILES] and prefix_env:
        keys = ["display" if "Display" in prefix_env else "alpha"]
    for key in keys:
        profile = profile_from_env(PROFILES[key])
        styles = profile.styles[:1] if os.getenv("BJORK_ONLY_REGULAR") == "1" else profile.styles
        for style in styles:
            build_style(profile, style, source, model)


if __name__ == "__main__":
    main(sys.argv[1:])
