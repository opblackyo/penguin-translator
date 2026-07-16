import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RETRY_REQUESTED_KEY } from "../src/shared/control-requests";

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState({}, "", "/");
  vi.doUnmock("../src/extractor/collect-images");
  vi.resetModules();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, RETRY_REQUESTED_KEY);
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
    expect(JSON.parse(serialized as string)).toMatchObject({
      batch_request: {
        images: [],
        source_language: "auto",
        target_language: "zh-Hant",
        reading_order: "auto",
      },
    });
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
      collectPageImagesWithDiagnostics: () => {
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

  it("consumes a retry request and returns only the requested stable image IDs", async () => {
    Reflect.set(window, RETRY_REQUESTED_KEY, ["penguin-image-retry"]);
    vi.doMock("../src/extractor/collect-images", () => ({
      collectPageImagesWithDiagnostics: () => ({
        images: [
          {
            client_image_id: "penguin-image-ok",
            source_kind: "url",
            source: "https://example.com/ok.png",
            rendered_width: 400,
            rendered_height: 600,
          },
          {
            client_image_id: "penguin-image-retry",
            source_kind: "url",
            source: "https://example.com/retry.png",
            rendered_width: 400,
            rendered_height: 600,
          },
        ],
        diagnostics: { total_images: 2, accepted_images: 2, rejected: [] },
        warnings: [],
      }),
    }));
    const completion = vi.fn();
    vi.stubGlobal("completion", completion);

    await import("../src/extractor/entry");

    expect(JSON.parse(completion.mock.calls[0]?.[0] as string)).toMatchObject({
      images: [{ client_image_id: "penguin-image-retry" }],
      warnings: ["RETRY_FAILURES_REQUESTED"],
      control: { retry_requested: ["penguin-image-retry"] },
    });
    expect(Reflect.has(window, RETRY_REQUESTED_KEY)).toBe(false);
  });

  it("completes with partial images when the lazy scan reaches its time budget", async () => {
    vi.doMock("../src/extractor/collect-images", () => ({
      collectPageImagesWithDiagnostics: () => ({
        images: [
          {
            client_image_id: "penguin-image-partial",
            source_kind: "url",
            source: "https://example.com/partial.png",
            rendered_width: 400,
            rendered_height: 600,
          },
        ],
        diagnostics: { total_images: 2, accepted_images: 1, rejected: [] },
        warnings: ["LAZY_SCAN_TIME_BUDGET_REACHED"],
      }),
    }));
    const completion = vi.fn();
    vi.stubGlobal("completion", completion);

    await import("../src/extractor/entry");

    expect(completion).toHaveBeenCalledOnce();
    expect(JSON.parse(completion.mock.calls[0]?.[0] as string)).toMatchObject({
      images: [{ client_image_id: "penguin-image-partial" }],
      warnings: ["LAZY_SCAN_TIME_BUDGET_REACHED"],
    });
  });
});
