/** Parses a CSV import off the main thread: a file near the size limit would otherwise freeze the dialog. */
import { parseCsvText, type CsvImportLimits, type CsvImportPreview } from "./csv-import";

export type CsvWorkerRequest = { text: string; limits: CsvImportLimits };
export type CsvWorkerResponse =
  | { ok: true; preview: CsvImportPreview }
  | { ok: false; message: string };

self.onmessage = (event: MessageEvent<CsvWorkerRequest>) => {
  let response: CsvWorkerResponse;
  try {
    response = { ok: true, preview: parseCsvText(event.data.text, event.data.limits) };
  } catch (error) {
    response = {
      ok: false,
      message: error instanceof Error ? error.message : "The CSV could not be read. Fix the file and try again.",
    };
  }
  (self as unknown as { postMessage(message: CsvWorkerResponse): void }).postMessage(response);
};
