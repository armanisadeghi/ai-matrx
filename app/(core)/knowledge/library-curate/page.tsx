/**
 * `/knowledge/library-curate` — the Matrx Library's authoring door, for industry
 * curators (outside Subject Matter Experts, not admins).
 *
 * Sibling of `/knowledge/library-catalog`: the catalog is what you RECEIVE from the
 * Library, this is what you AUTHOR for it. Every gate is the database's
 * (`iam.industry_curators` → `seo._pack_assert_author`); this route adds none.
 *
 * SoR: common-docs/systems/platform/library/STATE.md.
 */

import { LibraryCuratePage } from "@/features/rag/components/library-curate/LibraryCuratePage";
import KnowledgeLanding from "@/features/auth/components/module-landing/landings/KnowledgeLanding";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/knowledge/library-curate", {
  title: "Curate — Matrx Library",
  description:
    "Author the starter packs the Matrx Library gives to everyone in your industry.",
  letter: "C",
});

export default async function Page() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) return <KnowledgeLanding />;
  return <LibraryCuratePage />;
}
