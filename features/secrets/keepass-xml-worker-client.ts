/** Kept out of the dialog module so the worker boundary remains independently testable. */
export function createKeePassXmlWorker(): Worker {
  return new Worker(new URL("./keepass-xml.worker.ts", import.meta.url));
}

export function cancelKeePassXmlWorker(
  worker: Worker,
  requestId: string,
): void {
  worker.postMessage({ type: "cancel", requestId });
}
