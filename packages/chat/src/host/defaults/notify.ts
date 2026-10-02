/**
 * Default notify port: the package's own minimal toaster. Plain DOM, created on
 * the first notice (never at import), so a bare host shows notices without
 * mounting anything. Without a document (SSR, workers) notices go to the
 * console. Errors and warnings always reach the console too.
 */

import type {
  ChatNotifyLevel,
  ChatNotifyOptions,
  ChatNotifyPort,
  ChatPromiseLabels,
  ChatRecordRef,
} from "../contract";

export const NOTIFY_DEFAULT_MS = 4000;
export const NOTIFY_MIN_ERROR_MS = 5000;
const CONTAINER_ATTR = "data-ai-matrx-chat-toaster";

const COLORS: Record<ChatNotifyLevel, string> = {
  success: "#166534",
  info: "#1e3a8a",
  warning: "#854d0e",
  error: "#991b1b",
};

function container(doc: Document): HTMLElement {
  const existing = doc.querySelector<HTMLElement>(`[${CONTAINER_ATTR}]`);
  if (existing) return existing;
  const el = doc.createElement("div");
  el.setAttribute(CONTAINER_ATTR, "");
  el.style.cssText =
    "position:fixed;bottom:16px;right:16px;z-index:2147483647;display:flex;" +
    "flex-direction:column;gap:8px;max-width:360px;font:14px/1.4 system-ui,sans-serif;";
  doc.body.appendChild(el);
  return el;
}

export function createDomNotifier(): ChatNotifyPort {
  function show(
    level: ChatNotifyLevel,
    message: string,
    options: ChatNotifyOptions = {},
  ): void {
    const secondary = [options.description, options.remedy]
      .filter(Boolean)
      .join(" ");
    if (
      level === "error" ||
      level === "warning" ||
      typeof document === "undefined"
    ) {
      const line = `[ai-matrx/chat] ${message}${secondary ? ` — ${secondary}` : ""}`;
      if (level === "error") console.error(line);
      else if (level === "warning") console.warn(line);
      else console.info(line);
    }
    if (typeof document === "undefined" || !document.body) return;
    const root = container(document);
    const id = options.id != null ? String(options.id) : null;
    if (id) root.querySelector(`[data-toast-id="${CSS.escape(id)}"]`)?.remove();
    const item = document.createElement("div");
    item.setAttribute("role", level === "error" ? "alert" : "status");
    item.setAttribute("data-level", level);
    if (id) item.setAttribute("data-toast-id", id);
    item.style.cssText =
      `background:${COLORS[level]};color:#fff;padding:10px 12px;border-radius:8px;` +
      "box-shadow:0 4px 12px rgba(0,0,0,.2);";
    const title = document.createElement("div");
    title.textContent = message;
    item.appendChild(title);
    if (secondary) {
      const sub = document.createElement("div");
      sub.style.opacity = "0.85";
      sub.textContent = secondary;
      item.appendChild(sub);
    }
    root.appendChild(item);
    const requested = options.durationMs ?? NOTIFY_DEFAULT_MS;
    const duration =
      level === "error" || level === "warning"
        ? Math.max(requested, NOTIFY_MIN_ERROR_MS)
        : requested;
    if (Number.isFinite(duration)) setTimeout(() => item.remove(), duration);
  }

  return {
    success: (message, options) => show("success", message, options),
    info: (message, options) => show("info", message, options),
    warning: (message, options) => show("warning", message, options),
    error: (message, options) => show("error", message, options),
    async promise<T>(
      work: Promise<T>,
      labels: ChatPromiseLabels<T>,
    ): Promise<T> {
      const id = `chat-promise-${Math.random().toString(36).slice(2)}`;
      show("info", labels.loading, {
        id,
        durationMs: Number.POSITIVE_INFINITY,
      });
      try {
        const value = await work;
        show(
          "success",
          typeof labels.success === "function"
            ? labels.success(value)
            : labels.success,
          { id },
        );
        return value;
      } catch (error) {
        show(
          "error",
          typeof labels.error === "function"
            ? labels.error(error)
            : labels.error,
          { id },
        );
        throw error;
      }
    },
    record(
      level: ChatNotifyLevel,
      ref: ChatRecordRef,
      message: string,
      options?: ChatNotifyOptions,
    ) {
      show(level, message, {
        ...options,
        id: options?.id ?? `record:${ref.type}:${ref.id}`,
      });
    },
  };
}
