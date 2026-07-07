import { redirect } from "next/navigation";

import { getServerAuth } from "@/utils/supabase/getServerAuth";

import ScannerRouteClient from "./ScannerRouteClient";

/**
 * /tools/scanner — phone-scanner on-ramp to the PDF extractor.
 *
 * Take/pick photos (plus existing PDFs), crop, reorder, label + assign
 * context, and save as ONE PDF that runs through the batch extractor
 * pipeline — landing on /tools/pdf-extractor/{doc_id}.
 */
export const dynamic = "force-dynamic";

export default async function PdfScannerPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/login?next=/tools/scanner");
  return (
    <div className="flex h-full flex-col overflow-hidden bg-background pt-[var(--shell-header-h)]">
      <div className="min-h-0 flex-1">
        <ScannerRouteClient />
      </div>
    </div>
  );
}
