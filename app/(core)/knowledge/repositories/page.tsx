/**
 * /knowledge/repositories — code repositories you can index for Knowledge.
 */

import { RepositoriesPage } from "@/features/rag/components/RepositoriesPage";
import KnowledgeLanding from "@/features/auth/components/module-landing/landings/KnowledgeLanding";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";

export default async function Page() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) return <KnowledgeLanding />;
  return <RepositoriesPage />;
}
