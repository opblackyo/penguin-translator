export interface GMResponse {
  status: number;
  responseText: string;
}

export interface GMRequestDetails {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  data: string;
  responseType: "text";
  timeout: number;
}

export interface PenguinGM {
  addStyle(css: string): Promise<unknown>;
  deleteValue(key: string): Promise<void>;
  getValue<T>(key: string, defaultValue: T): Promise<T>;
  setValue(key: string, value: unknown): Promise<void>;
  xmlHttpRequest(details: GMRequestDetails): Promise<GMResponse>;
}

declare global {
  const GM: PenguinGM;
}
