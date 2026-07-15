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

    render(<ControlPanel onRemove={() => undefined} />, mount);

    expect(shadow.querySelector(".panel")?.textContent).toContain("企鵝翻譯機");
    expect(document.head.querySelector("style")).toBeNull();
  });
});
