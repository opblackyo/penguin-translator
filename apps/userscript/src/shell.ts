import type { components } from "@penguin-translator/contracts";
import { collectPageImagesWithDiagnostics } from "../../shortcut-client/src/extractor/collect-images";
import { mount } from "../../shortcut-client/src/renderer/runtime";
import { consumeControlRequests } from "../../shortcut-client/src/shared/control-requests";
import { createRequestId } from "../../shortcut-client/src/shared/request-id";
import type { PenguinGM } from "./gm";
import { type TranslationPageRequest, translatePage } from "./page-api";
import { deleteSettings, loadSettings, saveSettings, type UserscriptSettings } from "./settings";

type TranslationPageResponse = components["schemas"]["TranslationPageResponse"];

export const SHELL_HOST_ID = "penguin-translator-userscript-shell";

const HOST_STYLE = `
#${SHELL_HOST_ID} {
  all: initial;
  position: fixed;
  z-index: 2147483647;
  right: 14px;
  bottom: 84px;
}
`;

const SHADOW_STYLE = `
:host { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.launcher { display: flex; align-items: center; gap: 6px; }
button { border: 0; border-radius: 999px; padding: 11px 14px; background: #111827; color: #fff; font: 700 14px/1.2 inherit; box-shadow: 0 6px 20px rgba(0,0,0,.24); }
button:disabled { opacity: .65; }
.settings-button { width: 40px; height: 40px; padding: 0; background: #334155; }
.status { max-width: 230px; margin: 6px 0 0 auto; padding: 7px 10px; border-radius: 10px; background: rgba(15,23,42,.94); color: #fff; font: 600 12px/1.35 inherit; text-align: right; }
.panel { width: min(330px, calc(100vw - 28px)); margin-top: 8px; padding: 14px; border: 1px solid #cbd5e1; border-radius: 14px; background: #fff; color: #0f172a; box-shadow: 0 12px 36px rgba(0,0,0,.3); }
.panel[hidden], .status[hidden] { display: none; }
h2 { margin: 0 0 10px; font: 750 17px/1.3 inherit; }
label { display: grid; gap: 5px; margin: 9px 0; font: 650 12px/1.3 inherit; }
input, select { box-sizing: border-box; width: 100%; border: 1px solid #94a3b8; border-radius: 8px; padding: 9px; background: #fff; color: #0f172a; font: 14px/1.3 inherit; }
.actions { display: flex; justify-content: flex-end; gap: 7px; margin-top: 12px; }
.actions button { border-radius: 8px; padding: 9px 11px; box-shadow: none; }
.secondary { background: #64748b; }
.danger { background: #991b1b; margin-right: auto; }
`;

interface ShellElements {
  translate: HTMLButtonElement;
  settings: HTMLButtonElement;
  status: HTMLOutputElement;
  panel: HTMLElement;
  endpoint: HTMLInputElement;
  token: HTMLInputElement;
  target: HTMLSelectElement;
  save: HTMLButtonElement;
  cancel: HTMLButtonElement;
  clear: HTMLButtonElement;
}

function element<K extends keyof HTMLElementTagNameMap>(
  root: ShadowRoot,
  tag: K,
  attributes: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const value = document.createElement(tag);
  for (const [name, attribute] of Object.entries(attributes)) value.setAttribute(name, attribute);
  root.append(value);
  return value;
}

function buildShell(host: HTMLElement): ShellElements {
  const root = host.attachShadow({ mode: "open" });
  const style = element(root, "style");
  style.textContent = SHADOW_STYLE;
  const launcher = element(root, "div", { class: "launcher" });
  const translate = document.createElement("button");
  translate.type = "button";
  translate.textContent = "企鵝翻譯";
  translate.dataset.action = "translate";
  const settings = document.createElement("button");
  settings.type = "button";
  settings.textContent = "設定";
  settings.className = "settings-button";
  settings.dataset.action = "settings";
  launcher.append(translate, settings);
  const status = element(root, "output", { class: "status", hidden: "" });
  const panel = element(root, "section", { class: "panel", hidden: "" });
  const title = document.createElement("h2");
  title.textContent = "企鵝翻譯機設定";
  panel.append(title);

  const field = (labelText: string, control: HTMLElement): void => {
    const label = document.createElement("label");
    label.append(labelText, control);
    panel.append(label);
  };
  const endpoint = document.createElement("input");
  endpoint.type = "url";
  endpoint.inputMode = "url";
  endpoint.placeholder = "http://<WINDOWS_LAN_IPV4>:8000";
  endpoint.autocomplete = "off";
  endpoint.dataset.field = "endpoint";
  field("API Endpoint", endpoint);
  const token = document.createElement("input");
  token.type = "password";
  token.autocomplete = "off";
  token.spellcheck = false;
  token.dataset.field = "token";
  field("Local API Token", token);
  const target = document.createElement("select");
  target.dataset.field = "target-language";
  const targetOption = document.createElement("option");
  targetOption.value = "zh-Hant";
  targetOption.textContent = "繁體中文 (zh-Hant)";
  target.append(targetOption);
  field("Target Language", target);
  const actions = document.createElement("div");
  actions.className = "actions";
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "danger";
  clear.textContent = "清除設定";
  clear.dataset.action = "clear-settings";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "secondary";
  cancel.textContent = "取消";
  cancel.dataset.action = "cancel-settings";
  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "儲存";
  save.dataset.action = "save-settings";
  actions.append(clear, cancel, save);
  panel.append(actions);
  return { translate, settings, status, panel, endpoint, token, target, save, cancel, clear };
}

