import { vi } from "vitest";
import type { GMRequestDetails, GMResponse, PenguinGM } from "../src/gm";

export function createGM(initial: Record<string, unknown> = {}): PenguinGM & {
  storage: Map<string, unknown>;
  requests: GMRequestDetails[];
} {
  const storage = new Map(Object.entries(initial));
  const requests: GMRequestDetails[] = [];
  return {
    storage,
    requests,
    addStyle: vi.fn(async () => undefined),
    deleteValue: vi.fn(async (key: string) => {
      storage.delete(key);
    }),
    getValue: async <T>(key: string, defaultValue: T): Promise<T> =>
      storage.has(key) ? (storage.get(key) as T) : defaultValue,
    setValue: vi.fn(async (key: string, value: unknown) => {
      storage.set(key, value);
    }),
    xmlHttpRequest: vi.fn(async (details: GMRequestDetails): Promise<GMResponse> => {
      requests.push(details);
      return { status: 500, responseText: "" };
    }),
  };
}
