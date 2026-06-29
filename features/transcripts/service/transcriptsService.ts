// features/transcripts/service/transcriptsService.ts

import { supabase } from "@/utils/supabase/client";
import { buildSearchOr } from "@/utils/supabase-search";
import { requireUserId } from "@/utils/auth/getUserId";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import type { Database, Json } from "@/types/database.types";
import type {
  Transcript,
  CreateTranscriptInput,
  UpdateTranscriptInput,
  TranscriptSegment,
} from "../types";

type TranscriptRow = Database["transcripts"]["Tables"]["transcripts"]["Row"];

function isTranscriptSegmentArray(
  value: unknown,
): value is TranscriptSegment[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (s) =>
      s !== null &&
      typeof s === "object" &&
      "id" in s &&
      typeof (s as TranscriptSegment).id === "string" &&
      "text" in s &&
      typeof (s as TranscriptSegment).text === "string",
  );
}

function mapTranscriptMetadata(meta: Json | null): Transcript["metadata"] {
  if (meta !== null && typeof meta === "object" && !Array.isArray(meta)) {
    return meta as Transcript["metadata"];
  }
  return {
    duration: 0,
    wordCount: 0,
    segmentCount: 0,
    speakers: [],
  };
}

export function mapTranscriptRow(row: TranscriptRow): Transcript {
  const segments = isTranscriptSegmentArray(row.segments) ? row.segments : [];
  const tags = row.tags ?? [];
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    description: row.description ?? "",
    segments,
    metadata: mapTranscriptMetadata(row.metadata),
    audio_file_path: row.audio_file_path,
    video_file_path: row.video_file_path,
    source_type: (row.source_type ?? "other") as Transcript["source_type"],
    tags,
    folder_name: row.folder_name ?? "Transcripts",
    is_deleted: row.is_deleted ?? false,
    is_draft: row.is_draft ?? false,
    draft_saved_at: row.draft_saved_at ?? undefined,
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
  };
}

/**
 * Fetch all transcripts for the current user (excluding deleted)
 */
export async function fetchTranscripts(): Promise<Transcript[]> {
  const { data, error } = await supabase
    .schema("transcripts")
    .from("transcripts")
    .select("*")
    .eq("is_deleted", false)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Error fetching transcripts:", error);
    throw error;
  }

  return (data ?? []).map(mapTranscriptRow);
}

/**
 * Fetch paginated transcripts for the current user (excluding deleted)
 */
export async function fetchTranscriptsPaginated(
  limit: number = 20,
  offset: number = 0,
): Promise<Transcript[]> {
  const { data, error } = await supabase
    .schema("transcripts")
    .from("transcripts")
    .select("*")
    .eq("is_deleted", false)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Error fetching paginated transcripts:", error);
    throw error;
  }

  return (data ?? []).map(mapTranscriptRow);
}

/**
 * Fetch a single transcript by ID
 */
export async function fetchTranscriptById(
  id: string,
): Promise<Transcript | null> {
  const { data, error } = await supabase
    .schema("transcripts")
    .from("transcripts")
    .select("*")
    .eq("id", id)
    .eq("is_deleted", false)
    .single();

  if (error) {
    console.error("Error fetching transcript:", error);
    return null;
  }

  return mapTranscriptRow(data);
}

/**
 * Generate metadata from segments
 */
function generateMetadata(segments: TranscriptSegment[]) {
  if (!segments || segments.length === 0) {
    return {
      duration: 0,
      wordCount: 0,
      segmentCount: 0,
      speakers: [],
    };
  }

  const lastSegment = segments[segments.length - 1];
  const duration = lastSegment?.seconds || 0;

  let wordCount = 0;
  const speakersSet = new Set<string>();

  segments.forEach((segment) => {
    const words = segment.text
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0);
    wordCount += words.length;
    if (segment.speaker) {
      speakersSet.add(segment.speaker);
    }
  });

  return {
    duration,
    wordCount,
    segmentCount: segments.length,
    speakers: Array.from(speakersSet),
  };
}

/**
 * Create a new transcript
 */
