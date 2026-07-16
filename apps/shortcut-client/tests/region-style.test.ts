import { describe, expect, it } from "vitest";
import { classifyBackgroundPixels, fitRegionLayout } from "../src/renderer/region-style";

describe("M2 region styling", () => {
  it("uses an opaque cover only for consistently white pixels", () => {
    expect(
      classifyBackgroundPixels(new Uint8ClampedArray([250, 250, 250, 255, 245, 245, 245, 255])),
    ).toBe("opaque");
    expect(
      classifyBackgroundPixels(new Uint8ClampedArray([250, 250, 250, 255, 20, 30, 40, 255])),
    ).toBe("translucent");
  });

  it("fits long Traditional Chinese text with bounded expansion and font size", () => {
    const position = { left: 0, top: 0, width: 100, height: 40 };
    const layout = fitRegionLayout(
      position,
      "這是一段需要自動換行而且不能溢出文字框的繁體中文譯文",
    );

    expect(layout.height).toBeGreaterThanOrEqual(40);
    expect(layout.height).toBeLessThanOrEqual(72);
    expect(layout.fontSize).toBeGreaterThanOrEqual(10);
    expect(layout.fontSize).toBeLessThanOrEqual(24);
  });
});
