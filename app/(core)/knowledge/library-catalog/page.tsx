/**
 * /knowledge/library-catalog — one shared-knowledge resource's RECORD page
 * (`?id=<id>&type=<type>`): provenance, the read-only member table, and the
 * honest verb per type (subscribe / unsubscribe, add to my Rulebooks, use on
 * a site). Finding them is the Knowledge hub's Library catalog group now
 * (KNOWLEDGE-HUB §6, H6b; HUB-PARITY-CHECKLISTS "Library catalog — retired"),
 * so the bare address lands there with its filters kept.
 */

import { redirect } from "next/navigation";
import { LibraryCatalogPage } from "@/features/rag/components/library-catalog/LibraryCatalogPage";
import KnowledgeLanding from "@/features/auth/components/module-landing/landings/KnowledgeLanding";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { libraryCatalogToHubHref } from "@/features/knowledge/hub/legacyRoutes";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Page({ searchParams }: PageProps) {
  const toHub = libraryCatalogToHubHref(await searchParams);
  if (toHub) redirect(toHub);
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) return <KnowledgeLanding />;
  return <LibraryCatalogPage />;
}
