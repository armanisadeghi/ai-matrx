// lib/organizations/systemOrg.ts
//
// The ONE canonical way to resolve the global SYSTEM organization id — the org
// that homes shipped / builtin content (platform tools, builtin skills, system
// voices, shared templates) that belongs to no individual user.
//
// Backed by `iam.system_orgs` (key = 'system'), which is the single source of
// truth for the global-readable system tenant. Its id is fixed for the life of
// the DB, so this is fetched at most ONCE per process and memoized at module
// scope. Unlike the personal-org resolver, caching across requests is safe here
// because the system org is a GLOBAL constant, not user-specific — so the same
// helper works on the browser and on the server (pass the SSR client).
//
// Do NOT hardcode the UUID. It is documented in docs/official/db-rules.md only
// as a reference; the live value comes from this resolver.

import { supabase } from "@/utils/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

let cachedId: string | null = null;
let inflight: Promise<string> | null = null;

type AnyClient = SupabaseClient<Database> | SupabaseClient;

/**
 * The global system organization id. Cached for the process; makes at most one
 * read of `iam.system_orgs`. Throws loudly if the system org is missing (a real
 * platform defect) rather than letting a null org slip into a builtin write.
 *
 * @param client optional SSR/admin client for server contexts; defaults to the
 *   browser client.
 */
export async function resolveSystemOrgId(client?: AnyClient): Promise<string> {
  if (cachedId) return cachedId;
  if (inflight) return inflight;

  const db = (client ?? supabase) as SupabaseClient;
  inflight = (async () => {
    const { data, error } = await db
      .schema("iam")
      .from("system_orgs")
      .select("organization_id")
      .eq("key", "system")
      .single();
    if (error || !data?.organization_id) {
      throw (
        error ??
        new Error("iam.system_orgs has no row for key='system' — system org missing")
      );
    }
    cachedId = data.organization_id as string;
    return cachedId;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

/** Drop the cached system org id. For tests only. */
export function clearSystemOrgIdCache(): void {
  cachedId = null;
  inflight = null;
}
