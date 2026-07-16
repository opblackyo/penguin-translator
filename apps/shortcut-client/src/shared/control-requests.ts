export const CANCEL_REQUESTED_KEY = "__penguinTranslatorCancelRequested";
export const RETRY_REQUESTED_KEY = "__penguinTranslatorRetryRequested";

export interface ControlRequests {
  cancelRequested: boolean;
  retryRequested: string[];
}

export function readControlRequests(): ControlRequests {
  const retryValue = Reflect.get(window, RETRY_REQUESTED_KEY);
  return {
    cancelRequested: Reflect.get(window, CANCEL_REQUESTED_KEY) === true,
    retryRequested: Array.isArray(retryValue)
      ? retryValue.filter((value): value is string => typeof value === "string" && value.length > 0)
      : [],
  };
}

export function consumeControlRequests(): ControlRequests {
  const requests = readControlRequests();
  Reflect.deleteProperty(window, CANCEL_REQUESTED_KEY);
  Reflect.deleteProperty(window, RETRY_REQUESTED_KEY);
  return requests;
}

export function requestCancellation(): void {
  Reflect.set(window, CANCEL_REQUESTED_KEY, true);
}

export function requestFailureRetry(clientImageIds: string[]): void {
  Reflect.set(window, RETRY_REQUESTED_KEY, [...clientImageIds]);
}
