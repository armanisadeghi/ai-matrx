import { parseBitwardenExport } from "./bitwarden-json";

self.onmessage = (event: MessageEvent<{ text: string; limits: Parameters<typeof parseBitwardenExport>[1] }>) => {
  try { self.postMessage({ ok: true, records: parseBitwardenExport(event.data.text, event.data.limits) }); }
  catch (error) { self.postMessage({ ok: false, error: error instanceof Error ? error.message : "The JSON export could not be read." }); }
};
