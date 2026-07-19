// /administration/applications/installations — the installed fleet.
// Every checked-in instance of our shipped clients (public.app_instances via
// the admin_list_app_instances SECURITY DEFINER RPC), compared against the
// live min_supported_app_version published in app_config.
//
// Super-admin gating comes from the (admin) route-group layout; the RPC is
// additionally gated by is_super_admin() at the DB.

import { createClient } from "@/utils/supabase/server";
import { InstallationsClient } from "@/features/admin/applications/installations/components/InstallationsClient";
import { DEFAULT_APPLICATION } from "@/features/admin/applications/constants";

export default async function ApplicationsInstallationsPage() {
  const supabase = await createClient();

  const [instanceResult, configResult] = await Promise.all([
    supabase.rpc("admin_list_app_instances"),
    supabase
      .from("app_config")
      .select("app, min_supported_app_version")
      .eq("app", DEFAULT_APPLICATION)
      .maybeSingle(),
  ]);

  if (instanceResult.error) {
    throw new Error(
      `Installed instances failed to load: ${instanceResult.error.message}`,
    );
  }
  if (configResult.error) {
    throw new Error(
      `App config failed to load: ${configResult.error.message}`,
    );
  }

  const rows = [...(instanceResult.data ?? [])].sort(
    (a, b) =>
      new Date(b.last_seen ?? 0).getTime() -
      new Date(a.last_seen ?? 0).getTime(),
  );

  // Render-stable clock for the client's 7-day activity window.
  const nowMs = Date.now();

  return (
    <InstallationsClient
      initialRows={rows}
      minSupportedVersion={configResult.data?.min_supported_app_version ?? null}
      app={DEFAULT_APPLICATION}
      nowMs={nowMs}
    />
  );
}
