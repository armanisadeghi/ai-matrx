// /administration/applications/history — one unified audit timeline across
// remote configuration (public.app_config_history) and remote catalogs
// (public.catalog_entries_history), newest first, with per-row diffs against
// the previous snapshot of the same record.
//
// Super-admin gating comes from the (admin) route-group layout; both history
// tables are admin-read RLS.

import { createClient } from "@/utils/supabase/server";
import { ApplicationsHistoryClient } from "@/features/admin/applications/history/components/ApplicationsHistoryClient";
import { buildApplicationsTimeline } from "@/features/admin/applications/history/buildTimeline";

/** Newest N per source; "Load more" widens this window client-side. */
const HISTORY_PAGE_LIMIT = 100;

export default async function ApplicationsHistoryPage() {
  const supabase = await createClient();

  const [configResult, catalogResult] = await Promise.all([
    supabase
      .from("app_config_history")
      .select("*")
      .order("changed_at", { ascending: false })
      .limit(HISTORY_PAGE_LIMIT),
    supabase
      .from("catalog_entries_history")
      .select("*")
      .order("changed_at", { ascending: false })
      .limit(HISTORY_PAGE_LIMIT),
  ]);

  if (configResult.error) {
    throw new Error(
      `Configuration history failed to load: ${configResult.error.message}`,
    );
  }
  if (catalogResult.error) {
    throw new Error(
      `Catalog history failed to load: ${catalogResult.error.message}`,
    );
  }

  const entries = buildApplicationsTimeline(
    configResult.data ?? [],
    catalogResult.data ?? [],
  );

  return (
    <ApplicationsHistoryClient
      initialEntries={entries}
      limit={HISTORY_PAGE_LIMIT}
    />
  );
}
