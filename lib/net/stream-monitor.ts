/**
 * Stream liveness monitor.
 *
 * Wraps an async iterable of server events and enforces two guarantees:
 *   1. Heartbeat deadline — fail if no event arrives within `heartbeatTimeoutMs`.
 *   2. Absolute ceiling — fail if total wall-clock time exceeds `maxLifetimeMs`.
 *
 * The wrapper is transparent: events pass through in order, with the same
 * shape. The only observable difference is that a stuck stream throws
 * `HeartbeatTimeoutError` or `TotalTimeoutError` instead of awaiting forever.
 *
 * The wrapped iterable should be driven by NDJSON parsing; the server MUST
 * emit `{kind:"heartbeat"}` at least every `heartbeatTimeoutMs / 2` ms for
 * long-running operations. See /Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/STREAM-CONTRACT.md.
 */

import { HeartbeatTimeoutError, TotalTimeoutError } from "./errors";

export interface StreamMonitorOptions {
  /** Max ms between any two events before the stream is considered dead. Default 30_000. */
  heartbeatTimeoutMs?: number;
  /** Max ms from wrap-start before throwing regardless of heartbeats. Default 600_000 (10min). */
  maxLifetimeMs?: number;
  /** Optional callback, fired every time a fresh event resets the deadline. */
  onHeartbeat?: (now: number) => void;
  /** Controller whose `.abort()` should be called on monitor-level timeout, so the underlying fetch is cancelled. */
  abortController?: AbortController;
}

const DEFAULTS = {
  heartbeatTimeoutMs: 30_000,
  maxLifetimeMs: 600_000,
} as const;

/**
 * Wraps an async iterable so that it throws on stalled or overlong streams.
 *
 * Usage:
 *   const live = monitorStream(events, { heartbeatTimeoutMs, abortController });
 *   for await (const ev of live) { ... }
 */
export async function* monitorStream<T>(
  source: AsyncIterable<T>,
  opts: StreamMonitorOptions = {},
): AsyncGenerator<T, void, undefined> {
  const heartbeatTimeoutMs =
    opts.heartbeatTimeoutMs ?? DEFAULTS.heartbeatTimeoutMs;
  const maxLifetimeMs = opts.maxLifetimeMs ?? DEFAULTS.maxLifetimeMs;
  const abort = opts.abortController;

  const startedAt = Date.now();
  const iter = source[Symbol.asyncIterator]() as AsyncIterator<T>;

  while (true) {
    const elapsed = Date.now() - startedAt;
    const remainingLifetime = maxLifetimeMs - elapsed;
    if (remainingLifetime <= 0) {
      abort?.abort("total-timeout");
      throw new TotalTimeoutError(maxLifetimeMs);
    }

    const deadline = Math.min(heartbeatTimeoutMs, remainingLifetime);

    let timer: ReturnType<typeof setTimeout> | null = null;
    let timedOutKind: "heartbeat" | "total" | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOutKind =
          deadline === remainingLifetime ? "total" : "heartbeat";
        abort?.abort(
          timedOutKind === "total" ? "total-timeout" : "heartbeat-timeout",
        );
        reject(
          timedOutKind === "total"
            ? new TotalTimeoutError(maxLifetimeMs)
            : new HeartbeatTimeoutError(heartbeatTimeoutMs),
        );
      }, deadline);
    });

    let result: IteratorResult<T>;
    try {
      result = await Promise.race([iter.next(), timeoutPromise]);
    } catch (err) {
      if (timer !== null) clearTimeout(timer);
      // Best-effort: let the underlying iterator clean up.
      try {
        await iter.return?.(undefined as never);
      } catch {
        /* ignore */
      }
      throw err;
    }

    if (timer !== null) clearTimeout(timer);
    if (result.done) return;

    opts.onHeartbeat?.(Date.now());
    yield result.value;
  }
}
