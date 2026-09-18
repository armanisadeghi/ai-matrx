import { createAdminClient } from "@/utils/supabase/adminClient";
import { createClient } from "@/utils/supabase/server";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";
import { resolvePersistedOrchestrator, type OrchestratorTarget } from "@/lib/sandbox/orchestrator-routing";

export type SandboxLifecycleTarget = { rowId: string; sandboxId: string; orchestrator: OrchestratorTarget; deletedAt: string | null };
export type SandboxLifecycleResolution = { ok: true; target: SandboxLifecycleTarget } | { ok: false; status: number; error: string };

/** Owner/RLS is always first. Service-role lookup is only a verified super-admin tombstone path. */
export async function resolveSandboxLifecycleTarget(rowId: string): Promise<SandboxLifecycleResolution> {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, status: 401, error: "User not authenticated" };
  const { data: owned } = await supabase.from("sandbox_instances").select("id, sandbox_id, tier, config, deleted_at").eq("id", rowId).eq("user_id", user.id).single();
  let row = owned;
  if (!row && await checkIsSuperAdmin(supabase, user.id)) {
    const { data } = await createAdminClient().from("sandbox_instances").select("id, sandbox_id, tier, config, deleted_at").eq("id", rowId).single();
    row = data;
  }
  if (!row) return { ok: false, status: 404, error: "Sandbox lifecycle target unavailable" };
  const resolved = resolvePersistedOrchestrator(row.tier, row.config);
  if (!resolved.ok) return { ok: false, status: 409, error: resolved.error };
  return { ok: true, target: { rowId: row.id, sandboxId: row.sandbox_id, orchestrator: resolved.orchestrator, deletedAt: row.deleted_at } };
}
