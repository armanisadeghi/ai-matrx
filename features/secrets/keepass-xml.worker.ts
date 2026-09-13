import { parseKeePassXml } from "./keepass-xml";
import type {
  StructuredImportWorkerRequest,
  StructuredImportWorkerResponse,
} from "./structured-import-worker-protocol";

export function createKeePassXmlWorkerMessageHandler(
  post: (response: StructuredImportWorkerResponse) => void,
) {
  let active: { requestId: string; controller: AbortController } | undefined;
  return async (request: StructuredImportWorkerRequest): Promise<void> => {
    if (request.type === "cancel") {
      if (active?.requestId === request.requestId) {
        active.controller.abort();
        active = undefined;
      }
      return;
    }
    active?.controller.abort();
    const operation = {
      requestId: request.requestId,
      controller: new AbortController(),
    };
    active = operation;
    try {
      if (request.file.size > request.limits.maxFileBytes) throw new Error("limit");
      const bytes = await request.file.arrayBuffer();
      if (operation.controller.signal.aborted) return;
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const { records, fileNotices } = parseKeePassXml(text, request.limits);
      if (active !== operation || operation.controller.signal.aborted) return;
      post({ ok: true, requestId: request.requestId, records, fileNotices });
    } catch {
      if (active !== operation || operation.controller.signal.aborted) return;
      post({
        ok: false,
        requestId: request.requestId,
        error: "The KeePass XML export could not be read.",
      });
    } finally {
      if (active === operation) active = undefined;
    }
  };
}

if (typeof self !== "undefined") {
  const handle = createKeePassXmlWorkerMessageHandler((response) =>
    self.postMessage(response),
  );
  self.onmessage = (event: MessageEvent<StructuredImportWorkerRequest>) => {
    void handle(event.data);
  };
}
