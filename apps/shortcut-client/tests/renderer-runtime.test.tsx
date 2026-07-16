import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CANCEL_EVENT,
  CANCEL_REQUESTED_KEY,
  mount,
  PANEL_ID,
  RETRY_FAILURES_EVENT,
  RETRY_REQUESTED_KEY,
  ROOT_ID,
  removeExisting,
  runRenderer,
  type TranslationResult,
} from "../src/renderer/runtime";
import { IMAGE_ID_ATTRIBUTE } from "../src/shared/image-identity";

function domRect(left = 20, top = 40, width = 400, height = 600): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  };
}

function result(clientImageId: string): TranslationResult {
  return {
    request_id: "123e4567-e89b-12d3-a456-426614174000",
    client_image_id: clientImageId,
    image_id: "a".repeat(64),
    image_width: 800,
    image_height: 1200,
    regions: [
      {
        region_id: "region-1",
        polygon: [
          [100, 200],
          [300, 200],
          [300, 600],
          [100, 600],
        ],
        source_text: "テスト",
        translated_text: "測試譯文",
        orientation: "vertical",
        background_style: "opaque",
        detection_confidence: 1,
        recognition_confidence: 1,
      },
    ],
    warnings: [],
  };
}

function addMarkedImage(clientImageId: string) {
  const image = document.createElement("img");
  image.setAttribute(IMAGE_ID_ATTRIBUTE, clientImageId);
  let bounds = domRect();
  const getBounds = vi.spyOn(image, "getBoundingClientRect").mockImplementation(() => bounds);
  document.body.append(image);
  return {
    image,
    getBounds,
    setBounds(next: DOMRect) {
      bounds = next;
    },
  };
}

let animationFrames: FrameRequestCallback[];
let resizeCallback: ResizeObserverCallback | undefined;
let resizeDisconnect: ReturnType<typeof vi.fn>;

function flushAnimationFrames(): void {
  const pending = animationFrames.splice(0);
  for (const callback of pending) {
    callback(performance.now());
  }
}

beforeEach(() => {
  document.body.replaceChildren();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  animationFrames = [];
  resizeCallback = undefined;
  resizeDisconnect = vi.fn();
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    animationFrames.push(callback);
    return animationFrames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

  class FakeResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = resizeDisconnect;

    constructor(callback: ResizeObserverCallback) {
      resizeCallback = callback;
    }
  }

  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});

