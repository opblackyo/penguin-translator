import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState({}, "", "/");
  vi.doUnmock("../src/extractor/collect-images");
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("extractor entry", () => {
  it("always completes its normal path with serializable JSON", async () => {
    const completion = vi.fn();
    vi.stubGlobal("completion", completion);

    await import("../src/extractor/entry");

    expect(completion).toHaveBeenCalledOnce();
    const serialized = completion.mock.calls[0]?.[0];
    expect(typeof serialized).toBe("string");
    expect(() => JSON.parse(serialized as string)).not.toThrow();
    expect(JSON.parse(serialized as string)).toMatchObject({ images: [], warnings: [] });
    expect(JSON.parse(serialized as string)).not.toHaveProperty("debug");
  });

  it("includes diagnostics only when debug mode is explicitly enabled", async () => {
    window.history.replaceState({}, "", "/?penguin-debug=1");
    const completion = vi.fn();
    vi.stubGlobal("completion", completion);

    await import("../src/extractor/entry");

    expect(JSON.parse(completion.mock.calls[0]?.[0] as string)).toMatchObject({
      images: [],
      debug: { total_images: 0, accepted_images: 0, rejected: [] },
    });
  });

  it("always completes with structured JSON when collection throws", async () => {
    vi.doMock("../src/extractor/collect-images", () => ({
      collectVisibleImagesWithDiagnostics: () => {
        throw new Error("collection failed");
      },
    }));
    const completion = vi.fn();
    vi.stubGlobal("completion", completion);

    await import("../src/extractor/entry");

    expect(completion).toHaveBeenCalledOnce();
    expect(JSON.parse(completion.mock.calls[0]?.[0] as string)).toMatchObject({
      images: [],
      errors: [{ code: "SHORTCUT_SCRIPT_ERROR", message: "collection failed" }],
    });
  });
});
