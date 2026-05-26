/**
 * app/(a)/files/f/[fileId]/studio/page.tsx
 *
 * Full-screen Analysis Studio for a single file. Server-side verifies the
 * file exists + is visible to the user, then renders the studio shell
 * which owns all the client-side state (annotations, mode, page, etc.).
 */

import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { StudioShell } from "@/features/file-analysis/studio/StudioShell";

interface PageProps {
  params: Promise<{ fileId: string }>;
}

export default async function AnalysisStudioPage({ params }: PageProps) {
  const { fileId } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cld_files")
    .select("id, mime_type")
    .eq("id", fileId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  return <StudioShell fileId={data.id} />;
}
