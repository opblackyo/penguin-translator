from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "apps/shortcut-client/m2-test-page/assets"
WIDTH = 900


def font(size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        Path("C:/Windows/Fonts/malgun.ttf"),
        Path("/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"),
        Path("/System/Library/Fonts/AppleSDGothicNeo.ttc"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    raise SystemExit("A Korean-capable font is required to regenerate the M2 fixtures")


def webtoon(name: str, height: int, labels: list[tuple[int, str]]) -> None:
    image = Image.new("RGB", (WIDTH, height), "#dbeafe")
    draw = ImageDraw.Draw(image)
    for index, top in enumerate(range(0, height, 800)):
        fill = "#f8fafc" if index % 2 == 0 else "#e2e8f0"
        draw.rectangle(
            (20, top + 20, WIDTH - 20, min(height - 20, top + 780)), fill=fill
        )
        draw.rectangle(
            (20, top + 20, WIDTH - 20, min(height - 20, top + 780)),
            outline="#334155",
            width=6,
        )
    for top, text in labels:
        box = (110, top, 790, top + 260)
        draw.rounded_rectangle(box, radius=48, fill="white", outline="#0f172a", width=7)
        draw.multiline_text(
            (box[0] + 40, box[1] + 42),
            text,
            font=font(52),
            fill="#0f172a",
            spacing=14,
        )
    image.save(OUTPUT / name, format="PNG", optimize=True)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    webtoon(
        "long-webtoon.png",
        4800,
        [
            (160, "오늘은 좋은 날이에요."),
            (1120, "같이 가요!"),
            (2240, "Wait for me!"),
            (3520, "정말 고마워요."),
        ],
    )
    webtoon("page-slice.png", 1600, [(180, "다음 장면이에요."), (1040, "Keep going!")])
    webtoon(
        "lazy-page.png",
        1800,
        [(220, "늦게 불러온 이미지"), (1180, "Loaded after scroll")],
    )
    webtoon("delayed-page.png", 1400, [(320, "스크롤 후 추가됨")])

    avatar = Image.new("RGB", (96, 96), "#f59e0b")
    ImageDraw.Draw(avatar).ellipse((12, 12, 84, 84), fill="#fff7ed")
    avatar.save(OUTPUT / "avatar.png", format="PNG", optimize=True)

    banner = Image.new("RGB", (728, 90), "#1e293b")
    ImageDraw.Draw(banner).text(
        (28, 22), "SELF-CREATED BANNER", font=font(30), fill="white"
    )
    banner.save(OUTPUT / "ad-banner.png", format="PNG", optimize=True)


if __name__ == "__main__":
    main()
