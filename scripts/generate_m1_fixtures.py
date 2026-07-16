from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "apps/shortcut-client/m1-test-page/assets"
WIDTH = 900
HEIGHT = 1200


def font(size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        Path("C:/Windows/Fonts/malgun.ttf"),
        Path("/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"),
        Path("/System/Library/Fonts/AppleSDGothicNeo.ttc"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    raise SystemExit("A Korean-capable font is required to regenerate the M1 fixtures")


def canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGB", (WIDTH, HEIGHT), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((20, 20, WIDTH - 20, HEIGHT - 20), outline="#263238", width=8)
    return image, draw


def bubble(
    draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str
) -> None:
    draw.rounded_rectangle(box, radius=42, fill="white", outline="#111111", width=7)
    draw.multiline_text(
        (box[0] + 38, box[1] + 38),
        text,
        font=font(58),
        fill="#111111",
        spacing=18,
    )


def save(name: str, bubbles: list[tuple[tuple[int, int, int, int], str]]) -> None:
    image, draw = canvas()
    for box, text in bubbles:
        bubble(draw, box, text)
    image.save(OUTPUT / name, format="PNG", optimize=True)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    save(
        "korean-dialogue.png",
        [
            ((90, 120, 810, 390), "안녕하세요!\n오늘도 힘내요."),
            ((160, 650, 760, 890), "정말 고마워요."),
        ],
    )
    save(
        "english-dialogue.png",
        [
            ((100, 150, 800, 400), "Hello!\nAre you ready?"),
            ((160, 680, 760, 900), "Let's go together."),
        ],
    )
    save(
        "mixed-dialogue.png",
        [
            ((90, 120, 810, 400), "Penguin, 안녕!\nReady to go?"),
            ((130, 650, 780, 920), "네, let's start!"),
        ],
    )
    save("empty-page.png", [])


if __name__ == "__main__":
    main()
