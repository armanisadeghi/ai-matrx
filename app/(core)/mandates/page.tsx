import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { legacyFeatureRedirect } from "@/features/mandates/browse/url-compat";
import { MandatesBrowsePage } from "@/features/mandates/browse/MandatesBrowsePage";

/**
 * /mandates — every named job the platform delegates to an agent, on
 * the canonical entity-list shell (2026-08-26 rework; vision in
 * features/mandates/FEATURE.md). Manage a mandate in place (row click →
 * window panel) or on its dedicated route (/mandates/[mandateKey]).
 * Admin pin management lives at /administration/mandates.
 *
 * Legacy deep links (`?feature=<domain>`, the pre-rework contract used by 25+
 * doors) are normalized server-side onto the canonical `?filters=` form — a
 * REAL select filter, not a text search.
 */
export default async function MandatesRoute({
  searchParams,
}: {
  searchParams: Promise<{ feature?: string | string[]; filters?: string | string[] }>;
}) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/agents");

  const legacy = legacyFeatureRedirect(await searchParams);
  if (legacy) redirect(legacy);

  return <MandatesBrowsePage />;
}
