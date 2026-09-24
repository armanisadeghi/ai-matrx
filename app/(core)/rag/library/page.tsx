/**
 * /knowledge/library — visibility surface for processed documents.
 *
 * Shows every processed_documents row owned by the caller, with derived
 * counts and a status badge. The "where did my content go?" page.
 */

import { LibraryPage } from "@/features/rag/components/library/LibraryPage";
import KnowledgeLanding from "@/features/auth/components/module-landing/landings/KnowledgeLanding";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";

export default async function Page() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) return <KnowledgeLanding />;
  return <LibraryPage />;
}
