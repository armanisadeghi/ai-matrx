/**
 * /rag/library-catalog — shared-knowledge library catalog (list → open → act).
 *
 * The discovery + opt-in destination for Shared Knowledge Resources: every
 * discoverable library with the caller's true entitlement chip, a detail
 * view with provenance and a read-only member table, and self-service
 * subscribe/unsubscribe. The `/rag` home keeps a teaser pane linking here.
 */

import { LibraryCatalogPage } from "@/features/rag/components/library-catalog/LibraryCatalogPage";
import KnowledgeLanding from "@/features/auth/components/module-landing/landings/KnowledgeLanding";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export default async function Page() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) return <KnowledgeLanding />;
  return <LibraryCatalogPage />;
}
