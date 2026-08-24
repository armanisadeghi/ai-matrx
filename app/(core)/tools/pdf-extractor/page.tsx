import { Suspense } from "react";
import PdfStudioRouteClient from "./PdfStudioRouteClient";
import PdfExtractorLanding from "@/features/auth/components/module-landing/landings/PdfExtractorLanding";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

/**
 * /tools/pdf-extractor
 *
 * Server-component shell. The actual studio is a client component
 * (`PdfStudioRouteClient`) that picks desktop vs mobile and dynamically
 * imports the heavy reader. This shell exists only to give Next a
 * stable route boundary and a server-rendered frame so there's no CLS
 * while the dynamic import resolves.
 */
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ file?: string }>;
}

export default async function PdfExtractorStudioPage({
  searchParams,
}: PageProps) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) return <PdfExtractorLanding />;
  const { file } = await searchParams;
  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <Suspense fallback={null}>
        <PdfStudioRouteClient initialSourceFileId={file} />
      </Suspense>
    </div>
  );
}
