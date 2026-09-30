"use client";

/**
 * useSourceRecovery — the UI-free half of "never lose input" (USI-3b).
 *
 *  1. A Source a reload cut off while it was landing, whose input the draft
 *     kept (`interrupted.ts`), is handed back to the door once — the door
 *     dedupes by content hash, so a second landing reuses the same Source.
 *  2. A landing that waited for an organization (its card says so) is landed
 *     again the moment one is set — from the card's kept input, or, for a read
 *     Source whose keep waited, by keeping it again. State, never an in-memory
 *     queue, so it survives a reload too (A3-F: the second hold queue is gone).
 *  3. A stored file's Source (new upload, reused copy, or picked file) is read
 *     from the SERVER's state (`fileSource.ts`): kept and filed against the
 *     thing being made once it exists (`useSourceIntake().fileLanded`), the one
 *     run started only when nothing is reading it, re-attached after a reload.
 *
 * Module-scope guards mean two inputs on one surface (or a re-mount) never
 * land the same card twice. Any UI that sits on `useSourceSet` +
 * `useSourceIntake` calls this once.
 */

import { useEffect, useEffectEvent } from "react";
import type { UseProcessingRunner } from "@/features/rag/hooks/useProcessingRunner";
import {
  fileCardHeldForOrganization,
  fileSourcePollDelayMs,
  isWaitingFileCard,
  nextFileStep,
  readFileSourceState,
} from "./fileSource";
import {
  KEEP_WAITING_FOR_ORGANIZATION,
  RELOADED_RESUMING,
  WAITING_FOR_ORGANIZATION,
} from "./interrupted";
import type { SourceCardModel } from "./types";
import type { UseSourceIntakeResult } from "./useSourceIntake";
import type { UseSourceSetResult } from "./useSourceSet";

const resumedCards = new Set<string>();
const keptFileSources = new Set<string>();
const startedFileRuns = new Set<string>();

export function useSourceRecovery(
  set: UseSourceSetResult,
  intake: UseSourceIntakeResult,
  runner: UseProcessingRunner,
  /** The organization the person picked (null = none yet). A file card is only asked about once one is known. */
  options: { organizationId: string | null | undefined },
): void {
  // ── Never lose input: land again what a reload cut off ─────────────────────
  const resumeKey = set.sources
    .filter((s) => s.status === "error" && s.error === RELOADED_RESUMING)
    .map((s) => s.id)
    .join(",");
  const resumeInterrupted = useEffectEvent(() => {
    for (const card of set.sources) {
      if (card.status !== "error" || card.error !== RELOADED_RESUMING) continue;
      if (resumedCards.has(card.id)) continue;
      resumedCards.add(card.id);
      intake.resume(card);
    }
  });
  useEffect(() => {
    if (resumeKey) resumeInterrupted();
  }, [resumeKey]);

  // ── Waited for an organization: go on the moment one is set ─────────────────
  const waitingForOrgKey = options.organizationId
    ? set.sources
        .filter(
          (s) =>
            (s.status === "error" && s.error === WAITING_FOR_ORGANIZATION) ||
            (!!s.draft.processedDocumentId && !!s.draft.notes?.includes(KEEP_WAITING_FOR_ORGANIZATION)),
        )
        .map((s) => s.id)
        .join(",")
    : "";
  const continueAfterOrganization = useEffectEvent(() => {
    for (const card of set.sources) {
      if (card.status === "error" && card.error === WAITING_FOR_ORGANIZATION) {
        intake.resume(card);
      } else if (card.draft.processedDocumentId && card.draft.notes?.includes(KEEP_WAITING_FOR_ORGANIZATION)) {
        void intake.fileLanded(card, card.draft.processedDocumentId);
      }
    }
  });
  useEffect(() => {
    if (waitingForOrgKey) continueAfterOrganization();
  }, [waitingForOrgKey]);

  // ── A stored file's Source: read the SERVER's state, never this tab's memory
  // (USI-3e). A new upload's finalize already started the one reading run; a
  // file the person already had ("use the one you already have", or picked
  // from Files) may already have its Source. So each file card looks at
  // `/files/{id}/rag-status`: a Source → keep and file it; a live run → look
  // again; nothing reading it → start the one run (once); unreadable → say so.
  // A reload lands here again and re-attaches to whatever the server is doing
  // — it never starts a duplicate run and never loses the file.
  // Held for an organization (V2-F #3): no organization known = nothing asked.
  // Picking one changes the key, so the look starts by itself.
  const askable = (card: SourceCardModel) =>
    isWaitingFileCard(card) && !fileCardHeldForOrganization(card, options.organizationId);
  const waitingKey = set.sources
    .filter(askable)
    .map((c) => `${c.id}:${c.draft.fileId}`)
    .join(",");
  const lookAtFiles = useEffectEvent(async (signal: AbortSignal): Promise<boolean> => {
    let anyWaiting = false;
    for (const card of set.sources.filter(askable)) {
      const fileId = card.draft.fileId as string;
      const guard = `${card.id}:${fileId}`;
      if (keptFileSources.has(guard)) continue;
      let status: Awaited<ReturnType<typeof readFileSourceState>> | null = null;
      try {
        status = await readFileSourceState(fileId, signal);
      } catch {
        // A missed read is not an answer — look again next round.
        if (signal.aborted) return false;
        anyWaiting = true;
        continue;
      }
      if (signal.aborted) return false;
      const localJob = runner.jobs.find((j) => j.cldFileId === fileId) ?? null;
      const step = nextFileStep(status, {
        started: startedFileRuns.has(guard),
        localRunning: localJob?.status === "running",
      });
      const localPdId = localJob?.processedDocumentId ?? null;
      if (step.do === "keep" || localPdId) {
        keptFileSources.add(guard);
        const pdId = step.do === "keep" ? step.processedDocumentId : (localPdId as string);
        await intake.fileLanded(card, pdId);
        // The pointer did not change, so nothing else re-measures: ask once now.
        void set.manifest();
      } else if (step.do === "start") {
        startedFileRuns.add(guard);
        anyWaiting = true;
        void runner
          .runForCldFile(fileId, card.draft.label, "Reading it into a Source")
          .catch(() => undefined);
      } else if (step.do === "unreadable") {
        keptFileSources.add(guard);
        set.fail(card.id, step.reason);
      } else {
        anyWaiting = true;
      }
    }
    return anyWaiting;
  });
  useEffect(() => {
    if (!waitingKey) return undefined;
    const ac = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const look = (round: number) => {
      timer = setTimeout(async () => {
        const again = await lookAtFiles(ac.signal);
        if (again && !ac.signal.aborted) look(round + 1);
      }, fileSourcePollDelayMs(round));
    };
    look(0);
    return () => {
      ac.abort();
      if (timer) clearTimeout(timer);
    };
  }, [waitingKey]);
}