function setStatus(elements: ShellElements, text: string): void {
  elements.status.textContent = text;
  elements.status.hidden = !text;
}

function safeUiError(error: unknown): string {
  const code = error instanceof Error ? error.message : "TRANSLATION_FAILED";
  const known: Record<string, string> = {
    API_ENDPOINT_PROTOCOL_INVALID: "Endpoint 必須使用 HTTP 或 HTTPS",
    API_ENDPOINT_CREDENTIALS_INVALID: "Endpoint 不可包含帳號密碼",
    LOCAL_API_TOKEN_REQUIRED: "請輸入 Local API Token",
    LOCAL_API_TOKEN_INVALID: "Local API Token 不正確",
    PAGE_BATCH_TOO_LARGE: "圖片數量超過後端限制",
    PAGE_REQUEST_INVALID: "頁面請求格式不正確",
    TRANSLATION_NOT_CONFIGURED: "Windows 翻譯服務尚未完成設定",
    PAGE_API_RESPONSE_INVALID: "API 回應格式不正確",
  };
  return known[code] ?? (code.startsWith("PAGE_API_") ? "Windows API 呼叫失敗" : "翻譯失敗");
}

function openSettings(elements: ShellElements, value: UserscriptSettings): void {
  elements.endpoint.value = value.endpoint.replace(/\/v1\/translate-page$/, "");
  elements.token.value = "";
  elements.token.placeholder = value.token ? "已設定；留空以保留" : "輸入 Local API Token";
  elements.target.value = value.targetLanguage;
  elements.panel.hidden = false;
}

function requestForImages(
  images: TranslationPageRequest["images"],
  settings: UserscriptSettings,
): TranslationPageRequest {
  return {
    request_id: createRequestId(),
    page_url: window.location.href,
    images,
    source_language: "auto",
    target_language: settings.targetLanguage,
    reading_order: "auto",
  };
}

function renderResponse(response: TranslationPageResponse): void {
  mount(response.results, {
    progress: response.progress,
    failures: response.failures.map((failure) => failure.client_image_id),
    timingLabel: `${Math.round(response.timing.total_ms)} ms · Gemini ${response.timing.gemini_calls}`,
  });
}

export async function installUserscript(gm: PenguinGM): Promise<HTMLElement> {
  const existing = document.getElementById(SHELL_HOST_ID);
  if (existing) return existing;
  await gm.addStyle(HOST_STYLE);
  const host = document.createElement("div");
  host.id = SHELL_HOST_ID;
  document.documentElement.append(host);
  const elements = buildShell(host);
  let busy = false;

  elements.settings.addEventListener("click", () => {
    void loadSettings(gm).then((value) => openSettings(elements, value));
  });
  elements.cancel.addEventListener("click", () => {
    elements.panel.hidden = true;
    elements.token.value = "";
  });
  elements.save.addEventListener("click", () => {
    void loadSettings(gm)
      .then((current) =>
        saveSettings(gm, {
          endpoint: elements.endpoint.value,
          token: elements.token.value.trim() || current.token,
          targetLanguage: "zh-Hant",
        }),
      )
      .then(() => {
        elements.panel.hidden = true;
        elements.token.value = "";
        setStatus(elements, "設定已保存在 Userscripts 本機儲存空間");
      })
      .catch((error: unknown) => setStatus(elements, safeUiError(error)));
  });
  elements.clear.addEventListener("click", () => {
    void deleteSettings(gm).then(() => {
      elements.endpoint.value = "";
      elements.token.value = "";
      setStatus(elements, "本機設定已清除");
    });
  });
  elements.translate.addEventListener("click", () => {
    if (busy) return;
    busy = true;
    elements.translate.disabled = true;
    void (async () => {
      const settings = await loadSettings(gm);
      if (!settings.endpoint || !settings.token) {
        openSettings(elements, settings);
        setStatus(elements, "請先完成 Endpoint 與 Token 設定");
        return;
      }
      setStatus(elements, "掃描中…");
      const extraction = await collectPageImagesWithDiagnostics();
      const retryIds = new Set(consumeControlRequests().retryRequested);
      const images = retryIds.size
        ? extraction.images.filter((image) => retryIds.has(image.client_image_id))
        : extraction.images;
      if (images.length === 0) {
        setStatus(elements, "找不到可翻譯圖片");
        return;
      }
      setStatus(elements, `翻譯中 0 / ${images.length}`);
      const response = await translatePage(gm, settings, requestForImages(images, settings));
      renderResponse(response);
      setStatus(elements, `完成 ${response.progress.successful} / ${response.progress.total}`);
    })()
      .catch((error: unknown) => setStatus(elements, safeUiError(error)))
      .finally(() => {
        busy = false;
        elements.translate.disabled = false;
      });
  });
  return host;
}
