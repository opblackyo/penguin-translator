import { render } from "preact";
import { describe, expect, it } from "vitest";
import { CONTROL_PANEL_STYLE, ControlPanel } from "../src/renderer/control-panel";

describe("ControlPanel", () => {
  it("can render inside a shadow root without global styles", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CONTROL_PANEL_STYLE;
    shadow.append(style);
    const mount = document.createElement("div");
    shadow.append(mount);

    render(
      <ControlPanel
        onRemove={() => undefined}
        onTextModeChange={() => undefined}
        onCancel={() => undefined}
        onRetryFailures={() => undefined}
        progress={{ total: 18, completed: 3, successful: 2, failed: 1 }}
      />,
      mount,
    );

    expect(shadow.querySelector(".panel")?.textContent).toContain("企鵝翻譯機");
    expect(shadow.querySelector(".panel")?.textContent).toContain("移除全部");
    expect(shadow.querySelector(".panel")?.textContent).toContain("正在翻譯 3 / 18");
    expect(shadow.querySelector(".panel")?.textContent).toContain("成功 2 · 失敗 1");
    expect(shadow.querySelector(".panel")?.textContent).toContain("重試失敗圖片");
    expect(document.head.querySelector("style")).toBeNull();
  });

  it("uses completed wording when all images have finished", () => {
    const mount = document.createElement("div");
    render(
      <ControlPanel
        onRemove={() => undefined}
        onTextModeChange={() => undefined}
        onCancel={() => undefined}
        onRetryFailures={() => undefined}
        progress={{ total: 15, completed: 15, successful: 15, failed: 0 }}
      />,
      mount,
    );

    expect(mount.textContent).toContain("完成 15 / 15");
    expect(mount.textContent).not.toContain("正在翻譯");
  });
});
