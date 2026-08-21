#!/usr/bin/env python3
"""
Derive the desktop app icons from the source artwork.

The source (src/assets/minerva.png) is white line art on a transparent
background. That is correct for the console, where it always sits on void
black, and wrong for an app icon: on a light Dock, a light Windows taskbar,
or Finder in light mode, white-on-transparent is an invisible icon.

So both outputs composite the art onto Minerva's `void` black, and the two
platforms get the tile shape each expects:

  icon.png      1024x1024 full-bleed square      -> Windows .ico, Linux
  icon.mac.png  1024x1024 rounded tile, inset    -> macOS .icns

Re-run after changing the artwork:  python3 desktop/build/make-icons.py
"""

from PIL import Image, ImageDraw
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
SOURCE = HERE.parent.parent / "src" / "assets" / "minerva.png"

CANVAS = 1024
VOID = (0, 0, 0, 255)            # --color-void
SIGNAL_20 = (255, 255, 255, 51)  # border-signal/20

# Apple's icon grid: on a 1024 canvas the tile is 824 wide with a 185.4 radius.
MAC_INSET = 100
MAC_RADIUS = 186


def load_art() -> Image.Image:
    art = Image.open(SOURCE).convert("RGBA")
    return art.crop(art.getbbox())  # drop the transparent margin, we set our own


def fit(art: Image.Image, box: int) -> Image.Image:
    scale = box / max(art.size)
    size = (max(1, round(art.width * scale)), max(1, round(art.height * scale)))
    return art.resize(size, Image.LANCZOS)


def paste_centre(base: Image.Image, art: Image.Image) -> None:
    x = (base.width - art.width) // 2
    y = (base.height - art.height) // 2
    base.alpha_composite(art, (x, y))


def build_square(art: Image.Image) -> Image.Image:
    """Full-bleed tile. Windows crops nothing, so the art keeps a small margin."""
    canvas = Image.new("RGBA", (CANVAS, CANVAS), VOID)
    paste_centre(canvas, fit(art, round(CANVAS * 0.80)))
    edge = ImageDraw.Draw(canvas)
    edge.rectangle([0, 0, CANVAS - 1, CANVAS - 1], outline=SIGNAL_20, width=8)
    return canvas


def build_mac(art: Image.Image) -> Image.Image:
    """Rounded tile inset in a transparent canvas, the way macOS expects."""
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    tile = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    ImageDraw.Draw(tile).rounded_rectangle(
        [MAC_INSET, MAC_INSET, CANVAS - MAC_INSET - 1, CANVAS - MAC_INSET - 1],
        radius=MAC_RADIUS,
        fill=VOID,
        outline=SIGNAL_20,
        width=6,
    )
    canvas.alpha_composite(tile)
    paste_centre(canvas, fit(art, round((CANVAS - 2 * MAC_INSET) * 0.76)))
    return canvas


def main() -> None:
    art = load_art()
    build_square(art).save(HERE / "icon.png")
    build_mac(art).save(HERE / "icon.mac.png")
    print(f"source     {SOURCE}  ({art.width}x{art.height} after crop)")
    print(f"wrote      {HERE / 'icon.png'}       1024x1024 full-bleed")
    print(f"wrote      {HERE / 'icon.mac.png'}   1024x1024 rounded tile")


if __name__ == "__main__":
    main()
