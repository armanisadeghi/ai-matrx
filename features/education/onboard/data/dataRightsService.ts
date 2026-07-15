// features/education/onboard/data/dataRightsService.ts
//
// FERPA/COPPA data-rights service — the account-scoped FULL study-spine export +
// the gated, auditable, reversible-window delete/restore. Thin, typed wrappers
// over the `edu_export_study_data` / `edu_delete_study_data` /
// `edu_restore_study_data` / `edu_log_data_export` SECURITY DEFINER RPCs (see
// migrations/edu_data_rights_export_delete.sql). Reads go DIRECT via supabase-js;
// the RPCs resolve identity from auth.uid(). Never throws — StudyResult<T>.
//
// This complements the per-deck exporter (deckFormats.ts): that covers ONE deck
// in Anki/CSV/Markdown; this covers the WHOLE spine (sessions, attempts, mastery,
// plans, media, assessments, decks, learn docs, quizzes) as the data-ownership
// archive a school review expects.

"use client";

import { supabase } from "@/utils/supabase/client";
import { fail } from "@/features/education/study/service/serviceError";
import type { StudyResult } from "@/features/education/study/types";

/** Per-table row counts returned by the delete/restore RPCs. */
export type SpineCounts = Record<string, number>;

export interface StudyDeleteResult {
  deleted_at: string;
  restore_until: string;
  counts: SpineCounts;
}

export interface StudyRestoreResult {
  restored_from: string;
  counts: SpineCounts;
}

/** The full-spine export archive (matrx.education.study_export). */
export interface StudyExportArchive {
  __format: "matrx.education.study_export";
  version: number;
  exported_at: string;
  user_id: string;
  spine: Record<string, unknown[]>;
}

export const dataRightsService = {
  /** Download-ready JSON archive of the caller's entire study spine. */
  async exportStudyData(): Promise<StudyResult<StudyExportArchive>> {
    try {
      const { data, error } = await supabase.rpc("edu_export_study_data");
      if (error) return fail("exportStudyData", error);
      return { data: data as unknown as StudyExportArchive, error: null };
    } catch (e) {
      return fail("exportStudyData", e);
    }
  },

  /** Record that an export was downloaded (auditability; fire-and-forget). */
  async logExport(): Promise<void> {
    try {
      await supabase.rpc("edu_log_data_export");
    } catch {
      /* audit-only; never block the user's completed download */
    }
  },

  /** Soft-delete the whole study spine (reversible for 30 days). */
  async deleteStudyData(): Promise<StudyResult<StudyDeleteResult>> {
    try {
      const { data, error } = await supabase.rpc("edu_delete_study_data");
      if (error) return fail("deleteStudyData", error);
      return { data: data as unknown as StudyDeleteResult, error: null };
    } catch (e) {
      return fail("deleteStudyData", e);
    }
  },

  /** Restore the most recent delete, if still inside the window. */
  async restoreStudyData(): Promise<StudyResult<StudyRestoreResult>> {
    try {
      const { data, error } = await supabase.rpc("edu_restore_study_data");
      if (error) return fail("restoreStudyData", error);
      return { data: data as unknown as StudyRestoreResult, error: null };
    } catch (e) {
      return fail("restoreStudyData", e);
    }
  },
};

/** Total rows across a spine-counts map (for user-facing "N items" copy). */
export function totalSpineCount(counts: SpineCounts): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}
