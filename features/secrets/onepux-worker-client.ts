export function createOnePuxWorker(): Worker {
  return new Worker(new URL("./onepux.worker.ts", import.meta.url));
}

/** Abort an in-flight parse before the caller terminates or replaces its worker. */
export function cancelOnePuxWorker(worker: Worker, requestId?: string): void {
  worker.postMessage({ type: "cancel", requestId });
}