export async function createTranscript(
  input: CreateTranscriptInput,
): Promise<Transcript> {
  const userId = requireUserId();

  // Generate metadata from segments
  const autoMetadata = generateMetadata(input.segments);
  const metadata = {
    ...autoMetadata,
    ...input.metadata,
  };

  const { data, error } = await supabase
    .schema("transcripts")
    .from("transcripts")
    .insert({
      user_id: userId,
      title: input.title || "New Transcript",
      description: input.description || "",
      segments: input.segments,
      metadata,
      audio_file_path: input.audio_file_path || null,
      video_file_path: input.video_file_path || null,
      source_type: input.source_type || "other",
      tags: input.tags || [],
      folder_name: input.folder_name || "Transcripts",
      // Root entity (no org-inherit trigger) — org is NOT NULL; resolve it.
      organization_id: await ensureOrgId(undefined),
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating transcript:", error);
    throw error;
  }

  return mapTranscriptRow(data);
}

/**
 * Update an existing transcript
 */
export async function updateTranscript(
  id: string,
  updates: UpdateTranscriptInput,
): Promise<Transcript> {
  // If segments are being updated, regenerate metadata
  let finalUpdates = { ...updates };

  if (updates.segments) {
    const autoMetadata = generateMetadata(updates.segments);
    finalUpdates.metadata = {
      ...autoMetadata,
      ...updates.metadata,
    };
  }

  const { data, error } = await supabase
    .schema("transcripts")
    .from("transcripts")
    .update(finalUpdates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error updating transcript:", error);
    throw error;
  }

  return mapTranscriptRow(data);
}

/**
 * Delete a transcript and its associated audio file from storage
 */
export async function deleteTranscript(id: string): Promise<void> {
  // First, fetch the transcript to get the audio file path
  const { data: transcript, error: fetchError } = await supabase
    .schema("transcripts")
    .from("transcripts")
    .select("audio_file_path, video_file_path")
    .eq("id", id)
    .single();

  if (fetchError) {
    console.error("Error fetching transcript for deletion:", fetchError);
    throw fetchError;
  }

  // Delete the audio/video files via the universal handler.
  // `audio_file_path` / `video_file_path` now hold cld_files UUIDs.
  const { deleteAudioFromStorage } = await import("./audioStorageService");
  if (transcript?.audio_file_path) {
    await deleteAudioFromStorage(transcript.audio_file_path);
  }
  if (transcript?.video_file_path) {
    await deleteAudioFromStorage(transcript.video_file_path);
  }

  // Soft delete the transcript record
  const { error } = await supabase
    .schema("transcripts")
    .from("transcripts")
    .update({ is_deleted: true })
    .eq("id", id);

  if (error) {
    console.error("Error deleting transcript:", error);
    throw error;
  }
}

/**
 * Permanently delete a transcript
 */
export async function permanentlyDeleteTranscript(id: string): Promise<void> {
  const { error } = await supabase.schema("transcripts").from("transcripts").delete().eq("id", id);

  if (error) {
    console.error("Error permanently deleting transcript:", error);
    throw error;
  }
}

/**
 * Save transcript as draft (immediately after transcription)
 */
export async function saveDraftTranscript(
  input: CreateTranscriptInput,
): Promise<Transcript> {
  const userId = requireUserId();

  // Generate metadata from segments
  const autoMetadata = generateMetadata(input.segments);
  const metadata = {
    ...autoMetadata,
    ...input.metadata,
  };

  const { data, error } = await supabase
    .schema("transcripts")
    .from("transcripts")
    .insert({
      user_id: userId,
      title: input.title || "New Recording",
      description: input.description || "",
      segments: input.segments,
      metadata,
      audio_file_path: input.audio_file_path || null,
      video_file_path: input.video_file_path || null,
      source_type: input.source_type || "audio",
      tags: input.tags || [],
      folder_name: input.folder_name || "Recordings",
      organization_id: await ensureOrgId(undefined),
      is_draft: true,
      draft_saved_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("Error saving draft transcript:", error);
    throw error;
  }

  const transcript = mapTranscriptRow(data);
  const labelSourceText = input.segments
    .map((s) => s.text?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  void import("./autoLabelTranscript")
    .then(({ autoLabelDraftTranscript }) =>
      autoLabelDraftTranscript(transcript.id, labelSourceText),
    )
    .catch((err) => {
      console.warn("[transcripts] draft auto-label failed:", err);
    });

  return transcript;
}

/**
 * Update draft to final (finalize a draft)
 */
export async function finalizeDraft(
  id: string,
  updates: UpdateTranscriptInput,
): Promise<Transcript> {
  const finalUpdates = {
    ...updates,
    is_draft: false,
    draft_saved_at: null,
  };

  // If segments are being updated, regenerate metadata
  if (updates.segments) {
    const autoMetadata = generateMetadata(updates.segments);
    finalUpdates.metadata = {
      ...autoMetadata,
      ...updates.metadata,
    };
  }

  const { data, error } = await supabase
    .schema("transcripts")
    .from("transcripts")
    .update(finalUpdates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error finalizing draft:", error);
    throw error;
  }

  return mapTranscriptRow(data);
}

/**
 * Get all draft transcripts for current user
 */
export async function getDraftTranscripts(
  limit: number = 20,
  offset: number = 0,
): Promise<Transcript[]> {
  const { data, error } = await supabase
    .schema("transcripts")
    .from("transcripts")
    .select("*")
    .eq("is_deleted", false)
    .eq("is_draft", true)
    .order("draft_saved_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Error fetching draft transcripts:", error);
    throw error;
  }

  return (data ?? []).map(mapTranscriptRow);
}

/**
 * Copy/duplicate a transcript
 */
export async function copyTranscript(id: string): Promise<Transcript> {
  const { data: original, error: fetchError } = await supabase
    .schema("transcripts")
    .from("transcripts")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !original) {
    throw new Error("Original transcript not found");
  }

  const userId = requireUserId();

  const { data, error } = await supabase
    .schema("transcripts")
    .from("transcripts")
    .insert({
      user_id: userId,
      title: `${original.title} (Copy)`,
      description: original.description,
      segments: original.segments,
      metadata: original.metadata,
      audio_file_path: original.audio_file_path,
      video_file_path: original.video_file_path,
      source_type: original.source_type,
      tags: original.tags,
      folder_name: original.folder_name,
      // Keep the copy in the original's org; fall back to the personal org.
      organization_id: await ensureOrgId(original.organization_id),
    })
    .select()
    .single();

  if (error) {
    console.error("Error copying transcript:", error);
    throw error;
  }

  return mapTranscriptRow(data);
}

/**
 * Search transcripts by text (searches title and description)
 */
export async function searchTranscripts(query: string): Promise<Transcript[]> {
  const { data, error } = await supabase
    .schema("transcripts")
    .from("transcripts")
    .select("*")
    .eq("is_deleted", false)
    .or(buildSearchOr(query, ["title", "description"]))
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Error searching transcripts:", error);
    throw error;
  }

  return (data ?? []).map(mapTranscriptRow);
}

