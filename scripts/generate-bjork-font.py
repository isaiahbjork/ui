import os
from pathlib import Path

from fontTools.misc.transform import Transform
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "node_modules/next/dist/client/components/react-dev-overlay/font/geist-latin.woff2"
FAMILY = os.getenv("BJORK_FAMILY", "Bjork Grotesk Alpha")
PREFIX = os.getenv("BJORK_PREFIX", "BjorkGroteskAlpha")
STYLES = [
    ("Regular", int(os.getenv("BJORK_REGULAR_WEIGHT", "320")), "normal", 400),
    ("Medium", int(os.getenv("BJORK_MEDIUM_WEIGHT", "450")), "normal", 500),
    ("Semibold", int(os.getenv("BJORK_SEMIBOLD_WEIGHT", "580")), "normal", 600),
    ("Bold", int(os.getenv("BJORK_BOLD_WEIGHT", "740")), "normal", 700),
    ("Italic", int(os.getenv("BJORK_REGULAR_WEIGHT", "320")), "italic", 400),
    ("Bold Italic", int(os.getenv("BJORK_BOLD_WEIGHT", "740")), "italic", 700),
]

COMPACT_FACTOR = float(os.getenv("BJORK_COMPACT_FACTOR", "0.918"))
ADVANCE_FACTOR = float(os.getenv("BJORK_ADVANCE_FACTOR", "0.966"))
LSB_FACTOR = float(os.getenv("BJORK_LSB_FACTOR", "0.78"))
XHEIGHT_FACTOR = float(os.getenv("BJORK_XHEIGHT_FACTOR", "1.035"))
ASCENDER_FACTOR = float(os.getenv("BJORK_ASCENDER_FACTOR", "1.018"))
DNA_STRENGTH = float(os.getenv("BJORK_DNA_STRENGTH", "0.75"))
Q_TAIL_FACTOR = float(os.getenv("BJORK_Q_TAIL_FACTOR", "0.65"))
ITALIC_DEGREES = float(os.getenv("BJORK_ITALIC_DEGREES", "-6"))
VERSION = os.getenv("BJORK_VERSION", "v11")


def scaled(value: float, factor: float = 1) -> int:
    return round(value * factor)


def set_name(font: TTFont, family: str, style: str) -> None:
    full_name = f"{family} {style}"
    ps_name = f"{family.replace(' ', '')}-{style.replace(' ', '')}"
    values = {
        1: family,
        2: style,
        3: f"{family} {style}; generated for Bjork UI",
        4: full_name,
        6: ps_name,
        16: family,
        17: style,
    }

    name_table = font["name"]
    for name_id, value in values.items():
        for platform_id, plat_enc_id, lang_id in ((3, 1, 0x409), (1, 0, 0)):
            name_table.setName(value, name_id, platform_id, plat_enc_id, lang_id)


def compact_glyphs(font: TTFont, factor: float = COMPACT_FACTOR) -> None:
    glyf = font["glyf"]
    hmtx = font["hmtx"]

    for glyph_name in font.getGlyphOrder():
        glyph = glyf[glyph_name]
        if glyph_name == ".notdef" or glyph.isComposite():
            continue

        glyph.recalcBounds(glyf)
        if glyph.xMin is None or glyph.xMax is None:
            continue

        width = glyph.xMax - glyph.xMin
        if width <= 0:
            continue

        center = glyph.xMin + width / 2
        coordinates, _, _ = glyph.getCoordinates(glyf)
        for i, (x, y) in enumerate(coordinates):
            coordinates[i] = (round(center + (x - center) * factor), y)
        glyph.coordinates = coordinates
        glyph.recalcBounds(glyf)

        advance, left_side_bearing = hmtx[glyph_name]
        hmtx[glyph_name] = (round(advance * ADVANCE_FACTOR), round(left_side_bearing * LSB_FACTOR))


