import { describe, expect, it, vi } from "vitest";
import { mapPolygonToDocument } from "../src/renderer/coordinate-mapper";

describe("mapPolygonToDocument", () => {
  it("scales original image coordinates into document coordinates", () => {
    const image = document.createElement("img");
    vi.spyOn(image, "getBoundingClientRect").mockReturnValue({
      x: 20,
      y: 40,
      left: 20,
      top: 40,
      right: 420,
      bottom: 640,
      width: 400,
      height: 600,
      toJSON: () => ({}),
    });

    expect(
      mapPolygonToDocument(
        image,
        [
          [100, 200],
          [300, 200],
          [300, 600],
          [100, 600],
        ],
        800,
        1200,
      ),
    ).toEqual({ left: 70, top: 140, width: 100, height: 200 });
  });

  it("uses the live fractional DOM rectangle after request dimensions were rounded", () => {
    const image = document.createElement("img");
    vi.spyOn(image, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 399.5,
      bottom: 600.25,
      width: 399.5,
      height: 600.25,
      toJSON: () => ({}),
    });

    const mapped = mapPolygonToDocument(
      image,
      [
        [0, 0],
        [400, 0],
        [400, 600],
        [0, 600],
      ],
      400,
      600,
    );

    expect(mapped.width).toBeCloseTo(399.5, 6);
    expect(mapped.height).toBeCloseTo(600.25, 6);
  });
});
