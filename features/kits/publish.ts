// features/kits/publish.ts — a saved kit is one catalog row the organization owns.
//
// `public.catalog_entries` (app 'matrx', kind 'kit'), `organization_id` = the
// organization the person SET, `visibility` 'internal' = that organization's members
// read it (std_select: `organization_id IN iam.my_orgs()`), `created_by` = the person
// (std_insert requires it; std_update / std_delete let the creator edit and unpublish).
// "Share publicly" is an admin-only act for now and is not offered here.
//
// Keys are unique across the WHOLE catalog (UNIQUE (app, kind, key)), so an
// organization's kit key carries the organization: `<slug>.<org8>`, and a collision
// takes the next free `-2`, `-3`, … suffix.

import type { Json } from "@/types/database.types";
import { supabase } from "@/utils/supabase/client";
import { KIT_CATALOG } from "./constants";
import { slugFor } from "./serialize";
import type { KitManifest } from "./types";

export function orgKitKey(name: string, organizationId: string, attempt = 1): string {
  const base = `${slugFor(name)}.${organizationId.slice(0, 8)}`;
  return attempt === 1 ? base : `${base}-${attempt}`;
}

/** Publish a new kit for the organization. Returns the key it landed under. */
export async function publishKit(args: {
  manifest: KitManifest;
  organizationId: string;
  userId: string;
}): Promise<string> {
  for (let attempt = 1; attempt <= 20; attempt++) {
    const key = orgKitKey(args.manifest.name, args.organizationId, attempt);
    const payload = { ...args.manifest, key };
    const { data, error } = await supabase
      .from("catalog_entries")
      .insert({
        app: KIT_CATALOG.app,
        kind: KIT_CATALOG.kind,
        key,
        payload: payload as unknown as Json,
        schema_version: 1,
        organization_id: args.organizationId,
        visibility: "internal",
        created_by: args.userId,
        is_active: true,
        sort_order: 100,
      })
      .select("key")
      .maybeSingle();
    if (!error && data) return data.key;
    if (error?.code === "23505") continue; // that key is taken — try the next one
    if (error) throw new Error(`The kit could not be saved: ${error.message}`);
    throw new Error("The kit could not be saved: the catalog accepted nothing and said nothing.");
  }
  throw new Error("The kit could not be saved: every name like this one is taken. Try a different name.");
}

/** Replace a saved kit's manifest (the creator only; RLS decides). */
export async function updateKit(key: string, manifest: KitManifest): Promise<void> {
  const { data, error } = await supabase
    .from("catalog_entries")
    .update({ payload: { ...manifest, key } as unknown as Json })
    .eq("app", KIT_CATALOG.app)
    .eq("kind", KIT_CATALOG.kind)
    .eq("key", key)
    .select("key");
  if (error) throw new Error(`The kit could not be updated: ${error.message}`);
  if (!data || data.length === 0) throw new Error("The kit was not changed: it does not exist or you may not edit it.");
}

/** Take a saved kit out of the gallery (kept, inactive — the creator can publish it again). */
export async function unpublishKit(key: string): Promise<void> {
  const { data, error } = await supabase
    .from("catalog_entries")
    .update({ is_active: false })
    .eq("app", KIT_CATALOG.app)
    .eq("kind", KIT_CATALOG.kind)
    .eq("key", key)
    .select("key");
  if (error) throw new Error(`The kit could not be unpublished: ${error.message}`);
  if (!data || data.length === 0) throw new Error("The kit was not unpublished: it does not exist or you may not edit it.");
}
