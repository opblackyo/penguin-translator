import type { OverlayRegion } from "./overlay-root";
import { fitRegionLayout } from "./region-style";

export interface LayoutBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function overlapArea(left: OverlayRegion, right: OverlayRegion): number {
  const overlapWidth = Math.max(
    0,
    Math.min(left.position.left + left.position.width, right.position.left + right.position.width) -
      Math.max(left.position.left, right.position.left),
  );
  const overlapHeight = Math.max(
    0,
    Math.min(left.position.top + left.position.height, right.position.top + right.position.height) -
      Math.max(left.position.top, right.position.top),
  );
  return overlapWidth * overlapHeight;
}

function isDuplicate(left: OverlayRegion, right: OverlayRegion): boolean {
  const leftArea = Math.max(1, left.position.width * left.position.height);
  const rightArea = Math.max(1, right.position.width * right.position.height);
  const sameText =
    left.translatedText.trim() === right.translatedText.trim() &&
    left.sourceText.trim() === right.sourceText.trim();
  return sameText && overlapArea(left, right) / Math.min(leftArea, rightArea) >= 0.82;
}

function collides(candidate: OverlayRegion, placed: OverlayRegion[]): boolean {
  return placed.some((region) => overlapArea(candidate, region) > 4);
}

export function layoutOverlayRegions(
  input: OverlayRegion[],
  bounds: LayoutBounds,
): OverlayRegion[] {
  const placed: OverlayRegion[] = [];
  const sorted = [...input].sort(
    (left, right) =>
      left.position.top - right.position.top || left.position.left - right.position.left,
  );
  for (const region of sorted) {
    if (placed.some((candidate) => isDuplicate(candidate, region))) continue;
    const fitted = fitRegionLayout(region.position, region.translatedText);
    const width = Math.min(region.position.width, Math.max(1, bounds.right - bounds.left));
    const height = Math.min(fitted.height, Math.max(1, bounds.bottom - bounds.top));
    const centeredTop = region.position.top - (height - region.position.height) / 2;
    const base: OverlayRegion = {
      ...region,
      position: {
        left: Math.min(Math.max(region.position.left, bounds.left), bounds.right - width),
        top: Math.min(Math.max(centeredTop, bounds.top), bounds.bottom - height),
        width,
        height,
      },
    };
    if (!collides(base, placed)) {
      placed.push(base);
      continue;
    }
    const gap = 4;
    const latestBottom = Math.max(
      ...placed.map((candidate) => candidate.position.top + candidate.position.height),
    );
    const below = {
      ...base,
      position: { ...base.position, top: latestBottom + gap },
    };
    if (below.position.top + height <= bounds.bottom && !collides(below, placed)) {
      placed.push(below);
      continue;
    }
    const earliestTop = Math.min(...placed.map((candidate) => candidate.position.top));
    const above = {
      ...base,
      position: { ...base.position, top: earliestTop - height - gap },
    };
    if (above.position.top >= bounds.top && !collides(above, placed)) {
      placed.push(above);
    }
  }
  return placed;
}
