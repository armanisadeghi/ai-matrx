// app/(core)/transcripts/page.tsx
//
// Transcripts LIST page — the "savior" entry that replaces the
// forced-into-the-processor trap. Mirrors the `/agents` shape:
// land on a list of everything you have access to, choose a row,
// then pick the UI you want to open it in (processor / studio /
// cleanup). The processor itself is now a sub-route at
// `/transcripts/processor` reached from row actions.
//
// Guests: see `TranscriptsLanding` (server-side branch).
// Authed: server-fetches the user's transcripts, hands a thin
// summary to the client list island for search / sort / paginate.

import { createClient } from "@/utils/supabase/server";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { TranscriptsListPage } from "@/features/transcripts/components/TranscriptsListPage";
import TranscriptsLanding from "@/features/auth/components/module-landing/landings/TranscriptsLanding";
import type { TranscriptListRow } from "@/features/transcripts/components/TranscriptsListPage";
// Server-side fetch — narrow projection. The client island only needs
// what it renders, not the heavy `segments` JSONB blob.
async function loadTranscriptSummaries(): Promise<TranscriptListRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transcripts")
    .select(
      "id, title, description, source_type, folder_name, tags, metadata, created_at, updated_at, is_draft",
    )
    .eq("is_deleted", false)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("[transcripts:list] fetch failed:", error);
    return [];
  }
  return (data ?? []).map((row) => {
    const meta =
      row.metadata &&
      typeof row.metadata === "object" &&
      !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const duration = typeof meta.duration === "number" ? meta.duration : null;
    const wordCount =
      typeof meta.wordCount === "number" ? meta.wordCount : null;
    const segmentCount =
      typeof meta.segmentCount === "number" ? meta.segmentCount : null;
    return {
      id: row.id,
      title: row.title ?? "Untitled transcript",
      description: row.description ?? "",
      sourceType: row.source_type ?? "other",
      folderName: row.folder_name ?? "Transcripts",
      tags: row.tags ?? [],
      durationSeconds: duration,
      wordCount,
      segmentCount,
      createdAt: row.created_at ?? "",
      updatedAt: row.updated_at ?? "",
      isDraft: row.is_draft ?? false,
    };
  });
}

export default async function TranscriptsIndexPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) return <TranscriptsLanding />;

  const rows = await loadTranscriptSummaries();
  return <TranscriptsListPage rows={rows} />;
}
