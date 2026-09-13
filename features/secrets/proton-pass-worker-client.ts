export function createProtonPassWorker(): Worker {
  return new Worker(new URL("./proton-pass.worker.ts", import.meta.url));
}
export function cancelProtonPassWorker(
  worker: Worker,
  requestId: string,
): void {
  worker.postMessage({ type: "cancel", requestId });
}
