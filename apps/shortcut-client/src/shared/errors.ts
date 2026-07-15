export interface ShortcutError {
  code: string;
  message: string;
}

export function toShortcutError(error: unknown): ShortcutError {
  if (error instanceof Error) {
    return { code: "SHORTCUT_SCRIPT_ERROR", message: error.message };
  }

  return { code: "SHORTCUT_SCRIPT_ERROR", message: "Unknown shortcut script error" };
}
