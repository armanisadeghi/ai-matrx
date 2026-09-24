// app/(core)/exports/[libraryId]/page.tsx
//
// /exports/[libraryId] — one dropped export: the summary, the filterable list
// of everything in it, and the one action.

import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { ExportLibraryPage } from "@/features/exports/components/ExportLibraryPage";

export default async function ExportLibraryRoute({
  params,
}: {
  params: Promise<{ libraryId: string }>;
}) {
  const { libraryId } = await params;
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) {
    redirect(`/login?next=${encodeURIComponent(`/exports/${libraryId}`)}`);
  }
  return <ExportLibraryPage libraryId={libraryId} />;
}
