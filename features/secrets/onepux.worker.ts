import { parseOnePuxData } from "./onepux";
import { readOnePuxArchive } from "./onepux-archive";
import type { CsvImportLimits } from "./csv-import";
import type { StructuredImportRecord } from "./structured-import";

export type OnePuxWorkerLimits = Pick<
  CsvImportLimits,
  "maxFileBytes" | "maxRecords" | "maxCellBytes"
> & { maxJsonDepth?: number };
export type OnePuxWorkerRequest =
  | {
      type?: "parse";
      requestId?: string;
      file: Blob;
      limits: OnePuxWorkerLimits;
    }
  | { type: "cancel"; requestId?: string };
export type OnePuxWorkerResponse =
  | {
      ok: true;
      requestId?: string;
      records: StructuredImportRecord[];
      binaryMemberCount: number;
    }
  | {
      ok: false;
      requestId?: string;
      error: "The 1Password archive could not be read.";
    };
type ActiveOperation = { requestId?: string; controller: AbortController };

/** The production worker handler is exported so real ZIP integration tests use this exact path. */
export function createOnePuxWorkerMessageHandler(
  post: (response: OnePuxWorkerResponse) => void,
) {
  let active: ActiveOperation | undefined;
  return async (request: OnePuxWorkerRequest): Promise<void> => {
    if (request.type === "cancel") {
      if (
        active &&
        (!request.requestId || request.requestId === active.requestId)
      ) {
        active.controller.abort();
        active = undefined;
      }
      return;
    }
    active?.controller.abort();
    const operation: ActiveOperation = {
      requestId: request.requestId,
      controller: new AbortController(),
    };
    active = operation;
    try {
      const archive = await readOnePuxArchive(
        request.file,
        request.limits,
        operation.controller.signal,
      );
      const records = parseOnePuxData(
        archive.attributesText,
        archive.dataText,
        request.limits,
      );
      if (active !== operation || operation.controller.signal.aborted) return;
      post({
        ok: true,
        requestId: request.requestId,
        records,
        binaryMemberCount: archive.binaryMemberCount,
      });
    } catch {
      if (active !== operation || operation.controller.signal.aborted) return;
      post({
        ok: false,
        requestId: request.requestId,
        error: "The 1Password archive could not be read.",
      });
    } finally {
      if (active === operation) active = undefined;
    }
  };
}

if (typeof self !== "undefined") {
  const handleMessage = createOnePuxWorkerMessageHandler((response) =>
    self.postMessage(response),
  );
  self.onmessage = (event: MessageEvent<OnePuxWorkerRequest>) => {
    void handleMessage(event.data);
  };
}
