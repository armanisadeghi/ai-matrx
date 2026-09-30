/**
 * fileSource — how a stored file on a Source card becomes its Source, decided
 * from the SERVER's state alone (USI-3e). UI-free and pure apart from the one
 * read, so the core can move into the extracted runtime unchanged.
 *
 * The server owns reading a file: every upload's finalize already starts the
 * one processing run (the file adapters → a `processed_documents` row), and
 * `/files/{id}/rag-status` merges that run's lifecycle row with the Source it
 * made. So a card never starts its own run while one is live, a reload simply
 * reads the state again (re-attach, never a second job), and a file someone
 * already had ("use the one you already have", or picked from Files) is kept
 * the moment its existing Source is seen.
 */

import { fetchFileRagStatus, type FileRagStatus } from "@/features/rag/api/rag-jobs";
import { fileOrganizationId } from "@/features/files/api/fileOrganization";
import type { SourceCardModel } from "./types";

export type FileSourceStep =
  /** The Source exists: keep it and file it against the thing being made. */
  | { do: "keep"; processedDocumentId: string }
  /** A run is reading it now (server-side or this tab's own). Look again soon. */
  | { do: "wait" }
  /** Nothing is reading it and it has no Source yet: start the one run. */
  | { do: "start" }
  /** It cannot become a Source; say why, and stop looking. */
  | { do: "unreadable"; reason: string };

export interface FileSourceContext {
  /** This card already started a run in this page's life. */
  started: boolean;
  /** This tab's processing runner has a live run for the file. */
  localRunning: boolean;
}

const UNREADABLE =
  "Can't read this file — add a PDF, Word or text copy.";

/** The one decision. `status` is the server's `/files/{id}/rag-status` answer. */
export function nextFileStep(
  status: Pick<FileRagStatus, "state" | "processed_document_id" | "error"> | null,
  ctx: FileSourceContext,
): FileSourceStep {
  const pdId = status?.processed_document_id ?? null;
  if (pdId) return { do: "keep", processedDocumentId: pdId };
  if (ctx.localRunning || status?.state === "running") return { do: "wait" };
  if (status?.state === "failed")
    return {
      do: "unreadable",
      reason: status.error?.message
        ? `Can't read this file: ${status.error.message}. Add it again.`
        : UNREADABLE,
    };
  if (!ctx.started) return { do: "start" };
  return { do: "unreadable", reason: UNREADABLE };
}

/** Read the server's state for one file (its organization rides the request). */
export function readFileSourceState(fileId: string, signal?: AbortSignal): Promise<FileRagStatus> {
  return fetchFileRagStatus(fileId, signal);
}

/** How long to wait before looking again: quick at first, then spaced out. */
export function fileSourcePollDelayMs(round: number): number {
  if (round < 5) return 3_000;
  if (round < 20) return 6_000;
  return 15_000;
}

/** A stored file on a card whose Source is not known yet — the recovery reads its state. */
export function isWaitingFileCard(card: SourceCardModel): boolean {
  return (
    card.status === "ready" &&
    card.draft.ref?.resource_type === "file" &&
    !!card.draft.fileId &&
    !card.draft.processedDocumentId
  );
}

/**
 * True while a waiting file card cannot be asked about yet: `/files/{id}/
 * rag-status` answers only with an organization (the file's own, when the
 * file told us, or the one the person picked). Without one every read was a
 * refused 400 — every ~3 s, piling up as page errors (V2-F #3). So the card
 * is HELD: it says it is waiting for an organization, offers the one picker,
 * and nothing is asked until one is known.
 */
export function fileCardHeldForOrganization(
  card: SourceCardModel,
  activeOrganizationId: string | null | undefined,
): boolean {
  if (!isWaitingFileCard(card)) return false;
  if (activeOrganizationId) return false;
  return !fileOrganizationId(card.draft.fileId as string);
}
