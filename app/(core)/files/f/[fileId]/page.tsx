/**
 * app/(a)/files/f/[fileId]/page.tsx
 *
 * Dedicated single-file viewer at `/files/f/{fileId}`. Renders
 * `SingleFileShell` — a full-page surface where the file is the center of
 * focus. There's a left "Show files" sheet for jumping to other files
 * without leaving the page, but no sidebar / list chrome competes with the
 * file content.
 *
 * Distinct from `/files` and `/files/<path>` which render `PageShell` (the
 * Dropbox-style sidebar + table + preview-pane layout). Those routes are
 * for browsing; this route is for working on one file.
 *
 * Server-side: verify the file exists + is visible to the user. If not,
 * throw `notFound()` so the route's `not-found.tsx` boundary handles it.
 */

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { filesDb } from "@/features/files/filesDb";
import { SingleFileShell } from "@/features/files/components/surfaces/single-file/SingleFileShell";

interface PageProps {
  params: Promise<{ fileId: string }>;
}

export default async function CloudFileDetailPage({ params }: PageProps) {
  const { fileId } = await params;

  const supabase = await createClient();
  const { data, error } = await filesDb(supabase)
    .from("files")
    .select("id")
    .eq("id", fileId)
    .is("deleted_at", null)
    .maybeSingle();

  if (data) {
    return <SingleFileShell fileId={data.id} />;
  }

  // No direct file access — but this may be a processed library document the
  // user can read read-only via a Shared-Knowledge grant (org/industry/global),
  // which is exactly the content RAG search already surfaced to them. Rather
  // than dead-end at 404, resolve the readable processed doc and send them to
  // the canonical read-only viewer. The RPC (and the viewer's own endpoints)
  // enforce `can_read_library_document` server-side, so a non-entitled user
  // still gets nothing — this only rescues legitimately-entitled readers.
  if (!error) {
    const { data: docId } = await supabase.rpc(
      "readable_processed_doc_for_file",
      { p_file: fileId },
    );
    if (typeof docId === "string" && docId) {
      redirect(`/rag/viewer/${docId}`);
    }
  }

  notFound();
}
