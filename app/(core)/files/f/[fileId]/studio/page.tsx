/**
 * app/(a)/files/f/[fileId]/studio/page.tsx
 *
 * Full-screen Analysis Studio for a single file. Server-side verifies the
 * file exists + is visible to the user, then renders the studio shell
 * which owns all the client-side state (annotations, mode, page, etc.).
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
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

  // P1-12: the Analysis Studio is page/annotation/redaction-based — it only
  // makes sense for PDFs. Rendering it for an image / doc / unknown type
  // produced a broken empty three-pane shell. Gate at the route and show a
  // clear message instead.
  if (data.mime_type !== "application/pdf") {
    return (
      <div className="flex h-dvh w-full flex-col items-center justify-center gap-3 bg-textured px-6 text-center">
        <FileText className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-base font-semibold text-foreground">
          Analysis Studio is for PDF documents
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          This file isn&apos;t a PDF, so the page-by-page analysis, annotation,
          and redaction tools don&apos;t apply. Open it in the file viewer to
          preview, edit, or process it.
        </p>
        <Link
          href={`/files/f/${data.id}`}
          className="mt-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Open in file viewer
        </Link>
      </div>
    );
  }

  return <StudioShell fileId={data.id} />;
}
