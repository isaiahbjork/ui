import itertools
import json
import os
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PYTHON = "/opt/homebrew/opt/python@3.11/bin/python3.11"
GENERATOR = ROOT / "scripts/generate-bjork-font.py"
GEIST = ROOT / "node_modules/next/dist/client/components/react-dev-overlay/font/geist-latin.woff2"
ALPHA_REGULAR = ROOT / "public/fonts/BjorkGroteskAlpha-Regular-v12.woff2"
DISPLAY_REGULAR = ROOT / "public/fonts/BjorkGroteskDisplay-Regular-v2.woff2"
FK_RASTER = ROOT / "public/fonts/FKRasterGroteskTrial-Rounded.woff2"

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


def metric_distance(a: dict[str, dict[str, float]], b: dict[str, dict[str, float]], chars: str) -> float:
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


def rhythm_score(metrics: dict[str, dict[str, float]]) -> float:
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
    small_density_ratio = render_density(
        font_path, "Review Bjork UI specimen 12,840", 16
    ) / max(render_density(GEIST, "Review Bjork UI specimen 12,840", 16), 0.001)
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


def generate_candidate(params: dict[str, str], version: str) -> Path:
    env = os.environ.copy()
    env.update(params)
    env["BJORK_VERSION"] = version
    env["BJORK_ONLY_REGULAR"] = "1"
    subprocess.run([PYTHON, str(GENERATOR)], cwd=ROOT, env=env, check=True, stdout=subprocess.DEVNULL)
    prefix = env.get("BJORK_PREFIX", "BjorkGroteskAlpha")
    return ROOT / f"public/fonts/{prefix}-Regular-{version}.woff2"


def search() -> None:
    profile = os.getenv("BJORK_SCORE_PROFILE", "alpha")
    if profile == "display":
        grid = {
            "BJORK_REGULAR_WEIGHT": ["360", "380", "400"],
            "BJORK_COMPACT_FACTOR": ["0.87", "0.885", "0.9"],
            "BJORK_ADVANCE_FACTOR": ["0.925", "0.945"],
            "BJORK_XHEIGHT_FACTOR": ["1.02", "1.04"],
            "BJORK_DNA_STRENGTH": ["1.25", "1.45", "1.65"],
            "BJORK_Q_TAIL_FACTOR": ["0.75", "0.95"],
        }
    else:
        grid = {
            "BJORK_REGULAR_WEIGHT": ["300", "320", "340"],
            "BJORK_COMPACT_FACTOR": ["0.91", "0.918", "0.93"],
            "BJORK_ADVANCE_FACTOR": ["0.948", "0.966", "0.982"],
            "BJORK_XHEIGHT_FACTOR": ["1.025", "1.035", "1.05"],
            "BJORK_DNA_STRENGTH": ["0.65", "0.75", "0.9"],
            "BJORK_Q_TAIL_FACTOR": ["0.55", "0.65", "0.8"],
        }
    keys = list(grid)
    rows = []
    for index, values in enumerate(itertools.product(*(grid[key] for key in keys))):
        params = dict(zip(keys, values))
        if os.getenv("BJORK_SEARCH_FAMILY"):
            params["BJORK_FAMILY"] = os.getenv("BJORK_SEARCH_FAMILY", "")
        if os.getenv("BJORK_SEARCH_PREFIX"):
            params["BJORK_PREFIX"] = os.getenv("BJORK_SEARCH_PREFIX", "")
        version = f"search{index}"
        font_path = generate_candidate(params, version)
        result = score_current(font_path, profile)
        rows.append({**result, "version": version, **params})

    rows.sort(key=lambda row: row["score"], reverse=True)
    print(json.dumps(rows[:12], indent=2))


if __name__ == "__main__":
    profile = os.getenv("BJORK_SCORE_PROFILE", "alpha")
    if os.getenv("BJORK_SEARCH") == "1":
        search()
    else:
        default_font = DISPLAY_REGULAR if profile == "display" else ALPHA_REGULAR
        font_path = Path(os.getenv("BJORK_SCORE_FONT", str(default_font)))
        print(json.dumps(score_current(font_path, profile), indent=2))
