import { Suspense } from "react";
import PdfStudioRouteClient from "./PdfStudioRouteClient";

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

export default function PdfExtractorStudioPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden bg-background">
      <Suspense fallback={null}>
        <PdfStudioRouteClient />
      </Suspense>
    </div>
  );
}
