/**
 * lib/toast.ts — the captured sonner wrapper.
 *
 * The app renders toasts with sonner, but a bare `toast.error(...)` import
 * from "sonner" is INVISIBLE to the admin Error Inspector — only the legacy
 * `lib/toast-service.ts` captured its error toasts, so every modern sonner
 * call site silently bypassed error capture (the exact hole found in the
 * marketing feature, 2026-07-20).
 *
 * Import `toast` from HERE instead of "sonner". The API is identical —
 * `error` and `warning` additionally feed `captureError` (source
 * "user-toast"). A user seeing the failure is not evidence that it is minor,
 * so error toasts stay red unless a specific downgrade rule says otherwise.
 * Success/info/etc. pass straight through.
 *
 * Migration is opportunistic (boy-scout rule): when you touch a file that
 * imports toast from "sonner", switch it to `@/lib/toast`.
 */

import { toast as sonnerToast } from "sonner";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

type SonnerToast = typeof sonnerToast;
type ToastMessage = Parameters<SonnerToast["error"]>[0];
type ToastData = Parameters<SonnerToast["error"]>[1];

function messageText(message: ToastMessage, data?: ToastData): string {
  const description =
    data && typeof data.description === "string" ? data.description : "";
  const title = typeof message === "string" ? message : "";
  return [title, description].filter(Boolean).join(" — ") || "Error toast";
}

function captureToast(
  kind: "error" | "warning",
  message: ToastMessage,
  data?: ToastData,
): void {
  try {
    captureError({
      source: "user-toast",
      message: `${kind === "warning" ? "[warning] " : ""}${messageText(message, data)}`,
      userMessage: messageText(message, data),
      raw: { kind, message: typeof message === "string" ? message : undefined, data },
    });
  } catch {
    /* capture must never break the toast */
  }
}

const error: SonnerToast["error"] = (message, data) => {
  captureToast("error", message, data);
  return sonnerToast.error(message, data);
};

const warning: SonnerToast["warning"] = (message, data) => {
  captureToast("warning", message, data);
  return sonnerToast.warning(message, data);
};

/** Drop-in replacement for sonner's `toast` with error/warning capture. */
export const toast: SonnerToast = Object.assign(
  ((...args: Parameters<SonnerToast>) => sonnerToast(...args)) as SonnerToast,
  sonnerToast,
  { error, warning },
);
