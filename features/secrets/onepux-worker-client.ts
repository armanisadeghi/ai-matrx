export function createOnePuxWorker(): Worker {
  return new Worker(new URL("./onepux.worker.ts", import.meta.url));
}
