// features/education/media/service.ts
//
// Canonical service for GENERATED STUDY MEDIA — the `education.study_media`
// artifact registry backing the Audio Study + Mind Maps tools. Reads/writes go
// direct through supabase-js (RLS-gated). Never throws — every method returns
// `MediaResult<T>`. Org/actor/version are filled by the table's canonical
// triggers, so writes pass only business columns.

"use client";

import { supabase } from "@/utils/supabase/client";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import type {
  MediaResult,
  StudyMediaRow,
  StudyMediaInsert,
  StudyMediaPatch,
  NewStudyMediaInput,
  EduMediaKind,
} from "./types";

const EDU = () => supabase.schema("education");

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const e = error as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };
    return (
      [e.message, e.details, e.hint && `hint: ${e.hint}`, e.code && `(${e.code})`]
        .filter(Boolean)
        .join(" — ") || "Unknown error"
    );
  }
  return "Unknown error";
}

function fail<T>(context: string, error: unknown): MediaResult<T> {
  console.error(`[studyMediaService] ${context}:`, describeError(error));
  return { data: null, error: `${context}: ${describeError(error)}` };
}

function toInsert(input: NewStudyMediaInput, orgId: string): StudyMediaInsert {
  return {
    media_kind: input.mediaKind,
    title: input.title,
    description: input.description ?? null,
    status: input.status ?? "draft",
    source_kind: input.source?.kind ?? null,
    source_id: input.source?.id ?? null,
    source_title: input.source?.title ?? null,
    config: (input.config ?? {}) as StudyMediaInsert["config"],
    trust: (input.trust ?? null) as StudyMediaInsert["trust"],
    run_id: input.runId ?? null,
    episode_id: input.episodeId ?? null,
    audio_file_id: input.audioFileId ?? null,
    audio_format: input.audioFormat ?? null,
    duration_seconds: input.durationSeconds ?? null,
    ir_envelope: (input.irEnvelope ?? null) as StudyMediaInsert["ir_envelope"],
    diagram_kind: input.diagramKind ?? null,
    // organization_id is resolved by the caller (create) via ensureOrgId — the
    // `_stamp_org_default` trigger only fills a NULL org, so a real value must be
    // on the wire (a non-null sentinel would violate the org FK).
    organization_id: orgId,
  };
}

export const studyMediaService = {
  async create(
    input: NewStudyMediaInput,
  ): Promise<MediaResult<StudyMediaRow>> {
    try {
      const orgId = await ensureOrgId(undefined);
      const row = toInsert(input, orgId);
      if (input.visibility) row.visibility = input.visibility;
      const { data, error } = await EDU()
        .from("study_media")
        .insert(row)
        .select()
        .single();
      if (error) return fail("create", error);
      return { data: data as StudyMediaRow, error: null };
    } catch (e) {
      return fail("create", e);
    }
  },

  async update(
    id: string,
    patch: StudyMediaPatch,
  ): Promise<MediaResult<StudyMediaRow>> {
    try {
      const { data, error } = await EDU()
        .from("study_media")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) return fail("update", error);
      return { data: data as StudyMediaRow, error: null };
    } catch (e) {
      return fail("update", e);
    }
  },

  async getById(id: string): Promise<MediaResult<StudyMediaRow>> {
    try {
      const { data, error } = await EDU()
        .from("study_media")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) return fail("getById", error);
      if (!data) return { data: null, error: "Not found" };
      return { data: data as StudyMediaRow, error: null };
    } catch (e) {
      return fail("getById", e);
    }
  },

  /** List the caller's accessible artifacts of one kind, newest first (RLS-scoped). */
  async listByKind(
    kind: EduMediaKind,
  ): Promise<MediaResult<StudyMediaRow[]>> {
    try {
      const { data, error } = await EDU()
        .from("study_media")
        .select("*")
        .eq("media_kind", kind)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) return fail("listByKind", error);
      return { data: (data ?? []) as StudyMediaRow[], error: null };
    } catch (e) {
      return fail("listByKind", e);
    }
  },

  async softDelete(id: string): Promise<MediaResult<null>> {
    try {
      const { error } = await EDU()
        .from("study_media")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) return fail("softDelete", error);
      return { data: null, error: null };
    } catch (e) {
      return fail("softDelete", e);
    }
  },

  async updateVisibility(
    id: string,
    visibility: StudyMediaRow["visibility"],
  ): Promise<MediaResult<StudyMediaRow>> {
    return this.update(id, { visibility });
  },
};
