"use client";

/**
 * useSourceRecovery — the UI-free half of "never lose input" (USI-3b).
 *
 *  1. A Source a reload cut off while it was landing, whose input the draft
 *     kept (`interrupted.ts`), is handed back to the door once — the door
 *     dedupes by content hash, so a second landing reuses the same Source.
 *  2. An uploaded file's Source exists only once reading makes it: when the
 *     processing runner reports it, the Source is kept and filed against the
 *     thing being made (`useSourceIntake().fileLanded`).
 *
 * Module-scope guards mean two inputs on one surface (or a re-mount) never
 * land the same card twice. Any UI that sits on `useSourceSet` +
 * `useSourceIntake` calls this once.
 */

import { useEffect, useEffectEvent } from "react";
import type { UseProcessingRunner } from "@/features/rag/hooks/useProcessingRunner";
import { RELOADED_RESUMING } from "./interrupted";
import type { UseSourceIntakeResult } from "./useSourceIntake";
import type { UseSourceSetResult } from "./useSourceSet";

const resumedCards = new Set<string>();
const keptFileSources = new Set<string>();

export function useSourceRecovery(
  set: UseSourceSetResult,
  intake: UseSourceIntakeResult,
  runner: UseProcessingRunner,
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

  // ── An uploaded file's Source exists once reading makes it: keep + file it
  const landedKey = runner.jobs
    .filter((j) => j.processedDocumentId && j.cldFileId)
    .map((j) => `${j.cldFileId}:${j.processedDocumentId}`)
    .join(",");
  const keepLandedFiles = useEffectEvent(() => {
    for (const card of set.sources) {
      const fileId = card.draft.fileId;
      if (!fileId || card.draft.processedDocumentId || card.draft.ref?.resource_type !== "file") continue;
      const job = runner.jobs.find((j) => j.cldFileId === fileId && j.processedDocumentId);
      if (!job?.processedDocumentId || keptFileSources.has(`${card.id}:${fileId}`)) continue;
      keptFileSources.add(`${card.id}:${fileId}`);
      void intake.fileLanded(card, job.processedDocumentId);
    }
  });
  useEffect(() => {
    if (landedKey) keepLandedFiles();
  }, [landedKey]);
}
