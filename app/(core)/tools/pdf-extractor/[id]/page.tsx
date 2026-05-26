import { Suspense } from "react";
import PdfStudioRouteClient from "../PdfStudioRouteClient";

/**
 * /tools/pdf-extractor/<processed_documents.id>
 *
 * Same studio surface, but with a specific document opened on mount.
 * The id is passed via Next 16's async `params`.
 */
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PdfExtractorStudioDocPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden bg-background">
      <Suspense fallback={null}>
        <PdfStudioRouteClient initialDocumentId={id} />
      </Suspense>
    </div>
  );
}
