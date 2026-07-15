import { useState } from "preact/hooks";

function setRegionsVisible(visible: boolean): void {
  for (const region of document.querySelectorAll<HTMLElement>("[data-penguin-translator-region]")) {
    region.style.display = visible ? "flex" : "none";
  }
}

export function ControlPanel({ onRemove }: { onRemove: () => void }) {
  const [visible, setVisible] = useState(true);

  return (
    <div class="panel">
      <strong>企鵝翻譯機 M0</strong>
      <button
        type="button"
        onClick={() => {
          const next = !visible;
          setVisible(next);
          setRegionsVisible(next);
        }}
      >
        {visible ? "隱藏譯文" : "顯示譯文"}
      </button>
      <button type="button" onClick={onRemove}>
        移除全部
      </button>
    </div>
  );
}

export const CONTROL_PANEL_STYLE = `
  :host { all: initial; }
  .panel {
    position: fixed;
    right: 12px;
    bottom: 12px;
    z-index: 2147483647;
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 10px;
    border-radius: 10px;
    background: rgba(15, 23, 42, 0.94);
    color: white;
    font: 14px/1.2 system-ui, sans-serif;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.28);
  }
  button {
    border: 0;
    border-radius: 6px;
    padding: 6px 8px;
    background: #f8fafc;
    color: #0f172a;
    font: inherit;
  }
`;
