/**
 * /rag/data-stores — per-user data store management.
 *
 * Counterpart to the admin surface in dashboard/. Both surfaces talk to
 * the same rag.data_stores + rag.data_store_members tables; RLS scopes
 * what each user sees. Guests get the marketing landing — the workspace
 * has no meaningful guest experience.
 */

import { DataStoresPage } from "@/features/rag/components/data-stores/DataStoresPage";
import KnowledgeLanding from "@/features/auth/components/module-landing/landings/KnowledgeLanding";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export default async function Page() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) return <KnowledgeLanding />;
  return <DataStoresPage />;
}
