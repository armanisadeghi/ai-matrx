// /administration/applications — Overview tab of the Applications hub.
// Per-application cards summarising remote configuration, remote catalogs,
// and the installed fleet, with a loud warning when instances are running
// below the published minimum supported version.
//
// Super-admin gating comes from the (admin) route-group layout; the
// admin_list_app_instances RPC is additionally gated by is_super_admin().

import { createClient } from "@/utils/supabase/server";
import { ApplicationsOverview } from "@/features/admin/applications/overview/components/ApplicationsOverview";
import { DEFAULT_APPLICATION } from "@/features/admin/applications/constants";

export default async function ApplicationsOverviewPage() {
  const supabase = await createClient();

  const [configResult, catalogResult, instanceResult] = await Promise.all([
    supabase.from("app_config").select("*").order("app"),
    supabase.from("catalog_entries").select("*").order("app").order("kind"),
    supabase.rpc("admin_list_app_instances"),
  ]);

  if (configResult.error) {
    throw new Error(`App config failed to load: ${configResult.error.message}`);
  }
  if (catalogResult.error) {
    throw new Error(
      `Catalog entries failed to load: ${catalogResult.error.message}`,
    );
  }
  if (instanceResult.error) {
    throw new Error(
      `Installed instances failed to load: ${instanceResult.error.message}`,
    );
  }

  // Render-stable clock for the client's 7-day activity window.
  const nowMs = Date.now();

  return (
    <ApplicationsOverview
      configRows={configResult.data ?? []}
      catalogRows={catalogResult.data ?? []}
      instanceRows={instanceResult.data ?? []}
      instancesApp={DEFAULT_APPLICATION}
      nowMs={nowMs}
    />
  );
}