def mutate_glyph(font: TTFont, char: str, mutate) -> None:
    cmap = font.getBestCmap()
    glyph_name = cmap.get(ord(char))
    if not glyph_name:
        return

    glyf = font["glyf"]
    glyph = glyf[glyph_name]
    if glyph.isComposite():
        return

    glyph.recalcBounds(glyf)
    coordinates, _, _ = glyph.getCoordinates(glyf)
    bbox = (glyph.xMin, glyph.yMin, glyph.xMax, glyph.yMax)
    for i, (x, y) in enumerate(coordinates):
        coordinates[i] = mutate(x, y, bbox)
    glyph.coordinates = coordinates
    glyph.recalcBounds(glyf)


def shift_zone(dx=0, dy=0, where=lambda _x, _y, _bbox: True):
    def mutate(x, y, bbox):
        if where(x, y, bbox):
            return (round(x + dx), round(y + dy))
        return (x, y)

    return mutate


def scale_y_zone(factor=1, pivot=0, where=lambda _x, _y, _bbox: True):
    def mutate(x, y, bbox):
        if where(x, y, bbox):
            return (x, round(pivot + (y - pivot) * factor))
        return (x, y)

    return mutate


def apply_bjork_dna(font: TTFont) -> None:
    glyf = font["glyf"]
    hmtx = font["hmtx"]

    for char in "acegmnopqrsuvwxyz":
        mutate_glyph(
            font,
            char,
            scale_y_zone(
                factor=XHEIGHT_FACTOR,
                pivot=0,
                where=lambda _x, y, _bbox: 0 < y < 560,
            ),
        )

    for char in "bdfhijklt":
        mutate_glyph(
            font,
            char,
            scale_y_zone(
                factor=ASCENDER_FACTOR,
                pivot=0,
                where=lambda _x, y, bbox: 0 < y < bbox[1] + (bbox[3] - bbox[1]) * 0.78,
            ),
        )

    for char in "Kk":
        mutate_glyph(
            font,
            char,
            shift_zone(
                dx=scaled(48, DNA_STRENGTH),
                dy=0,
                where=lambda x, y, bbox: x > bbox[0] + (bbox[2] - bbox[0]) * 0.58 and y > bbox[1] + 80,
            ),
        )
        mutate_glyph(
            font,
            char,
            shift_zone(
                dx=scaled(42, DNA_STRENGTH),
                dy=scaled(-18, DNA_STRENGTH),
                where=lambda x, y, bbox: x > bbox[0] + (bbox[2] - bbox[0]) * 0.62 and y < bbox[1] + (bbox[3] - bbox[1]) * 0.34,
            ),
        )

    for char in "Rr":
        mutate_glyph(
            font,
            char,
            shift_zone(
                dx=scaled(58, DNA_STRENGTH),
                dy=scaled(-20, DNA_STRENGTH),
                where=lambda x, y, bbox: x > bbox[0] + (bbox[2] - bbox[0]) * 0.68 and y < bbox[1] + (bbox[3] - bbox[1]) * 0.45,
            ),
        )

    for char in "Qq":
        mutate_glyph(
            font,
            char,
            shift_zone(
                dx=scaled(38, DNA_STRENGTH * Q_TAIL_FACTOR),
                dy=scaled(-16, DNA_STRENGTH * Q_TAIL_FACTOR),
                where=lambda x, y, bbox: x > bbox[0] + (bbox[2] - bbox[0]) * 0.62 and y < bbox[1] + (bbox[3] - bbox[1]) * 0.2,
            ),
        )

    for char in "Jj":
        mutate_glyph(
            font,
            char,
            shift_zone(
                dx=scaled(-48, DNA_STRENGTH),
                dy=0,
                where=lambda x, y, bbox: y < bbox[1] + (bbox[3] - bbox[1]) * 0.22,
            ),
        )

    for char in "aeg":
        mutate_glyph(
            font,
            char,
            shift_zone(
                dx=scaled(26, DNA_STRENGTH),
                dy=0,
                where=lambda x, y, bbox: x > bbox[0] + (bbox[2] - bbox[0]) * 0.72 and y > bbox[1] + (bbox[3] - bbox[1]) * 0.55,
            ),
        )
        mutate_glyph(
            font,
            char,
            shift_zone(
                dx=scaled(-16, DNA_STRENGTH),
                dy=0,
                where=lambda x, y, bbox: x < bbox[0] + (bbox[2] - bbox[0]) * 0.18 and y < bbox[1] + (bbox[3] - bbox[1]) * 0.36,
            ),
        )

    mutate_glyph(
        font,
        "t",
        shift_zone(
            dx=scaled(38, DNA_STRENGTH),
            dy=0,
            where=lambda x, y, bbox: y > bbox[1] + (bbox[3] - bbox[1]) * 0.64 and x > bbox[0] + (bbox[2] - bbox[0]) * 0.66,
        ),
    )
    mutate_glyph(
        font,
        "y",
        shift_zone(
            dx=scaled(34, DNA_STRENGTH),
            dy=scaled(-24, DNA_STRENGTH),
            where=lambda x, y, bbox: y < bbox[1] + (bbox[3] - bbox[1]) * 0.18 and x > bbox[0] + (bbox[2] - bbox[0]) * 0.52,
        ),
    )

    digit_names = [font.getBestCmap().get(ord(char)) for char in "0123456789"]
    digit_names = [name for name in digit_names if name]
    if digit_names:
        target_advance = min(max(hmtx[name][0] for name in digit_names), 580)
        for name in digit_names:
            glyph = glyf[name]
            glyph.recalcBounds(glyf)
            advance, lsb = hmtx[name]
            delta = round((target_advance - advance) / 2)
            if delta:
                coordinates, _, _ = glyph.getCoordinates(glyf)
                for i, (x, y) in enumerate(coordinates):
                    coordinates[i] = (x + delta, y)
                glyph.coordinates = coordinates
                glyph.recalcBounds(glyf)
            hmtx[name] = (target_advance, max(0, lsb + delta))


