import { parseProtonPassExport } from "./proton-pass";
import { readProtonPassArchive } from "./proton-pass-archive";
import type {
  StructuredImportWorkerRequest,
  StructuredImportWorkerResponse,
} from "./structured-import-worker-protocol";

export function createProtonPassWorkerMessageHandler(
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
      if (request.file.size > request.limits.maxFileBytes)
        throw new Error("limit");
      const fileName = (request.file as Blob & { name?: string }).name;
      const isZip =
        request.file.type === "application/zip" ||
        request.file.type === "application/x-zip-compressed" ||
        fileName?.toLowerCase().endsWith(".zip") === true;
      const archive = isZip
        ? await readProtonPassArchive(
            request.file,
            request.limits,
            operation.controller.signal,
          )
        : undefined;
      const text = archive
        ? archive.dataText
        : new TextDecoder("utf-8", { fatal: true }).decode(
            await request.file.arrayBuffer(),
          );
      const records = parseProtonPassExport(
        text,
        request.limits,
        archive?.binaryNames,
      );
      if (active !== operation || operation.controller.signal.aborted) return;
      post({
        ok: true,
        requestId: request.requestId,
        records,
        fileNotices:
          archive && archive.binaryNames.size > 0
            ? [
                {
                  code: "unsupported_archive_members",
                  count: archive.binaryNames.size,
                },
              ]
            : [],
      });
    } catch {
      if (active === operation && !operation.controller.signal.aborted)
        post({
          ok: false,
          requestId: request.requestId,
          error: "The Proton Pass export could not be read.",
        });
    } finally {
      if (active === operation) active = undefined;
    }
  };
}
if (typeof self !== "undefined") {
  const handle = createProtonPassWorkerMessageHandler((response) =>
    self.postMessage(response),
  );
  self.onmessage = (event: MessageEvent<StructuredImportWorkerRequest>) => {
    void handle(event.data);
  };
}
