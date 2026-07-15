export type Point = [number, number];

export interface PositionedRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function mapPolygonToDocument(
  image: HTMLImageElement,
  polygon: Point[],
  sourceWidth: number,
  sourceHeight: number,
): PositionedRegion {
  if (polygon.length !== 4 || sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("A four-point polygon and positive source dimensions are required.");
  }

  const rect = image.getBoundingClientRect();
  const xs = polygon.map(([x]) => x);
  const ys = polygon.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scaleX = rect.width / sourceWidth;
  const scaleY = rect.height / sourceHeight;

  return {
    left: window.scrollX + rect.left + minX * scaleX,
    top: window.scrollY + rect.top + minY * scaleY,
    width: (maxX - minX) * scaleX,
    height: (maxY - minY) * scaleY,
  };
}
