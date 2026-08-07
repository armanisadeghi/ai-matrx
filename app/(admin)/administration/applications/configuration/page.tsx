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

interface ApplicationsConfigurationPageProps {
  searchParams: Promise<{
    app?: string | string[];
    credential?: string | string[];
  }>;
}

export default async function ApplicationsConfigurationPage({
  searchParams,
}: ApplicationsConfigurationPageProps) {
  const supabase = await createClient();
  const query = await searchParams;
  const initialApp = typeof query.app === "string" ? query.app : undefined;
  const initialCredentialId =
    typeof query.credential === "string" ? query.credential : undefined;

  const { data, error } = await supabase
    .from("app_config")
    .select("*")
    .order("app");

  if (error) {
    throw new Error(`App config failed to load: ${error.message}`);
  }

  return (
    <AppConfigClient
      initialRows={data ?? []}
      initialApp={initialApp}
      initialCredentialId={initialCredentialId}
    />
  );
}
