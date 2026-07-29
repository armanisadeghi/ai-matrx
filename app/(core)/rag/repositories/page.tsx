/**
 * /rag/repositories — code repositories you can index for RAG.
 */

import { RepositoriesPage } from "@/features/rag/components/RepositoriesPage";
import KnowledgeLanding from "@/features/auth/components/module-landing/landings/KnowledgeLanding";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export default async function Page() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) return <KnowledgeLanding />;
  return <RepositoriesPage />;
}
