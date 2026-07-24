/**
 * client_activity_log writer — the C6 contract (master plan §5).
 *
 * Every mutation on the CMS project writes one row here: `activity_type`,
 * `entity_type`/`entity_id`, `changes` (jsonb diff summary carrying `actor` +
 * optional `metadata`), `user_id`, `description`. P1's aidream services write
 * the `agent`/`system` side; these FE routes write the `human` side — without
 * both, the P5 visibility feed lies by omission (only agent writes would show).
 *
 * Never throws into the caller — a logging failure must not fail the mutation
 * it's describing. Screams to the server console instead (loud recovery).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type CmsActivityActor = "agent" | "human" | "system";

export interface LogCmsActivityParams {
  siteId: string | null;
  activityType: string;
  // The normalized C6 entity_type vocabulary — must stay in lockstep with
  // aidream/services/cms/CONTRACT.md (C6 section) and the Activity Feed filter.
  // 'client_page' is NOT a member (that token belongs to the version-facade
  // vocabulary only; CMS migration 0007 normalized historical rows).
  // 'collection' / 'collection_item' match aidream's log_activity strings (W2-C).
  entityType:
    | "site"
    | "page"
    | "component"
    | "version"
    | "exception"
    | "html_page"
    | "asset"
    | "collection"
    | "collection_item";
  entityId: string | null;
  description: string;
  userId: string;
  userEmail?: string | null;
  actor?: CmsActivityActor;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export async function logCmsActivity(
  db: SupabaseClient,
  params: LogCmsActivityParams,
): Promise<void> {
  const {
    siteId,
    activityType,
    entityType,
    entityId,
    description,
    userId,
    userEmail,
    actor = "human",
    changes,
    metadata,
  } = params;

  const { error } = await db.from("client_activity_log").insert({
    client_id: siteId,
    activity_type: activityType,
    entity_type: entityType,
    entity_id: entityId,
    description,
    user_id: userId,
    user_email: userEmail ?? null,
    changes: {
      actor,
      ...(changes ?? {}),
      ...(metadata ? { metadata } : {}),
    },
  });

  if (error) {
    console.error("[cms/activity-log] insert failed:", error, params);
  }
}
