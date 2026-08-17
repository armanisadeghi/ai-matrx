import type { Database } from "@/types/database.types";
import { createClient } from "@/utils/supabase/client";
import { authenticatedWebDb } from "@/utils/supabase/webDb";

type PageEvidenceRow = Database["web"]["Tables"]["page_evidence"]["Row"];
type PageRow = Database["web"]["Tables"]["page"]["Row"];

export type UrlChangeEvidenceRow = Pick<
  PageEvidenceRow,
  "page_id" | "source_type" | "last_checked_at" | "evidence"
> & {
  page: Pick<PageRow, "url"> | null;
};

export async function listUrlChangeEvidence(
  siteId: string,
): Promise<UrlChangeEvidenceRow[]> {
  const db = await authenticatedWebDb(createClient());
  const response = await db
    .from("page_evidence")
    .select(
      "page_id, source_type, last_checked_at, evidence, page:page!page_evidence_page_id_fkey(url)",
    )
    .eq("site_id", siteId)
    .in("source_type", ["indexnow", "google_url_inspection"])
    .is("deleted_at", null)
    .order("last_checked_at", { ascending: false, nullsFirst: false })
    .limit(12);
  if (response.error) throw new Error(response.error.message);
  return response.data ?? [];
}
