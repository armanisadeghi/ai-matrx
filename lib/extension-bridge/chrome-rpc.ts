/**
 * Same-machine Matrx Extend RPC transport.
 *
 * This is the canonical page -> Chrome-extension bridge used by both the
 * visual bridge harness and normal Chat's delegated browser-tool executor.
 * It deliberately normalizes every failure into a structured reply: callers
 * must never have to guess whether Chrome, the extension, or the service
 * worker was unavailable.
 */

import type {
  FrontendRpcEnvelope,
  FrontendRpcResponse,
} from "@/lib/types/bridge-envelope";

/** Stable install identities shipped by Matrx Extend. */
export const MATRX_EXTEND_EXTENSION_IDS = [
  "cihdmkcdjjckfhjpgoedmgfpoljebaml", // unpacked / local build
  "hnfolienncfklkgmdjjmhhegglimlamg", // Chrome Web Store
] as const;

export interface ChromeRpcResult<T = unknown> extends FrontendRpcResponse<T> {
  raw?: unknown;
  latencyMs?: number;
}

interface SendOptions {
  timeoutMs?: number;
}

interface ChromeRuntimeApi {
  sendMessage: (
    extensionId: string,
    message: unknown,
    callback: (reply: unknown) => void,
  ) => void;
  lastError?: { message?: string };
}

function getChromeRuntime(): ChromeRuntimeApi | null {
  if (typeof globalThis === "undefined") return null;
  const candidate = (
    globalThis as typeof globalThis & {
      chrome?: { runtime?: Partial<ChromeRuntimeApi> };
    }
  ).chrome?.runtime;
  return typeof candidate?.sendMessage === "function"
    ? (candidate as ChromeRuntimeApi)
    : null;
}

export function isChromeRpcAvailable(): boolean {
  return getChromeRuntime() !== null;
}

export async function sendChromeRpc<T = unknown>(
  extensionId: string,
  action: string,
  payload: unknown,
  options: SendOptions = {},
): Promise<ChromeRpcResult<T>> {
  const runtime = getChromeRuntime();
  if (!runtime) {
    return {
      ok: false,
      error:
        "chrome.runtime.sendMessage is unavailable; Matrx Extend is not reachable from this page.",
    };
  }

  const requestId = crypto.randomUUID();
  const envelope: FrontendRpcEnvelope = {
    channel: "FRONTEND_RPC",
    action,
    payload,
    requestId,
  };
  const timeoutMs = options.timeoutMs ?? 8_000;
  const startedAt = performance.now();

  return new Promise<ChromeRpcResult<T>>((resolve) => {
    let settled = false;
    const settle = (result: ChromeRpcResult<T>) => {
      if (settled) return;
      settled = true;
      resolve({
        ...result,
        latencyMs: Math.round(performance.now() - startedAt),
      });
    };

    const timer = setTimeout(() => {
      settle({
        ok: false,
        error: `Matrx Extend did not reply within ${timeoutMs}ms.`,
      });
    }, timeoutMs);

    try {
      runtime.sendMessage(extensionId, envelope, (reply) => {
        clearTimeout(timer);
        if (runtime.lastError) {
          settle({
            ok: false,
            error: runtime.lastError.message ?? "Chrome extension RPC failed.",
          });
          return;
        }
        if (reply == null) {
          settle({ ok: false, error: "Matrx Extend returned no reply." });
          return;
        }
        if (typeof reply === "object" && "ok" in reply) {
          const normalized = reply as {
            ok: boolean;
            result?: T;
            error?: string;
          };
          settle({
            ok: normalized.ok,
            result: normalized.result,
            error: normalized.error,
            raw: reply,
          });
          return;
        }
        settle({ ok: true, result: reply as T, raw: reply });
      });
    } catch (cause) {
      clearTimeout(timer);
      settle({
        ok: false,
        error:
          cause instanceof Error
            ? cause.message
            : "Unknown error sending Matrx Extend RPC.",
      });
    }
  });
}

export async function detectExtensionId(
  candidates: ReadonlyArray<string> = MATRX_EXTEND_EXTENSION_IDS,
  options: SendOptions = {},
): Promise<{ id: string; latencyMs?: number } | null> {
  if (!isChromeRpcAvailable()) return null;
  for (const id of candidates) {
    const reply = await sendChromeRpc(id, "ping", {}, {
      timeoutMs: options.timeoutMs ?? 1_500,
    });
    if (reply.ok) return { id, latencyMs: reply.latencyMs };
  }
  return null;
}
