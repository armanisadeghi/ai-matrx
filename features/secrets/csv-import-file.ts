/**
 * A CSV FILE parses off the main thread. This module STARTS the worker, so the worker must never
 * reach it: `csv-import.worker.ts` imports only `csv-import.ts`, never this file. A worker that
 * reaches the module that starts it makes Turbopack's production compile run forever
 * (`pnpm check:worker-cycles`).
 */
import { parseCsvText, type CsvImportLimits, type CsvImportPreview } from "./csv-import";
import type { CsvWorkerRequest, CsvWorkerResponse } from "./csv-import.worker";

export function parseCsvFile(
  file: File,
  limits: CsvImportLimits,
): Promise<CsvImportPreview> {
  if (file.size > limits.maxFileBytes)
    return Promise.reject(
      new Error("The file exceeds this organization’s import size limit."),
    );
  return file.arrayBuffer().then((bytes) => {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("The CSV must be valid UTF-8.");
    }
    // One parser for paste and file (Alchemy's delimited parser). A file can be as large as the
    // organization's limit, so it parses in a worker; with no Worker (tests, SSR) it parses here.
    if (typeof Worker === "undefined") return parseCsvText(text, limits);
    return import("./csv-import-worker-client").then(
      ({ createCsvImportWorker }) =>
        new Promise<CsvImportPreview>((resolve, reject) => {
          const worker = createCsvImportWorker();
          const unreadable = () =>
            reject(
              new Error(
                "The CSV could not be read. Fix the file and try again.",
              ),
            );
          worker.onmessage = (event: MessageEvent<CsvWorkerResponse>) => {
            worker.terminate();
            if (event.data.ok) resolve(event.data.preview);
            else reject(new Error(event.data.message));
          };
          worker.onerror = () => {
            worker.terminate();
            unreadable();
          };
          worker.postMessage({ text, limits } satisfies CsvWorkerRequest);
        }),
    );
  });
}
