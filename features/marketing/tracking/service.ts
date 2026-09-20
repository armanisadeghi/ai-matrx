"use client";

/**
 * Tracking Plane A — the two doors, each the ONE path for what it does:
 *
 *  1. READ the latest snapshot — React → Supabase DIRECTLY (`web.tag_manager_snapshot`), never
 *     through the Python server, which is not a DB gateway. THE VIEW LAW: the list declares its
 *     own scope (this site, this organization, live rows only); RLS is the ceiling above it.
 *  2. TAKE a snapshot — the ONE compute call, `POST /google-sync/tag-manager/snapshot`, through
 *     `postGoogleBackend` (the Supabase session's bearer token plus the fail-closed organization
 *     header). It is compute: it spends a Google Tag Manager API call AND fetches the customer's
 *     own site. Never a hand-rolled `fetch`, and never a second inventory client — the container
 *     inventory already has one at `features/marketing/google/service.ts`
 *     (`getTagManagerInventory`) and this module consumes it rather than forking it.
 */

import { supabase } from "@/utils/supabase/client";
import { postGoogleBackend } from "@/features/marketing/google/service";
import { requireOrganizationContext } from "@/lib/api/organization-context";

import type { TagManagerSnapshotRow } from "@/features/marketing/tracking/types";

/**
 * The bare router prefix — `aidream/api/app.py` mounts `google_sync.router` at `/google-sync`.
 */
const SNAPSHOT_PATH = "/google-sync/tag-manager/snapshot";

/**
 * The newest live snapshot for one site, or `null`.
 *
 * A single-row read, so no `readAllRows`: `limit(1)` is the whole answer and PostgREST's 1000-row
 * cap cannot bite. (A list of a site's snapshot HISTORY would need it — there is no such list
 * today, and adding one without `readAllRows` would be the defect.)
 */
export async function readLatestTrackingSnapshot(args: {
  siteId: string;
  organizationId: string;
  signal?: AbortSignal;
}): Promise<TagManagerSnapshotRow | null> {
  const organizationId = requireOrganizationContext(args.organizationId);
  let query = supabase
    .schema("web")
    .from("tag_manager_snapshot")
    .select("*")
    .eq("site_id", args.siteId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("taken_at", { ascending: false })
    .limit(1);
  if (args.signal) query = query.abortSignal(args.signal);
  const { data, error } = await query;
  if (error) {
    throw new Error(`Could not read this site's tracking snapshot: ${error.message}`);
  }
  return data?.[0] ?? null;
}

export interface TakeTrackingSnapshotInput {
  siteId: string;
  organizationId: string;
  connectionId: string;
  /** Optional: grade one named container instead of the first readable one. */
  containerId?: string | null;
}

/**
 * Take a fresh snapshot. The caller states the consequence BEFORE calling this — it spends a
 * Google Tag Manager request and one live fetch of the site
 * (`common-docs/policies/destructive-and-expensive-actions.md`).
 */
export async function takeTrackingSnapshot(
  input: TakeTrackingSnapshotInput,
): Promise<TagManagerSnapshotRow["id"]> {
  const organizationId = requireOrganizationContext(input.organizationId);
  const response = await postGoogleBackend(
    SNAPSHOT_PATH,
    {
      organization_id: organizationId,
      connection_id: input.connectionId,
      site_id: input.siteId,
      container_id: input.containerId ?? null,
    },
    "Unable to check this site's Tag Manager tracking.",
  );
  const body = (await response.json()) as { id: string };
  return body.id;
}
