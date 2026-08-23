// lib/organizations/systemOrg.ts
//
// The ONE canonical way to resolve a platform-owned organization id by its
// `iam.system_orgs` key:
//   • 'system'  — homes shipped / builtin content (platform tools, builtin
//                 skills, system voices, shared templates) that belongs to no
//                 individual user. `global_readable = true`.
//   • 'library' — the Matrx Library: owner of every resource shared beyond one
//                 tenant. `global_readable = false` DELIBERATELY — its contents
//                 are reachable only through a `platform.entity_grants` row.
//                 SoR: common-docs/systems/platform/library/STATE.md.
//
// Backed by `iam.system_orgs`, which is the single source of truth for the
// platform's own tenants. Its id is fixed for the life of
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

/** Keys of `iam.system_orgs` this resolver serves. */
export type SystemOrgKey = "system" | "library";

const cachedIds = new Map<SystemOrgKey, string>();
const inflight = new Map<SystemOrgKey, Promise<string>>();

type AnyClient = SupabaseClient<Database> | SupabaseClient;

async function resolveByKey(
  key: SystemOrgKey,
  client?: AnyClient,
): Promise<string> {
  const cached = cachedIds.get(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;

  const db = (client ?? supabase) as SupabaseClient;
  const promise = (async () => {
    const { data, error } = await db
      .schema("iam")
      .from("system_orgs")
      .select("organization_id")
      .eq("key", key)
      .single();
    if (error || !data?.organization_id) {
      throw (
        error ??
        new Error(
          `iam.system_orgs has no row for key='${key}' — platform org missing`,
        )
      );
    }
    const id = data.organization_id as string;
    cachedIds.set(key, id);
    return id;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}

/**
 * The global system organization id. Cached for the process; makes at most one
 * read of `iam.system_orgs`. Throws loudly if the system org is missing (a real
 * platform defect) rather than letting a null org slip into a builtin write.
 *
 * @param client optional SSR/admin client for server contexts; defaults to the
 *   browser client.
 */
export async function resolveSystemOrgId(client?: AnyClient): Promise<string> {
  return resolveByKey("system", client);
}

/**
 * The Matrx Library organization id — the owner of every resource published
 * beyond one tenant. Same cache, same table, one key over; never hardcode it.
 */
export async function resolveLibraryOrgId(client?: AnyClient): Promise<string> {
  return resolveByKey("library", client);
}

/** Drop the cached platform org ids. For tests only. */
export function clearSystemOrgIdCache(): void {
  cachedIds.clear();
  inflight.clear();
}
