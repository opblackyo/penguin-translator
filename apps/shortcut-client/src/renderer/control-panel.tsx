import { useState } from "preact/hooks";

export interface ProgressState {
  total: number;
  completed: number;
  successful: number;
  failed: number;
}

function setRegionsVisible(visible: boolean): void {
  for (const region of document.querySelectorAll<HTMLElement>("[data-penguin-translator-region]")) {
    region.style.display = visible ? "flex" : "none";
  }
}

interface ControlPanelProps {
  onRemove: () => void;
  onTextModeChange: (mode: "source" | "translation") => void;
  onCancel: () => void;
  onRetryFailures: () => void;
  progress: ProgressState;
}

export function ControlPanel({
  onRemove,
  onTextModeChange,
  onCancel,
  onRetryFailures,
  progress,
}: ControlPanelProps) {
  const [visible, setVisible] = useState(true);
  const [textMode, setTextMode] = useState<"source" | "translation">("translation");
  const [cancelled, setCancelled] = useState(false);

  return (
    <div class="panel">
      <strong>企鵝翻譯機 M2</strong>
      <span class="progress" aria-live="polite">
        {cancelled ? "已取消" : `正在翻譯 ${progress.completed} / ${progress.total}`}
        {` · 成功 ${progress.successful} · 失敗 ${progress.failed}`}
      </span>
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
      <button
        type="button"
        onClick={() => {
          const next = textMode === "translation" ? "source" : "translation";
          setTextMode(next);
          onTextModeChange(next);
        }}
      >
        {textMode === "translation" ? "顯示原文" : "顯示譯文"}
      </button>
      {progress.completed < progress.total && !cancelled ? (
        <button
          type="button"
          onClick={() => {
            setCancelled(true);
            onCancel();
          }}
        >
          取消
        </button>
      ) : null}
      {progress.failed > 0 ? (
        <button type="button" onClick={onRetryFailures}>
          重試失敗圖片
        </button>
      ) : null}
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
    flex-wrap: wrap;
    max-width: min(92vw, 560px);
    gap: 8px;
    align-items: center;
    padding: 10px;
    border-radius: 10px;
    background: rgba(15, 23, 42, 0.96);
    color: white;
    font: 14px/1.2 system-ui, sans-serif;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.28);
  }
  .progress { white-space: nowrap; }
  button {
    border: 0;
    border-radius: 6px;
    padding: 6px 8px;
    background: #f8fafc;
    color: #0f172a;
    font: inherit;
  }
`;
