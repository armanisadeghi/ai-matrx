"use client";

import { getFileMetadata } from "@/features/files/api/files";
import { getResourceAccess } from "@/utils/permissions/access";
import { canEditAccess } from "@/utils/permissions/access-core";
import { collectionWriteHandlers, readCollectionList } from "@/features/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";
import { studyMediaService } from "../service";
import type { StudyMediaRow } from "../types";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Send an audio study object.");
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} needs text.`);
  return value.trim();
}
export function parseAudioCreate(value: unknown) {
  const input = object(value);
  return { title: text(input.title, "title"), fileId: text(input.audio_file_id, "audio_file_id"), description: typeof input.description === "string" ? input.description : "" };
}
export function parseAudioUpdate(value: unknown, rows: readonly StudyMediaRow[]) {
  const input = object(value);
  const id = text(input.id, "id");
  const row = rows.find((item) => item.id === id);
  if (!row || input.expected_version !== row.version) throw new Error("Read the current audio study and its version before updating it.");
  const unknown = Object.keys(input).filter((key) => !["id", "expected_version", "title", "description", "audio_file_id"].includes(key));
  if (unknown.length) throw new Error(`Unsupported audio fields: ${unknown.join(", ")}.`);
  if (input.description !== undefined && typeof input.description !== "string") throw new Error("description must be text.");
  if (input.title === undefined && input.description === undefined && input.audio_file_id === undefined) throw new Error("Supply a field to change.");
  return { row, title: input.title === undefined ? row.title : text(input.title, "title"), description: input.description === undefined ? row.description : input.description,
    fileId: input.audio_file_id === undefined ? undefined : text(input.audio_file_id, "audio_file_id") };
}
async function checkAudioFile(id: string) {
  const { data } = await getFileMetadata(id);
  if (!data.mime_type?.startsWith("audio/")) throw new Error("Choose an audio file from Files.");
  return data;
}
export async function createAudioStudy(input: ReturnType<typeof parseAudioCreate>) {
  await checkAudioFile(input.fileId);
  const result = await studyMediaService.create({ mediaKind: "audio", title: input.title, description: input.description,
    audioFileId: input.fileId, status: "ready" });
  if (result.error || !result.data) throw new Error(result.error ?? "Could not create audio study.");
  return result.data;
}
export async function updateAudioStudy(plan: ReturnType<typeof parseAudioUpdate>) {
  const access = await getResourceAccess("study_media", plan.row.id);
  if (!canEditAccess(access.level)) throw new Error("You need edit access to this audio study.");
  if (plan.fileId) await checkAudioFile(plan.fileId);
  const result = await studyMediaService.updateVersioned(plan.row.id, plan.row.version, {
    title: plan.title, description: plan.description,
    ...(plan.fileId ? { audio_file_id: plan.fileId, episode_id: null, status: "ready", trust: null, source_kind: null, source_id: null, source_title: null, config: {}, run_id: null, audio_format: null, duration_seconds: null } : {}),
  });
  if (result.error || !result.data) throw new Error(result.error ?? "Could not save audio study.");
  return result.data;
}
export function audioWriteHandlers(rows: readonly StudyMediaRow[], onSaved: (row: StudyMediaRow) => void, onDeleted: () => void, assertReady?: () => void) {
  return collectionWriteHandlers({ plural: "audio_studies", singular: "audio study",
    create: { parse: (value) => readCollectionList("create_audio_studies", "audio_studies", value).map(parseAudioCreate),
      run: async (plan) => { const row = await createAudioStudy(plan); onSaved(row); return { id: row.id, name: row.title }; }, nameOf: (plan) => plan.title },
    update: { parse: (value) => { assertReady?.(); return readCollectionList("update_audio_studies", "audio_studies", value).map((item) => parseAudioUpdate(item, rows)); },
      run: async (plan) => { const row = await updateAudioStudy(plan); onSaved(row); return { id: row.id, name: row.title }; }, nameOf: (plan) => plan.title },
    delete: { parse: (value) => { assertReady?.(); return readCollectionList("delete_audio_studies", "audio_studies", value).map((item) => {
      const id = typeof item === "string" ? item : object(item).id;
      const row = rows.find((entry) => entry.id === id);
      if (!row) throw new Error("Choose an audio study from the current library.");
      return row;
    }); }, run: async (row) => {
      const access = await getResourceAccess("study_media", row.id);
      if (!access.isOwner) throw new Error("Only the owner can delete this audio study.");
      const result = await studyMediaService.softDelete(row.id);
      if (result.error) throw new Error(result.error);
      onDeleted(); return { id: row.id, name: row.title };
    }, nameOf: (row) => row.title },
  }, refuseSurfaceWrite);
}
