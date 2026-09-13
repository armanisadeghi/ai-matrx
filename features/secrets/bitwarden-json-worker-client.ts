/** Kept out of the dialog module so the non-worker import path stays testable. */
export function createBitwardenJsonWorker(): Worker {
  return new Worker(new URL("./bitwarden-json.worker.ts", import.meta.url));
}

export function cancelBitwardenJsonWorker(
  worker: Worker,
  requestId: string,
): void {
  worker.postMessage({ type: "cancel", requestId });
}
