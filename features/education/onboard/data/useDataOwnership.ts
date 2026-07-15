// features/education/onboard/data/useDataOwnership.ts
//
// The "your data" engine (P9 back door — anti-lock-in). Lists the learner's
// decks and exports them — one deck in any format, or EVERYTHING as a single
// zip archive. Reads through fcService (RLS-scoped); no new data path.

"use client";

import { useCallback, useEffect, useState } from "react";
import { fcService } from "@/features/flashcards/data/fcService";
import type { FcSetRow } from "@/features/flashcards/data/types";
import {
  buildDeckExport,
  EXPORT_EXT,
  EXPORT_MIME,
  type DeckExportFormat,
} from "../export/deckFormats";
import { downloadTextFile, downloadBlob, safeFileBase } from "../export/download";
import {
  dataRightsService,
  type StudyDeleteResult,
  type StudyRestoreResult,
} from "./dataRightsService";

export interface UseDataOwnership {
  decks: FcSetRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Load a deck's cards and download it in the chosen format. */
  exportDeck: (setId: string, format: DeckExportFormat) => Promise<void>;
  /** Download EVERY deck as a single .zip of JSON files (full account export). */
  exportAll: () => Promise<void>;
  exportingAll: boolean;
  /**
   * FERPA/COPPA data right: download the FULL study spine (sessions, attempts,
   * mastery, plans, media, assessments, decks, learn docs, quizzes) as one JSON
   * archive. Broader than exportAll (which is decks only).
   */
  exportStudyData: () => Promise<void>;
  exportingStudy: boolean;
  /** FERPA/COPPA data right: soft-delete all study data (reversible 30 days). */
  deleteStudyData: () => Promise<StudyDeleteResult>;
  /** Undo the most recent delete, if still inside the restore window. */
  restoreStudyData: () => Promise<StudyRestoreResult>;
  deletingStudy: boolean;
}

export function useDataOwnership(): UseDataOwnership {
  const [decks, setDecks] = useState<FcSetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportingAll, setExportingAll] = useState(false);
  const [exportingStudy, setExportingStudy] = useState(false);
  const [deletingStudy, setDeletingStudy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null); // clear a stale error so a successful reload isn't masked
    const res = await fcService.listSets();
    if (res.error) setError(typeof res.error === "string" ? res.error : "Failed to load your decks");
    else setDecks(res.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const exportDeck = useCallback(
    async (setId: string, format: DeckExportFormat) => {
      const res = await fcService.getSetWithCards(setId);
      if (res.error || !res.data) {
        throw new Error(typeof res.error === "string" ? res.error : "Couldn't load that deck");
      }
      const { set, cards } = res.data;
      const content = buildDeckExport(set, cards, format, new Date().toISOString());
      downloadTextFile(
        `${safeFileBase(set.name)}.${EXPORT_EXT[format]}`,
        content,
        EXPORT_MIME[format],
      );
    },
    [],
  );

  const exportAll = useCallback(async () => {
    setExportingAll(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const stamp = new Date().toISOString();
      const folder = zip.folder("matrx-flashcards");
      const seen = new Map<string, number>();
      let written = 0;
      const failed: string[] = [];
      for (const set of decks) {
        const res = await fcService.getSetWithCards(set.id);
        if (res.error || !res.data) {
          failed.push(set.name);
          continue;
        }
        const json = buildDeckExport(res.data.set, res.data.cards, "json", stamp);
        let base = safeFileBase(set.name);
        const n = seen.get(base) ?? 0;
        seen.set(base, n + 1);
        if (n > 0) base = `${base}_${n}`;
        folder?.file(`${base}.json`, json);
        written++;
      }
      // Manifest reflects what was ACTUALLY written, not what was requested.
      const manifest = {
        __format: "matrx.education.export",
        version: 1,
        exported_at: stamp,
        deck_count: written,
        ...(failed.length ? { failed_decks: failed } : {}),
      };
      zip.file("manifest.json", JSON.stringify(manifest, null, 2));
      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob("matrx-education-data.zip", blob);
    } finally {
      setExportingAll(false);
    }
  }, [decks]);

  const exportStudyData = useCallback(async () => {
    setExportingStudy(true);
    try {
      const res = await dataRightsService.exportStudyData();
      if (res.error || !res.data) {
        throw new Error(
          typeof res.error === "string" ? res.error : "Couldn't build your study export",
        );
      }
      downloadTextFile(
        `matrx-study-data-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(res.data, null, 2),
        "application/json;charset=utf-8;",
      );
      void dataRightsService.logExport();
    } finally {
      setExportingStudy(false);
    }
  }, []);

  const deleteStudyData = useCallback(async () => {
    setDeletingStudy(true);
    try {
      const res = await dataRightsService.deleteStudyData();
      if (res.error || !res.data) {
        throw new Error(
          typeof res.error === "string" ? res.error : "Couldn't delete your study data",
        );
      }
      await refresh(); // decks list reflects the delete
      return res.data;
    } finally {
      setDeletingStudy(false);
    }
  }, [refresh]);

  const restoreStudyData = useCallback(async () => {
    const res = await dataRightsService.restoreStudyData();
    if (res.error || !res.data) {
      throw new Error(
        typeof res.error === "string" ? res.error : "Couldn't restore your study data",
      );
    }
    await refresh();
    return res.data;
  }, [refresh]);

  return {
    decks,
    loading,
    error,
    refresh,
    exportDeck,
    exportAll,
    exportingAll,
    exportStudyData,
    exportingStudy,
    deleteStudyData,
    restoreStudyData,
    deletingStudy,
  };
}
