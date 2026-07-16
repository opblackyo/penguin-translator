import type { Point, PositionedRegion } from "./coordinate-mapper";

export type RegionBackgroundMode = "opaque" | "translucent";

export interface RegionLayout {
  height: number;
  fontSize: number;
}

export function classifyBackgroundPixels(pixels: Uint8ClampedArray): RegionBackgroundMode {
  if (pixels.length < 4) return "translucent";
  let luminanceTotal = 0;
  let luminanceSquaredTotal = 0;
  let count = 0;
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    const luminance =
      (pixels[index] ?? 0) * 0.2126 +
      (pixels[index + 1] ?? 0) * 0.7152 +
      (pixels[index + 2] ?? 0) * 0.0722;
    luminanceTotal += luminance;
    luminanceSquaredTotal += luminance * luminance;
    count += 1;
  }
  if (count === 0) return "translucent";
  const average = luminanceTotal / count;
  const variance = Math.max(0, luminanceSquaredTotal / count - average * average);
  return average >= 235 && Math.sqrt(variance) <= 24 ? "opaque" : "translucent";
}

export function detectRegionBackground(
  image: HTMLImageElement,
  polygon: Point[],
): RegionBackgroundMode {
  try {
    const xs = polygon.map(([x]) => x);
    const ys = polygon.map(([, y]) => y);
    const left = Math.max(0, Math.min(...xs));
    const top = Math.max(0, Math.min(...ys));
    const width = Math.max(1, Math.max(...xs) - left);
    const height = Math.max(1, Math.max(...ys) - top);
    const canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 24;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return "translucent";
    context.drawImage(image, left, top, width, height, 0, 0, 24, 24);
    return classifyBackgroundPixels(context.getImageData(0, 0, 24, 24).data);
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
  const padding = 6;
  const maximumHeight = Math.max(position.height + 32, position.height * 1.5);
  const targetHeight = Math.min(
    maximumHeight,
    Math.max(position.height, estimatedHeight(text, position.width, 18, padding)),
  );
  for (
    let fontSize = Math.min(24, Math.max(12, position.height * 0.42));
    fontSize >= 10;
    fontSize -= 1
  ) {
    if (estimatedHeight(text, position.width, fontSize, padding) <= targetHeight) {
      return { height: targetHeight, fontSize };
    }
  }
  return { height: targetHeight, fontSize: 10 };
}
