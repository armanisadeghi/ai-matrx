// Direct chrome.runtime.sendMessage helpers — only meaningful when the
// page is open in a Chromium-family browser AND the matrx-extend
// extension is loaded AND the page origin is in the extension's
// `externally_connectable.matches` whitelist.
//
// All entry points are safe to call from any browser; missing API
// degrades to a structured `{ ok: false, reason }` reply instead of a
// thrown error.
//
// Wire-format envelope and reply shapes come from
// `@/lib/types/bridge-envelope` — the single source of truth. This
// module wraps them with debug/timing extras (`raw`, `latencyMs`) that
// are specific to the demo harness.

import type {
  FrontendRpcEnvelope,
  FrontendRpcResponse,
} from "@/lib/types/bridge-envelope";

export interface ChromeRpcResult<T = unknown> extends FrontendRpcResponse<T> {
  /** Raw envelope returned by the extension SW, for debugging. */
  raw?: unknown;
  /** Round-trip latency in milliseconds. */
  latencyMs?: number;
}

/** True when `chrome.runtime.sendMessage` is callable in this tab. */
export function isChromeRpcAvailable(): boolean {
  if (typeof globalThis === "undefined") return false;
  // chrome.runtime is undefined in non-Chromium browsers and in
  // Chromium tabs that haven't received the externally_connectable
  // injection (rare but possible).
  const c = (globalThis as unknown as { chrome?: { runtime?: { sendMessage?: unknown } } }).chrome;
  return Boolean(c && c.runtime && typeof c.runtime.sendMessage === "function");
}

interface SendOptions {
  /** Per-call timeout in ms. Default 8s. */
  timeoutMs?: number;
}

/**
 * Send a `FRONTEND_RPC` envelope to a specific extension ID.
 * Resolves with a normalized `ChromeRpcResult` regardless of success
 * — never throws.
 */
export async function sendChromeRpc<T = unknown>(
  extensionId: string,
  action: string,
  payload: unknown,
  options: SendOptions = {},
): Promise<ChromeRpcResult<T>> {
  if (!isChromeRpcAvailable()) {
    return {
      ok: false,
      error:
        "chrome.runtime.sendMessage is not available in this browser. Open this page in a Chromium browser with the matrx-extend extension installed.",
    };
  }

  const requestId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const envelope: FrontendRpcEnvelope = {
    channel: "FRONTEND_RPC",
    action,
    payload,
    requestId,
  };

  const timeoutMs = options.timeoutMs ?? 8_000;
  const start = performance.now();

  return new Promise<ChromeRpcResult<T>>((resolve) => {
    let settled = false;
    const settle = (r: ChromeRpcResult<T>) => {
      if (settled) return;
      settled = true;
      resolve({ ...r, latencyMs: Math.round(performance.now() - start) });
    };

    const timer = setTimeout(() => {
      settle({
        ok: false,
        error: `Timed out after ${timeoutMs}ms — the extension SW did not reply. The extension may not be installed, the origin may not be in its externally_connectable whitelist, or the action may be unsupported.`,
      });
    }, timeoutMs);

    try {
      const c = (globalThis as unknown as {
        chrome: {
          runtime: {
            sendMessage: (
              id: string,
              msg: unknown,
              cb: (reply: unknown) => void,
            ) => void;
            lastError?: { message?: string };
          };
        };
      }).chrome;

      c.runtime.sendMessage(extensionId, envelope, (reply) => {
        clearTimeout(timer);
        const lastError = c.runtime.lastError;
        if (lastError) {
          settle({
            ok: false,
            error: lastError.message || "chrome.runtime.lastError (no message)",
          });
          return;
        }
        if (reply == null) {
          settle({
            ok: false,
            error:
              "Extension responded with no reply. Either the extension is not installed, the page origin is not in `externally_connectable.matches`, or the action is unsupported.",
          });
          return;
        }
        const r = reply as { ok?: boolean; result?: T; error?: string };
        if (typeof r.ok === "boolean") {
          settle({
            ok: r.ok,
            result: r.result,
            error: r.error,
            raw: reply,
          });
        } else {
          // Older extension shape — treat the whole reply as the result.
          settle({ ok: true, result: reply as T, raw: reply });
        }
      });
    } catch (err) {
      clearTimeout(timer);
      settle({
        ok: false,
        error:
          err instanceof Error ? err.message : "Unknown error sending RPC",
      });
    }
  });
}

/** Probe a list of candidate IDs, returning the first that responds to `ping`. */
export async function detectExtensionId(
  candidates: ReadonlyArray<string>,
  options: SendOptions = {},
): Promise<{ id: string; latencyMs?: number } | null> {
  if (!isChromeRpcAvailable()) return null;
  for (const id of candidates) {
    const r = await sendChromeRpc(id, "ping", {}, { timeoutMs: options.timeoutMs ?? 1_500 });
    if (r.ok) return { id, latencyMs: r.latencyMs };
  }
  return null;
}
