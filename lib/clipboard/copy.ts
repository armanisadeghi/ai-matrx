import { copyText, type CopyTextOptions } from "@ai-matrx/kit/clipboard";

import { toast } from "@/lib/toast";

/**
 * The app's one plain-text copy for code outside a React component (menu configs, action handlers,
 * utilities): the kit `copyText` with failures and the optional success message bound to the app
 * toast. Resolves to whether the copy landed — show a "copied" state only on `true`.
 */
export function copyToClipboard(text: string, successMessage?: string, options?: Omit<CopyTextOptions, "notify" | "successMessage">): Promise<boolean> {
  return copyText(text, {
    ...options,
    successMessage,
    notify: (message, kind) => (kind === "error" ? toast.error(message) : toast.success(message)),
  });
}
