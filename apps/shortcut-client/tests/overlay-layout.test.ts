import { describe, expect, it } from "vitest";
import { layoutOverlayRegions } from "../src/renderer/overlay-layout";
import type { OverlayRegion } from "../src/renderer/overlay-root";

function region(key: string, top: number, text = key): OverlayRegion {
  return {
    key,
    position: { left: 10, top, width: 120, height: 40 },
    sourceText: text,
    translatedText: text,
    backgroundMode: "opaque",
  };
}

describe("overlay collision layout", () => {
  it("suppresses near-identical duplicate regions", () => {
    const output = layoutOverlayRegions([region("one", 10, "相同"), region("two", 12, "相同")], {
      left: 0,
      top: 0,
      right: 200,
      bottom: 300,
    });

    expect(output).toHaveLength(1);
  });

  it("moves overlapping boxes apart and keeps them inside the image", () => {
    const output = layoutOverlayRegions([region("one", 10), region("two", 20)], {
      left: 0,
      top: 0,
      right: 200,
      bottom: 160,
    });

    expect(output).toHaveLength(2);
    const [first, second] = output;
    if (!first || !second) throw new Error("Expected two laid-out regions");
    expect(second.position.top).toBeGreaterThanOrEqual(first.position.top + first.position.height);
    expect(second.position.top + second.position.height).toBeLessThanOrEqual(160);
  });

  it("clamps expanded long-text boxes to image bounds", () => {
    const output = layoutOverlayRegions(
      [region("long", 130, "這是一段很長很長而且必須保持在圖片範圍內的繁體中文譯文")],
      { left: 0, top: 0, right: 160, bottom: 160 },
    );

    const [laidOut] = output;
    if (!laidOut) throw new Error("Expected one laid-out region");
    expect(laidOut.position.top).toBeGreaterThanOrEqual(0);
    expect(laidOut.position.top + laidOut.position.height).toBeLessThanOrEqual(160);
  });

  it("centers height expansion instead of growing only downward", () => {
    const item = region("long", 80, "這是一段很長很長而且需要擴張文字框的繁體中文譯文");
    item.position.width = 70;
    item.position.height = 24;

    const output = layoutOverlayRegions([item], {
      left: 0,
      top: 0,
      right: 200,
      bottom: 220,
    });

    const [laidOut] = output;
    if (!laidOut) throw new Error("Expected one laid-out region");
    expect(laidOut.position.height).toBeGreaterThan(24);
    expect(laidOut.position.top).toBeLessThan(80);
  });

  it("does not draw one translation box over another when no safe space exists", () => {
    const output = layoutOverlayRegions([region("one", 0), region("two", 2)], {
      left: 0,
      top: 0,
      right: 140,
      bottom: 42,
    });

    expect(output).toHaveLength(1);
  });
});
