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

/** The public Chrome Web Store item (`Published - public`, item identity in
 * common-docs/systems/clients/extension/CHROME-WEB-STORE.md). Built from the
 * id above so the link and the id it detects can never drift apart. */
export const MATRX_EXTEND_STORE_URL = `https://chromewebstore.google.com/detail/${MATRX_EXTEND_EXTENSION_IDS[1]}`;

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

/**
 * The install this page last got an answer from.
 *
 * 🚨 THIS EXISTS FOR A USER GESTURE, NOT FOR SPEED. Chrome gives a page about
 * five seconds of transient activation after a click; the extension can only
 * open its own side panel while that activation is still alive (measured in
 * matrx-extend `tests/browser/side-panel-gesture-spike.mjs`: a 2s pause still
 * opened the panel, a 6s pause did not). `detectExtensionId` costs a round
 * trip per candidate and, when the Store build is the one installed, a full
 * timeout on the unpacked id first — so probing inside a click handler could
 * spend the whole window before the real message was ever sent, and the person
 * would press a button that quietly did not open anything.
 *
 * So a successful probe is REMEMBERED, and the click path reads it
 * synchronously. This is never treated as proof the extension is still there:
 * the very next call is a real message, and if the install has gone away that
 * call fails and the caller says so. A remembered id can only make us talk to
 * the right install faster — never claim one exists.
 */
let rememberedExtensionId: string | null = null;

/** The id a probe last confirmed, without asking again. Null when none has. */
export function getRememberedExtensionId(): string | null {
  return rememberedExtensionId;
}

/** Forget it — an install that stopped answering must be probed for again. */
export function forgetRememberedExtensionId(): void {
  rememberedExtensionId = null;
}

export async function detectExtensionId(
  candidates: ReadonlyArray<string> = MATRX_EXTEND_EXTENSION_IDS,
  options: SendOptions = {},
): Promise<{ id: string; latencyMs?: number } | null> {
  if (!isChromeRpcAvailable()) return null;
  // Asked of every candidate AT ONCE. Serially, a browser running the Store
  // build waited out the unpacked id's full timeout first — 1.5s of a 5s
  // gesture window spent learning nothing.
  const replies = await Promise.all(
    candidates.map(async (id) => ({
      id,
      reply: await sendChromeRpc(id, "ping", {}, {
        timeoutMs: options.timeoutMs ?? 1_500,
      }),
    })),
  );
  // Candidate order is the preference order, so the first that answered wins
  // however fast the others were.
  for (const { id, reply } of replies) {
    if (reply.ok) {
      rememberedExtensionId = id;
      return { id, latencyMs: reply.latencyMs };
    }
  }
  return null;
}
