/** Kept out of csv-import.ts so the non-worker import path stays testable. */
export function createCsvImportWorker(): Worker {
  return new Worker(new URL("./csv-import.worker.ts", import.meta.url));
}
