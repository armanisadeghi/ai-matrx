// features/education/family/familyService.ts
//
// The client service for the Parent / Guardian dashboard. Every method is a thin,
// typed wrapper over a `guardian_*` SECURITY DEFINER RPC (public schema; see
// migrations/edu_guardian_link.sql). Reads go DIRECT via supabase-js — the RPCs
// re-check the active guardian link server-side (RLS on the study spine never
// grants cross-user reads), so this is the ONLY guardian read path.
//
// Never throws — every method returns `StudyResult<T>` (the shared spine shape),
// so callsites branch on `{ data, error }` exactly like studyService.

"use client";

import { supabase } from "@/utils/supabase/client";
import { fail } from "@/features/education/study/service/serviceError";
import type {
  StudyResult,
  ItemMasteryRow,
  StudyAttemptRow,
  StudySessionRow,
  StudyStreakRow,
} from "@/features/education/study/types";
import type { AssessmentResultRow } from "@/features/education/assessment/data/types";
import type {
  GuardianConsentResult,
  GuardianLinkRow,
  GuardianLinkView,
} from "./types";

export const familyService = {
  // ─── Consent lifecycle ───────────────────────────────────────────────────
  /**
   * STUDENT grants a guardian read access immediately (caller = the student).
   * D52: returns a neutral `{status:'granted'}` whether or not the guardian
   * email resolves to an account — never confirming existence.
   */
  async grantGuardian(
    guardianEmail: string,
    relationship?: string,
  ): Promise<StudyResult<GuardianConsentResult>> {
    try {
      const { data, error } = await supabase.rpc("guardian_grant", {
        p_guardian_email: guardianEmail,
        ...(relationship ? { p_relationship: relationship } : {}),
      });
      if (error) return fail("grantGuardian", error);
      return { data: data as GuardianConsentResult, error: null };
    } catch (e) {
      return fail("grantGuardian", e);
    }
  },

  /**
   * GUARDIAN requests access to a student — pending until the student approves.
   * D52: returns a neutral `{status:'sent'}` whether or not the student email
   * resolves to an account — never confirming existence.
   */
  async requestStudent(
    studentEmail: string,
    relationship?: string,
  ): Promise<StudyResult<GuardianConsentResult>> {
    try {
      const { data, error } = await supabase.rpc("guardian_request_student", {
        p_student_email: studentEmail,
        ...(relationship ? { p_relationship: relationship } : {}),
      });
      if (error) return fail("requestStudent", error);
      return { data: data as GuardianConsentResult, error: null };
    } catch (e) {
      return fail("requestStudent", e);
    }
  },

  /** STUDENT approves or declines a guardian's pending request. */
  async respond(
    guardianUserId: string,
    approve: boolean,
  ): Promise<StudyResult<GuardianLinkRow>> {
    try {
      const { data, error } = await supabase.rpc("guardian_respond", {
        p_guardian_user_id: guardianUserId,
        p_approve: approve,
      });
      if (error) return fail("respond", error);
      return { data: data as GuardianLinkRow, error: null };
    } catch (e) {
      return fail("respond", e);
    }
  },

  /** Either party removes a link (caller must be a party to it). */
  async unlink(
    guardianUserId: string,
    studentUserId: string,
  ): Promise<StudyResult<true>> {
    try {
      const { error } = await supabase.rpc("guardian_unlink", {
        p_guardian_user_id: guardianUserId,
        p_student_user_id: studentUserId,
      });
      if (error) return fail("unlink", error);
      return { data: true, error: null };
    } catch (e) {
      return fail("unlink", e);
    }
  },

  /** Every link the caller participates in (both roles), with counterpart identity. */
  async listLinks(): Promise<StudyResult<GuardianLinkView[]>> {
    try {
      const { data, error } = await supabase.rpc("guardian_list_links");
      if (error) return fail("listLinks", error);
      return { data: (data ?? []) as GuardianLinkView[], error: null };
    } catch (e) {
      return fail("listLinks", e);
    }
  },

  /** Whether the caller currently has active guardian access to this student. */
  async canView(studentId: string): Promise<StudyResult<boolean>> {
    try {
      const { data, error } = await supabase.rpc("guardian_can_view", {
        p_student_id: studentId,
      });
      if (error) return fail("canView", error);
      return { data: Boolean(data), error: null };
    } catch (e) {
      return fail("canView", e);
    }
  },

  // ─── Gated study-spine reads (guardian → linked student) ──────────────────
  async studentMastery(
    studentId: string,
  ): Promise<StudyResult<ItemMasteryRow[]>> {
    try {
      const { data, error } = await supabase.rpc("guardian_student_mastery", {
        p_student_id: studentId,
      });
      if (error) return fail("studentMastery", error);
      return { data: (data ?? []) as ItemMasteryRow[], error: null };
    } catch (e) {
      return fail("studentMastery", e);
    }
  },

  async studentAttempts(
    studentId: string,
    since?: string,
  ): Promise<StudyResult<StudyAttemptRow[]>> {
    try {
      const { data, error } = await supabase.rpc("guardian_student_attempts", {
        p_student_id: studentId,
        ...(since ? { p_since: since } : {}),
      });
      if (error) return fail("studentAttempts", error);
      return { data: (data ?? []) as StudyAttemptRow[], error: null };
    } catch (e) {
      return fail("studentAttempts", e);
    }
  },

  async studentSessions(
    studentId: string,
  ): Promise<StudyResult<StudySessionRow[]>> {
    try {
      const { data, error } = await supabase.rpc("guardian_student_sessions", {
        p_student_id: studentId,
      });
      if (error) return fail("studentSessions", error);
      return { data: (data ?? []) as StudySessionRow[], error: null };
    } catch (e) {
      return fail("studentSessions", e);
    }
  },

  async studentStreak(
    studentId: string,
  ): Promise<StudyResult<StudyStreakRow | null>> {
    try {
      const { data, error } = await supabase.rpc("guardian_student_streak", {
        p_student_id: studentId,
      });
      if (error) return fail("studentStreak", error);
      const rows = (data ?? []) as StudyStreakRow[];
      return { data: rows[0] ?? null, error: null };
    } catch (e) {
      return fail("studentStreak", e);
    }
  },

  async studentGain(
    studentId: string,
  ): Promise<StudyResult<AssessmentResultRow[]>> {
    try {
      const { data, error } = await supabase.rpc("guardian_student_gain", {
        p_student_id: studentId,
      });
      if (error) return fail("studentGain", error);
      return { data: (data ?? []) as AssessmentResultRow[], error: null };
    } catch (e) {
      return fail("studentGain", e);
    }
  },

  async studentCardTopics(
    studentId: string,
    cardIds: string[],
  ): Promise<StudyResult<Record<string, string | null>>> {
    if (cardIds.length === 0) return { data: {}, error: null };
    try {
      const { data, error } = await supabase.rpc(
        "guardian_student_card_topics",
        { p_student_id: studentId, p_card_ids: cardIds },
      );
      if (error) return fail("studentCardTopics", error);
      const map: Record<string, string | null> = {};
      for (const row of (data ?? []) as {
        card_id: string;
        topic: string | null;
      }[]) {
        map[row.card_id] = row.topic;
      }
      return { data: map, error: null };
    } catch (e) {
      return fail("studentCardTopics", e);
    }
  },
};
