import { describe, expect, it, vi } from "vitest";
import { getVisibilityRejectionReasons, isElementVisible } from "../src/extractor/visibility";

describe("isElementVisible", () => {
  it("accepts an element intersecting the viewport", () => {
    const element = document.createElement("div");
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 10,
      top: 10,
      right: 300,
      bottom: 310,
      left: 0,
      width: 300,
      height: 300,
      toJSON: () => ({}),
    });

    expect(isElementVisible(element)).toBe(true);
  });

  it("rejects an element below the viewport", () => {
    const element = document.createElement("div");
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: window.innerHeight + 1,
      top: window.innerHeight + 1,
      right: 300,
      bottom: window.innerHeight + 301,
      left: 0,
      width: 300,
      height: 300,
      toJSON: () => ({}),
    });

    expect(isElementVisible(element)).toBe(false);
    expect(getVisibilityRejectionReasons(element)).toEqual(["OUTSIDE_VIEWPORT_BELOW"]);
  });
});
