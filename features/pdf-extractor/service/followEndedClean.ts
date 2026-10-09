/**
 * PDF Extractor — a clean stream that ended with no clean text.
 *
 * The run record, not a timer, says what really happened: follow the clean's
 * run to its terminal status (`followServerJob`, @ai-matrx/agents/matrx) and
 * reload the saved document exactly once when it completed. A failed run
 * carries its own reason; any other end (cancelled, no run) is reported as such.
 * `follow` is injectable so the decision is unit-testable.
 */
import { followServerJob } from "@ai-matrx/agents/matrx";
import type {
  MatrxTransport,
  ServerJobFinalStatus,
  ServerJobOutcome,
  ServerJobTarget,
} from "@ai-matrx/agents/matrx";
import { CLEAN_FAILED_MESSAGE, describeRunError } from "./cleanOutcome";

export type EndedCleanResolution<TDoc> =
  | { kind: "completed"; document: TDoc | null }
  | { kind: "failed"; message: string }
  | { kind: "unresolved"; status: ServerJobFinalStatus };

type FollowFn = (
  transport: MatrxTransport,
  options: Parameters<typeof followServerJob>[1],
) => Promise<ServerJobOutcome>;

export async function resolveEndedClean<TDoc>(args: {
  transport: MatrxTransport;
  docId: string;
  /** This clean's own `X-Request-ID`, when the stream got far enough to give one. */
  requestId: string | null;
  /** Re-read the saved document; called once, only on `completed`. */
  reload: () => Promise<TDoc | null>;
  signal?: AbortSignal;
  follow?: FollowFn;
}): Promise<EndedCleanResolution<TDoc>> {
  const { transport, docId, requestId, reload, signal, follow = followServerJob } = args;
  const target: ServerJobTarget = requestId
    ? { requestId }
    : { linkKind: "processed_document", linkId: docId };
  let document: TDoc | null = null;
  const outcome = await follow(transport, {
    target,
    signal,
    reloadSavedResult: async ({ status }) => {
      if (status === "completed") document = await reload();
    },
  });
  if (outcome.status === "completed") return { kind: "completed", document };
  if (outcome.status === "failed") {
    return {
      kind: "failed",
      message: describeRunError(outcome.error)
        ? `${CLEAN_FAILED_MESSAGE}: ${describeRunError(outcome.error)}`
        : CLEAN_FAILED_MESSAGE,
    };
  }
  return { kind: "unresolved", status: outcome.status };
}
