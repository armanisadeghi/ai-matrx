/** Retries only read-only runtime lookup/rejoin delivery, never agent execution. */
export function isTransientReconnectError(error: unknown): boolean {
  if (error instanceof TypeError) return true; // fetch network failure
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: string; status?: number };
  return (
    value.name === "TimeoutError" ||
    (typeof value.status === "number" &&
      value.status >= 500 &&
      value.status <= 599)
  );
}

function waitForReconnect(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      globalThis.removeEventListener?.("online", ready);
    };
    const ready = () => {
      cleanup();
      resolve();
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Reconnect cancelled", "AbortError"));
    };
    const timer = setTimeout(ready, ms);
    signal.addEventListener("abort", abort, { once: true });
    globalThis.addEventListener?.("online", ready, { once: true });
    if (signal.aborted) abort();
  });
}

export async function retryReconnect<T>(
  attempt: () => Promise<T>,
  signal: AbortSignal,
  stillOwner: () => boolean = () => true,
): Promise<T> {
  const deadline = Date.now() + 120_000;
  let failures = 0;
  for (;;) {
    if (signal.aborted || !stillOwner())
      throw new DOMException("Reconnect superseded", "AbortError");
    try {
      return await attempt();
    } catch (error) {
      if (
        signal.aborted ||
        !isTransientReconnectError(error) ||
        Date.now() >= deadline
      )
        throw error;
      failures += 1;
      await waitForReconnect(Math.min(500 * failures, 2_000), signal);
    }
  }
}

export async function fetchRejoin(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  stillOwner: () => boolean = () => true,
): Promise<Response> {
  return retryReconnect(
    async () => {
      const response = await fetch(url, init);
      if (signal.aborted || !stillOwner()) {
        await response.body?.cancel();
        throw new DOMException("Reconnect superseded", "AbortError");
      }
      if (response.status >= 500) {
        await response.body?.cancel();
        throw Object.assign(new Error(`Rejoin HTTP ${response.status}`), {
          status: response.status,
        });
      }
      return response;
    },
    signal,
    stillOwner,
  );
}
