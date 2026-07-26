// /administration/applications/configuration — remote runtime configuration
// for shipped clients (public.app_config, one anon-readable row per
// application). List → per-application editor (typed v1 fields +
// forward-compat raw JSON) → diff-confirmed save via the
// admin_update_app_config RPC → history/restore.
//
// Super-admin gating comes from the (admin) route-group layout; the RPC is
// additionally gated by is_super_admin() at the DB.
// Cross-repo system-of-record: common-docs/systems/app-config/FEATURE.md

import { createClient } from "@/utils/supabase/server";
import { AppConfigClient } from "@/features/admin/applications/config/components/AppConfigClient";

export default async function ApplicationsConfigurationPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("app_config")
    .select("*")
    .order("app");

  if (error) {
    throw new Error(`App config failed to load: ${error.message}`);
  }

  return <AppConfigClient initialRows={data ?? []} />;
}
