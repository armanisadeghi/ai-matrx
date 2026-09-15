// /administration/applications/sync — folder-sync fleet health.
//
// Who is over quota, whose sync is stopped, and which devices have gone quiet,
// read from `files.sync_mapping_admin_status`. That view is the authorization,
// not this route: it is `security_invoker = false` and its own WHERE clause
// admits only `is_platform_admin()` or an admin/owner of the row's
// organization. It exposes states and counts and NO `local_path`,
// `local_path_display`, `state_reason` or `knobs` — an admin never sees the
// inside of somebody's home directory (folder-sync SPEC-SERVER §6.2, S22).
//
// Admin-level gating for the route group comes from `app/(admin)/layout.tsx`.

import { createClient } from "@/utils/supabase/server";
import { SyncFleetClient } from "@/features/files/devices/admin/SyncFleetClient";
import type { SyncAdminRow } from "@/features/files/devices/admin/types";

export const metadata = {
  title: "Folder sync — fleet health",
};

export default async function SyncFleetPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .schema("files")
    .from("sync_mapping_admin_status")
    .select(
      "id, user_id, device_id, organization_id, direction, desired_state, state, state_changed_at, last_seen_at, last_synced_at, items_total, bytes_total, created_at",
    )
    .order("state_changed_at", { ascending: false, nullsFirst: false })
    .limit(1000);

  if (error) {
    throw new Error(`Sync fleet status failed to load: ${error.message}`);
  }

  return (
    <div className="space-y-3 p-3">
      <header>
        <h1 className="text-sm font-semibold text-foreground">
          Folder sync — fleet health
        </h1>
        <p className="text-xs text-muted-foreground">
          States and counts for every sync mapping in the organizations you
          administer. Local folder paths are deliberately not available here.
        </p>
      </header>
      <SyncFleetClient rows={(data ?? []) as unknown as SyncAdminRow[]} />
    </div>
  );
}
