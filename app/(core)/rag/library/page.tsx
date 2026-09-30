/**
 * /knowledge/library — the Sources page (SOURCE-CONVERGENCE §8.1).
 *
 * Every Source the person can read (a `docproc.processed_documents` row:
 * uploaded files, captured web pages, transcripts, pasted text), read directly
 * from Supabase under RLS with a declared scope. `/rag/library` re-exports
 * this page from `app/(core)/knowledge/library/page.tsx`.
 */

import { SourcesPage } from "@/features/sources/components/SourcesPage";
import KnowledgeLanding from "@/features/auth/components/module-landing/landings/KnowledgeLanding";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";

export default async function Page() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) return <KnowledgeLanding />;
  return <SourcesPage />;
}
