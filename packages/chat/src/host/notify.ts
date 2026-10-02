/**
 * The notify seam — the ONE `toast` every package call site imports.
 *
 * Same shape the call sites used when they imported the host app's toast
 * (`success | info | warning | error | message | loading | promise`, options
 * `{ description, duration, id, action }`), so moving a call site onto the
 * notify port changed only its import specifier (P4). Every call goes to the
 * configured host's `notify` port at call time, never at import: matrx-frontend
 * maps it to its own toaster (providers/ChatHostAdapter.tsx); a bare host gets
 * the package default (defaults/notify.ts). Used before any host is configured,
 * it throws `ChatHostNotConfiguredError`, which names the remedy.
 */

import { getChatHost } from "./configure";
import type {
  ChatNotifyAction,
  ChatNotifyLevel,
  ChatNotifyOptions,
  ChatPromiseLabels,
  ChatRecordRef,
} from "./contract";

export interface ToastOptions {
  description?: string;
  /** What the person can do about it — shown with the sentence. */
  remedy?: string;
  /** Same id replaces an earlier notice instead of stacking. */
  id?: string | number;
  /** Milliseconds on screen. */
  duration?: number;
  action?: ChatNotifyAction;
}

function toPort(options?: ToastOptions): ChatNotifyOptions | undefined {
  if (!options) return undefined;
  const { duration, ...rest } = options;
  return duration === undefined ? rest : { ...rest, durationMs: duration };
}

export const toast = {
  success(message: string, options?: ToastOptions): void {
    getChatHost().notify.success(message, toPort(options));
  },
  info(message: string, options?: ToastOptions): void {
    getChatHost().notify.info(message, toPort(options));
  },
  warning(message: string, options?: ToastOptions): void {
    getChatHost().notify.warning(message, toPort(options));
  },
  error(message: string, options?: ToastOptions): void {
    getChatHost().notify.error(message, toPort(options));
  },
  /** A neutral notice: no level, no icon. */
  message(message: string, options?: ToastOptions): void {
    getChatHost().notify.message(message, toPort(options));
  },
  /** A notice that stays until the same id is replaced; returns that id. */
  loading(message: string, options?: ToastOptions): string | number {
    return getChatHost().notify.loading(message, toPort(options));
  },
  promise<T>(work: Promise<T>, labels: ChatPromiseLabels<T>): Promise<T> {
    return getChatHost().notify.promise(work, labels);
  },
  /** A notice that names a record — withdrawn when that record changes or leaves the screen. */
  record(
    level: ChatNotifyLevel,
    ref: ChatRecordRef,
    message: string,
    options?: ToastOptions,
  ): void {
    getChatHost().notify.record(level, ref, message, toPort(options));
  },
};
