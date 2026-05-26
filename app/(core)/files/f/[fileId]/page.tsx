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

import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { SingleFileShell } from "@/features/files/components/surfaces/single-file/SingleFileShell";

interface PageProps {
  params: Promise<{ fileId: string }>;
}

export default async function CloudFileDetailPage({ params }: PageProps) {
  const { fileId } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cld_files")
    .select("id")
    .eq("id", fileId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  return <SingleFileShell fileId={data.id} />;
}
