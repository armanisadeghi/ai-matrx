/**
 * The clipboard seam — plain-text copy for package code outside a React component.
 *
 * The kit `copyText` with its success and failure notices routed through the notify seam, so a
 * refused copy always announces itself. Resolves to whether the copy landed.
 */

import { copyText } from "@ai-matrx/kit/clipboard";
import { toast } from "./notify";

export function copyToHostClipboard(text: string, successMessage?: string): Promise<boolean> {
  return copyText(text, {
    successMessage,
    notify: (message, kind) => (kind === "error" ? toast.error(message) : toast.success(message)),
  });
}
