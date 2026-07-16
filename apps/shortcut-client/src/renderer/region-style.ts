import type { Point, PositionedRegion } from "./coordinate-mapper";

export type RegionBackgroundMode = "opaque" | "translucent";

export interface RegionLayout {
  height: number;
  fontSize: number;
}

export function classifyBackgroundPixels(pixels: Uint8ClampedArray): RegionBackgroundMode {
  if (pixels.length < 4) return "translucent";
  let count = 0;
  let whitePixels = 0;
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    const red = pixels[index] ?? 0;
    const green = pixels[index + 1] ?? 0;
    const blue = pixels[index + 2] ?? 0;
    const minimum = Math.min(red, green, blue);
    const maximum = Math.max(red, green, blue);
    if (minimum >= 225 && maximum - minimum <= 24) whitePixels += 1;
    count += 1;
  }
  if (count === 0) return "translucent";
  return whitePixels / count >= 0.72 ? "opaque" : "translucent";
}

export function detectRegionBackground(
  image: HTMLImageElement,
  polygon: Point[],
): RegionBackgroundMode {
  try {
    const xs = polygon.map(([x]) => x);
    const ys = polygon.map(([, y]) => y);
    const polygonLeft = Math.max(0, Math.min(...xs));
    const polygonTop = Math.max(0, Math.min(...ys));
    const polygonWidth = Math.max(1, Math.max(...xs) - polygonLeft);
    const polygonHeight = Math.max(1, Math.max(...ys) - polygonTop);
    const padding = Math.max(3, Math.round(Math.min(polygonWidth, polygonHeight) * 0.12));
    const left = Math.max(0, polygonLeft - padding);
    const top = Math.max(0, polygonTop - padding);
    const width = Math.min(image.naturalWidth - left, polygonWidth + padding * 2);
    const height = Math.min(image.naturalHeight - top, polygonHeight + padding * 2);
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return "translucent";
    context.drawImage(image, left, top, width, height, 0, 0, 32, 32);
    const sampled = context.getImageData(0, 0, 32, 32).data;
    const perimeter: number[] = [];
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < 32; x += 1) {
        if (x >= 6 && x < 26 && y >= 6 && y < 26) continue;
        const offset = (y * 32 + x) * 4;
        perimeter.push(
          sampled[offset] ?? 0,
          sampled[offset + 1] ?? 0,
          sampled[offset + 2] ?? 0,
          sampled[offset + 3] ?? 0,
        );
      }
    }
    return classifyBackgroundPixels(new Uint8ClampedArray(perimeter));
  } catch {
    return "translucent";
  }
}

function estimatedHeight(text: string, width: number, fontSize: number, padding: number): number {
  const usableWidth = Math.max(1, width - padding * 2);
  const charactersPerLine = Math.max(1, Math.floor(usableWidth / (fontSize * 0.9)));
  const visualCharacters = Array.from(text).length;
  const lines = Math.max(1, Math.ceil(visualCharacters / charactersPerLine));
  return lines * fontSize * 1.25 + padding * 2;
}

export function fitRegionLayout(position: PositionedRegion, text: string): RegionLayout {
  const padding = 8;
  const originalHeight = Math.max(1, position.height);
  for (
    let fontSize = Math.min(24, Math.max(12, position.height * 0.42));
    fontSize >= 8;
    fontSize -= 1
  ) {
    if (estimatedHeight(text, position.width, fontSize, padding) <= originalHeight) {
      return { height: originalHeight, fontSize };
    }
  }
  const expandedHeight = Math.min(
    Math.max(originalHeight + 24, originalHeight * 1.25),
    Math.max(originalHeight, estimatedHeight(text, position.width, 8, padding)),
  );
  return { height: expandedHeight, fontSize: 8 };
}
