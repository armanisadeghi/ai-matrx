/**
 * /rag/library — visibility surface for processed documents.
 *
 * Shows every processed_documents row owned by the caller, with derived
 * counts and a status badge. The "where did my content go?" page.
 */

import { LibraryPage } from "@/features/rag/components/library/LibraryPage";
import KnowledgeLanding from "@/features/auth/components/module-landing/landings/KnowledgeLanding";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export default async function Page() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) return <KnowledgeLanding />;
  return <LibraryPage />;
}