/**
 * Get transcripts by folder
 */
export async function getTranscriptsByFolder(
  folderName: string,
): Promise<Transcript[]> {
  const { data, error } = await supabase
    .schema("transcripts")
    .from("transcripts")
    .select("*")
    .eq("is_deleted", false)
    .eq("folder_name", folderName)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Error fetching transcripts by folder:", error);
    throw error;
  }

  return (data ?? []).map(mapTranscriptRow);
}

/**
 * Get transcripts by tag
 */
export async function getTranscriptsByTag(tag: string): Promise<Transcript[]> {
  const { data, error } = await supabase
    .schema("transcripts")
    .from("transcripts")
    .select("*")
    .eq("is_deleted", false)
    .contains("tags", [tag])
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Error fetching transcripts by tag:", error);
    throw error;
  }

  return (data ?? []).map(mapTranscriptRow);
}

/**
 * Get a signed URL for an audio/video file. The argument is now a
 * cld_files UUID; the universal handler mints (and auto-refreshes) the URL.
 */
export async function getSignedUrl(fileId: string): Promise<string | null> {
  try {
    const { fileHandler } = await import("@/features/files/handler/handler");
    return await fileHandler.use({ kind: "file_id", fileId }).as({
      kind: "html_src",
    });
  } catch (error) {
    console.error("Error getting signed URL:", error);
    return null;
  }
}