def slant_glyphs(font: TTFont, degrees: float = ITALIC_DEGREES) -> None:
    glyf = font["glyf"]
    transform = Transform().skew(degrees)

    for glyph_name in font.getGlyphOrder():
        glyph = glyf[glyph_name]
        if glyph_name == ".notdef" or glyph.isComposite():
            continue

        coordinates, _, _ = glyph.getCoordinates(glyf)
        for i, (x, y) in enumerate(coordinates):
            coordinates[i] = transform.transformPoint((x, y))
        glyph.coordinates = coordinates
        glyph.recalcBounds(glyf)


def tune_metrics(font: TTFont, weight: int, style: str) -> None:
    os2 = font["OS/2"]
    hhea = font["hhea"]
    head = font["head"]

    os2.usWeightClass = weight
    os2.fsSelection &= ~((1 << 0) | (1 << 5) | (1 << 6))
    head.macStyle &= ~((1 << 0) | (1 << 1))
    if style == "italic":
        os2.fsSelection |= 1 << 0
        head.macStyle |= 1 << 1
    if weight >= 700:
        os2.fsSelection |= 1 << 5
        head.macStyle |= 1 << 0
    if style == "normal" and weight < 700:
        os2.fsSelection |= 1 << 6
    os2.sTypoAscender = 980
    os2.sTypoDescender = -260
    os2.sTypoLineGap = 0
    os2.usWinAscent = 1050
    os2.usWinDescent = 320
    hhea.ascent = 980
    hhea.descent = -260
    hhea.lineGap = 0


def build_style(style_name: str, source_weight: int, css_style: str, css_weight: int) -> Path:
    font = TTFont(SOURCE)
    font = instancer.instantiateVariableFont(font, {"wght": source_weight}, inplace=False)
    font.flavor = "woff2"

    compact_glyphs(font)
    apply_bjork_dna(font)
    if css_style == "italic":
        slant_glyphs(font)
    tune_metrics(font, css_weight, css_style)
    set_name(font, FAMILY, style_name)

    file_style = style_name.replace(" ", "")
    out = ROOT / f"public/fonts/{PREFIX}-{file_style}-{VERSION}.woff2"
    out.parent.mkdir(parents=True, exist_ok=True)
    font.save(out)
    return out


def main() -> None:
    styles = STYLES[:1] if os.getenv("BJORK_ONLY_REGULAR") == "1" else STYLES
    for style in styles:
        print(build_style(*style))


if __name__ == "__main__":
    main()
