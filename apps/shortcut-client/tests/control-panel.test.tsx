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
});
