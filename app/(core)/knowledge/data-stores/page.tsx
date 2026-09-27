/**
 * /knowledge/data-stores — a data store's RECORD page (members, publish,
 * access, edit, delete), opened as `?store_id=<id>`, and its create form as
 * `?new=1`. The list of stores is the Knowledge hub's Data stores group now
 * (KNOWLEDGE-HUB §6, H6b; HUB-PARITY-CHECKLISTS "Data Stores — retired"), so
 * the bare address lands there with its words kept.
 *
 * Counterpart to the admin surface in dashboard/. Both surfaces talk to the
 * same rag.data_stores + rag.data_store_members tables; RLS scopes what each
 * user sees. Guests get the marketing landing.
 */

import { redirect } from "next/navigation";
import { DataStoresPage } from "@/features/rag/components/data-stores/DataStoresPage";
import KnowledgeLanding from "@/features/auth/components/module-landing/landings/KnowledgeLanding";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { dataStoresToHubHref } from "@/features/knowledge/hub/legacyRoutes";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Page({ searchParams }: PageProps) {
  const toHub = dataStoresToHubHref(await searchParams);
  if (toHub) redirect(toHub);
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) return <KnowledgeLanding />;
  return <DataStoresPage />;
}