afterEach(() => {
  removeExisting();
  Reflect.deleteProperty(window, CANCEL_REQUESTED_KEY);
  Reflect.deleteProperty(window, RETRY_REQUESTED_KEY);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("renderer runtime", () => {
  it("keeps the original image association when another image is inserted first", () => {
    const original = addMarkedImage("penguin-image-stable");
    const inserted = document.createElement("img");
    const insertedBounds = vi.spyOn(inserted, "getBoundingClientRect");
    document.body.insertBefore(inserted, original.image);

    const mounted = mount([result("penguin-image-stable")]);

    expect(mounted.renderedRegions).toBe(1);
    expect(original.getBounds).toHaveBeenCalled();
    expect(insertedBounds).not.toHaveBeenCalled();
  });

  it("returns a warning and never falls back to another image when the original is absent", () => {
    document.body.append(document.createElement("img"));

    const mounted = mount([result("penguin-image-missing")]);

    expect(mounted).toEqual({
      renderedRegions: 0,
      warnings: ["IMAGE_NOT_FOUND:penguin-image-missing"],
    });
    expect(document.querySelector("[data-penguin-translator-region]")).toBeNull();
  });

  it("coalesces element and window scroll updates through animation frames", () => {
    const tracked = addMarkedImage("penguin-image-scroll");
    const container = document.createElement("div");
    container.append(tracked.image);
    document.body.append(container);
    mount([result("penguin-image-scroll")]);
    const initialCalls = tracked.getBounds.mock.calls.length;

    container.dispatchEvent(new Event("scroll"));
    expect(tracked.getBounds).toHaveBeenCalledTimes(initialCalls);
    expect(animationFrames).toHaveLength(1);
    flushAnimationFrames();
    expect(tracked.getBounds).toHaveBeenCalledTimes(initialCalls + 1);

    window.dispatchEvent(new Event("scroll"));
    expect(animationFrames).toHaveLength(1);
    flushAnimationFrames();

    expect(tracked.getBounds).toHaveBeenCalledTimes(initialCalls + 2);
  });

  it("removes regions rather than falling back by index after the matched image is deleted", () => {
    const tracked = addMarkedImage("penguin-image-deleted");
    const replacement = document.createElement("img");
    const replacementBounds = vi.spyOn(replacement, "getBoundingClientRect");
    document.body.append(replacement);
    mount([result("penguin-image-deleted")]);

    tracked.image.remove();
    window.dispatchEvent(new Event("resize"));
    flushAnimationFrames();

    expect(document.querySelector("[data-penguin-translator-region]")).toBeNull();
    expect(replacementBounds).not.toHaveBeenCalled();
  });

  it("updates after window resize and image ResizeObserver notification", () => {
    const tracked = addMarkedImage("penguin-image-resize");
    mount([result("penguin-image-resize")]);
    const initialCalls = tracked.getBounds.mock.calls.length;

    window.dispatchEvent(new Event("resize"));
    flushAnimationFrames();
    expect(tracked.getBounds).toHaveBeenCalledTimes(initialCalls + 1);

    tracked.setBounds(domRect(20, 40, 200, 300));
    resizeCallback?.([], {} as ResizeObserver);
    flushAnimationFrames();
    expect(tracked.getBounds).toHaveBeenCalledTimes(initialCalls + 2);
    expect(
      document.querySelector<HTMLElement>("[data-penguin-translator-region]")?.style.width,
    ).toBe("50px");
  });

  it("does not accumulate listeners across mounts", () => {
    const tracked = addMarkedImage("penguin-image-repeat");
    mount([result("penguin-image-repeat")]);
    mount([result("penguin-image-repeat")]);
    const beforeScroll = tracked.getBounds.mock.calls.length;

    window.dispatchEvent(new Event("scroll"));
    flushAnimationFrames();

    expect(tracked.getBounds).toHaveBeenCalledTimes(beforeScroll + 1);
    expect(document.querySelectorAll(`#${ROOT_ID}`)).toHaveLength(1);
    expect(document.querySelectorAll(`#${PANEL_ID}`)).toHaveLength(1);
    expect(resizeDisconnect).toHaveBeenCalledOnce();
  });

  it("stops the old lifecycle after removeExisting", () => {
    const tracked = addMarkedImage("penguin-image-cleanup");
    mount([result("penguin-image-cleanup")]);
    const beforeRemoval = tracked.getBounds.mock.calls.length;

    removeExisting();
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    flushAnimationFrames();

    expect(tracked.getBounds).toHaveBeenCalledTimes(beforeRemoval);
    expect(resizeDisconnect).toHaveBeenCalledOnce();
    expect(document.getElementById(ROOT_ID)).toBeNull();
    expect(document.getElementById(PANEL_ID)).toBeNull();
  });

  it("completes both success and error paths", () => {
    addMarkedImage("penguin-image-completion");
    const success = vi.fn();
    runRenderer({ results: [result("penguin-image-completion")] }, success);
    expect(success).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, rendered_regions: 1, warnings: [] }),
    );

    const failure = vi.fn();
    runRenderer({ invalid: true }, failure);
    expect(failure).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        errors: [expect.objectContaining({ code: "SHORTCUT_SCRIPT_ERROR" })],
      }),
    );
  });

  it("shows progress, toggles source text, and emits cancel/retry hooks", () => {
    addMarkedImage("penguin-image-progress");
    const cancel = vi.fn();
    const retry = vi.fn();
    window.addEventListener(CANCEL_EVENT, cancel);
    window.addEventListener(RETRY_FAILURES_EVENT, retry);

    mount([result("penguin-image-progress")], {
      progress: { total: 3, completed: 2, successful: 1, failed: 1 },
      failures: ["penguin-image-failed"],
    });
    const shadow = document.getElementById(PANEL_ID)?.shadowRoot;
    const buttons = Array.from(shadow?.querySelectorAll("button") ?? []);
    expect(shadow?.textContent).toContain("正在翻譯 2 / 3");

    buttons.find((button) => button.textContent === "顯示原文")?.click();
    expect(document.querySelector("[data-penguin-translator-region]")?.textContent).toBe("テスト");
    buttons.find((button) => button.textContent === "取消")?.click();
    buttons.find((button) => button.textContent === "重試失敗圖片")?.click();

    expect(cancel).toHaveBeenCalledOnce();
    expect(retry).toHaveBeenCalledOnce();
    const completion = vi.fn();
    runRenderer(
      {
        results: [result("penguin-image-progress")],
        failures: ["penguin-image-failed"],
      },
      completion,
    );
    expect(completion).toHaveBeenCalledWith(
      expect.objectContaining({
        cancel_requested: true,
        retry_requested: ["penguin-image-failed"],
      }),
    );
    const consumed = vi.fn();
    runRenderer(
      {
        results: [result("penguin-image-progress")],
        failures: ["penguin-image-failed"],
        consume_control_requests: true,
      },
      consumed,
    );
    expect(consumed).toHaveBeenCalledWith(
      expect.objectContaining({
        cancel_requested: true,
        retry_requested: ["penguin-image-failed"],
      }),
    );
    const afterConsumption = vi.fn();
    runRenderer({ results: [result("penguin-image-progress")] }, afterConsumption);
    expect(afterConsumption).toHaveBeenCalledWith(
      expect.objectContaining({ cancel_requested: false, retry_requested: [] }),
    );
    window.removeEventListener(CANCEL_EVENT, cancel);
    window.removeEventListener(RETRY_FAILURES_EVENT, retry);
  });
});
