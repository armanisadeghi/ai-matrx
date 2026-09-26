/**
 * features/source-library/catalog/sourceState.ts
 *
 * SOURCE-CONVERGENCE §1 rule 6 and §8.6 — whether one catalogued item IS a
 * Source yet, as one pure function of the row, so the cell, the polling and
 * the tests can never disagree about it.
 *
 * A catalogued video is a LISTING until its words land through the door: the
 * server says so on the row (`not_yet_a_source`, with the Action that makes it
 * one), and says which Source it became once it did (`processed_document_id`).
 * The screen repeats those two facts; it never infers a Source from a
 * transcript status, and it never offers Transcribe the server did not offer.
 */

import type { ActionDeclaration, VideoRow } from "../types";

/** How long a Transcribe started from this screen is watched without the
 *  server reporting it queued/running before the row stops saying
 *  "Transcribing…" (a job that never started must not spin for ever). */
export const TRANSCRIBE_WATCH_MS = 15 * 60 * 1000;

/** How often a row that is transcribing re-reads the list. */
export const TRANSCRIBE_POLL_MS = 5000;

export type TranscribeOffer =
    /** A live control: the server declared the Action and it can run here. */
    | { available: true; action: ActionDeclaration }
    /** No control. `reason` is the server's sentence when it gave one. */
    | { available: false; reason: string | null };

export type CatalogSourceState =
    | { kind: "source"; processedDocumentId: string }
    | { kind: "transcribing" }
    | { kind: "not_yet"; message: string; transcribe: TranscribeOffer }
    /** A transcript exists but has not landed as a Source yet. */
    | { kind: "transcribed_not_landed" }
    /** The server sent neither fact (a build that predates them). */
    | { kind: "unknown" };

export interface SourceStateContext {
    /** Row id → epoch ms a Transcribe was started for it from this screen. */
    pending: Readonly<Record<string, number>>;
    now: number;
    /**
     * The server's Action registry. `undefined` while it has not answered —
     * the control is then absent, never a guess.
     */
    actions: readonly ActionDeclaration[] | undefined;
    /**
     * Whether this Library's kind has anything to transcribe (`vocabulary.transcribable`).
     * `null` while the Library row has not arrived.
     */
    transcribable: boolean | null;
}

function transcribeOffer(
    offeredAction: string,
    ctx: SourceStateContext,
): TranscribeOffer {
    if (ctx.actions === undefined) return { available: false, reason: null };
    if (ctx.transcribable === false) return { available: false, reason: null };
    const action = ctx.actions.find((a) => a.key === offeredAction);
    if (!action) return { available: false, reason: null };
    if (action.available === false) {
        return { available: false, reason: action.unavailable_reason?.trim() || null };
    }
    return { available: true, action };
}

export function catalogSourceState(
    row: Pick<
        VideoRow,
        "id" | "processed_document_id" | "not_yet_a_source" | "transcript_status"
    >,
    ctx: SourceStateContext,
): CatalogSourceState {
    if (row.processed_document_id) {
        return { kind: "source", processedDocumentId: row.processed_document_id };
    }
    if (row.transcript_status === "queued" || row.transcript_status === "running") {
        return { kind: "transcribing" };
    }
    const startedAt = ctx.pending[row.id];
    const watching =
        startedAt !== undefined &&
        ctx.now - startedAt < TRANSCRIBE_WATCH_MS &&
        // A run that ended failed/skipped is over — the row offers the action
        // again and the "Last action" column carries the server's sentence.
        (row.transcript_status === "none" || row.transcript_status === "ready");
    if (watching) return { kind: "transcribing" };
    if (row.not_yet_a_source) {
        return {
            kind: "not_yet",
            message: row.not_yet_a_source.message,
            transcribe: transcribeOffer(row.not_yet_a_source.offered_action, ctx),
        };
    }
    if (row.transcript_status === "ready") return { kind: "transcribed_not_landed" };
    return { kind: "unknown" };
}

/** Whether any row on screen is transcribing — the list keeps re-reading while so. */
export function anyTranscribing(
    rows: readonly Pick<
        VideoRow,
        "id" | "processed_document_id" | "not_yet_a_source" | "transcript_status"
    >[],
    ctx: SourceStateContext,
): boolean {
    return rows.some((row) => catalogSourceState(row, ctx).kind === "transcribing");
}
