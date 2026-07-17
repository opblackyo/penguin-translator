interface ChromeStorageArea {
  get(keys?: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface ChromeMessageSender {
  tab?: { id?: number };
}

type ChromeSendResponse = (response: unknown) => void;
type ChromeMessageListener = (
  message: unknown,
  sender: ChromeMessageSender,
  sendResponse: ChromeSendResponse,
) => boolean | undefined;

interface ChromeApi {
  action: {
    onClicked: { addListener(listener: (tab: { id?: number }) => void): void };
  };
  permissions: {
    request(permissions: { origins: string[] }): Promise<boolean>;
  };
  runtime: {
    lastError?: { message?: string };
    onMessage: { addListener(listener: ChromeMessageListener): void };
    sendMessage(message: unknown): Promise<unknown>;
  };
  scripting: {
    executeScript(details: { target: { tabId: number }; files: string[] }): Promise<unknown>;
  };
  storage: { local: ChromeStorageArea };
  tabs: { sendMessage(tabId: number, message: unknown): Promise<unknown> };
}

declare const chrome: ChromeApi;
