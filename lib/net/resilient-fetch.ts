/**
 * resilientFetch — `fetch` with connect + total timeouts and composed abort.
 *
 * Every outbound HTTP call in the app should go through this, not raw fetch.
 * The two-stage timeout (connect + total) lets callers allow long-streaming
 * responses without giving up the ability to fail fast when the server is
 * simply unreachable.
 */

import { extractErrorMessage } from "@/utils/errors";
import {
  AbortedError,
  ConnectTimeoutError,
  HttpError,
  NetworkError,
  OfflineError,
  TotalTimeoutError,
} from "./errors";

export interface ResilientFetchOptions {
  /** Max ms from request start → response headers received. Default 15_000. */
  connectTimeoutMs?: number;
  /**
   * Max ms from request start → fetch() promise resolves.
   * For streaming endpoints the response arrives quickly and the stream body
   * is read by the caller, so this bound only guards the handshake itself.
   * `null` disables the ceiling. Default 120_000.
   */
  totalTimeoutMs?: number | null;
  /** Caller-provided signal; composed with our internal timeout signals. */
  signal?: AbortSignal;
  /**
   * If true, throw on non-2xx responses instead of returning them. Default true.
   * Callers that need to read structured error bodies can set this to false.
   */
  throwOnHttpError?: boolean;
}

export interface ResilientFetchResult {
  response: Response;
  /**
   * Composed AbortController tied to the fetch. Callers reading the body
   * (e.g. streaming) can call `.abort()` from this controller to cancel
   * in-flight reads. Already aborted on connect/total timeout.
   */
  controller: AbortController;
}

const DEFAULTS = {
  connectTimeoutMs: 15_000,
  totalTimeoutMs: 120_000,
} as const;

function linkAbort(target: AbortController, signal: AbortSignal): () => void {
  if (signal.aborted) {
    target.abort(signal.reason);
    return () => {};
  }
  const onAbort = () => target.abort(signal.reason);
  signal.addEventListener("abort", onAbort, { once: true });
  return () => signal.removeEventListener("abort", onAbort);
}

export async function resilientFetch(
  url: string,
  init: RequestInit = {},
  opts: ResilientFetchOptions = {},
): Promise<ResilientFetchResult> {
  const connectTimeoutMs = opts.connectTimeoutMs ?? DEFAULTS.connectTimeoutMs;
  const totalTimeoutMs =
    opts.totalTimeoutMs === undefined
      ? DEFAULTS.totalTimeoutMs
      : opts.totalTimeoutMs;
  const throwOnHttpError = opts.throwOnHttpError ?? true;

  // NOTE: we deliberately do NOT hard-block on `navigator.onLine === false`
  // here. That flag is only a HINT — it is unreliable in both directions
  // (VPNs, virtual network adapters, browser network-service hiccups, sleep/
  // wake, and some corporate stacks leave it stuck at `false` while the
  // machine is fully online). Trusting it as a pre-flight gate produced a
  // real production outage: the Agent Builder (this path) threw OfflineError
  // on every submit while the Run path — which uses plain fetch() and never
  // consults the flag — worked fine on the same network. We now let the
  // fetch actually run and only classify the result as "offline" if a genuine
  // network failure ALSO corroborates the flag (see the catch below).

  const controller = new AbortController();
  const unlinkCaller = opts.signal
    ? linkAbort(controller, opts.signal)
    : () => {};

  let connectTimedOut = false;
  let totalTimedOut = false;

  const connectTimer = setTimeout(() => {
    connectTimedOut = true;
    controller.abort("connect-timeout");
  }, connectTimeoutMs);

  const totalTimer =
    totalTimeoutMs !== null
      ? setTimeout(() => {
          totalTimedOut = true;
          controller.abort("total-timeout");
        }, totalTimeoutMs)
      : null;

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(connectTimer);
    // NOTE: we deliberately leave the totalTimer running — it keeps guarding
    // the caller reading the body. It will be cleared in a `finally` when
    // the caller finishes or errors. For non-streaming callers this means
    // the guard persists until the body is fully consumed.
    if (totalTimer !== null) clearTimeout(totalTimer);

    if (throwOnHttpError && !response.ok) {
      throw new HttpError(
        response.status,
        `HTTP ${response.status} ${response.statusText}`,
      );
    }

    return { response, controller };
  } catch (err) {
    clearTimeout(connectTimer);
    if (totalTimer !== null) clearTimeout(totalTimer);

    if (connectTimedOut) throw new ConnectTimeoutError(connectTimeoutMs, err);
    if (totalTimedOut)
      throw new TotalTimeoutError(totalTimeoutMs as number, err);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new AbortedError(err);
    }
    if (err instanceof TypeError) {
      // fetch() throws TypeError on DNS/connection failure. If the browser
      // ALSO reports offline, the flag is now corroborated by an actual
      // failure — surface the more specific OfflineError. Absent a real
      // failure, `navigator.onLine === false` is never allowed to block.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        throw new OfflineError();
      }
      throw new NetworkError(err.message || "Network request failed", err);
    }
    if (err instanceof HttpError) throw err;
    throw new NetworkError(extractErrorMessage(err), err);
  } finally {
    unlinkCaller();
  }
}
