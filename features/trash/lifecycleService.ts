"use client";

// features/trash/lifecycleService.ts
//
// The client half of the data-lifecycle warning stage — thin, typed wrappers
// over `platform.lifecycle_user_notice` / `platform.lifecycle_user_keep`.
// Both are SECURITY DEFINER, granted to `authenticated`, and resolve identity
// from `auth.uid()`, so these are plain direct-to-Supabase RPCs (no server hop).
//
// This is the lifecycle half of /trash: the same list of soft-deleted things,
// answering "when does this actually go away?". There is no second page for it.
//
// The notice function is the SAME source of truth the weekly digest email reads
// (aidream/aidream/services/data_lifecycle/digest.py), so the page can never
// contradict the email. Cross-repo authority:
// common-docs/projects/data-lifecycle-platform/{VISION,PLAN}.md.

import { supabase } from "@/utils/supabase/client";
import { operationFailed } from "@/utils/errors";
import { z } from "zod";

/** One entity's worth of the caller's rows scheduled for permanent deletion. */
const lifecyclePendingSchema = z.object({
  entity_token: z.string(),
  label: z.string().nullable(),
  mode: z.string(),
  rows: z.number(),
  wipe_on: z.string().nullable(),
  days_left: z.number().nullable(),
  in_warning_window: z.boolean(),
});

/** One batch of the caller's rows already moved to cold storage. */
const lifecycleArchivedSchema = z.object({
  entity_token: z.string(),
  rows: z.number(),
  archived_on: z.string(),
  restorable: z.boolean(),
});

const lifecycleNoticeSchema = z.object({
  user_id: z.string(),
  as_of: z.string(),
  pending_rows: z.number(),
  rows_in_warning_window: z.number(),
  should_notify: z.boolean(),
  pending: z.array(lifecyclePendingSchema),
  archived: z.array(lifecycleArchivedSchema),
});

const lifecycleKeepResultSchema = z.object({
  entity_token: z.string(),
  rows_kept: z.number(),
  user_id: z.string(),
});

export type LifecyclePending = z.infer<typeof lifecyclePendingSchema>;
export type LifecycleArchived = z.infer<typeof lifecycleArchivedSchema>;
export type LifecycleNotice = z.infer<typeof lifecycleNoticeSchema>;
export type LifecycleKeepResult = z.infer<typeof lifecycleKeepResultSchema>;

/**
 * Everything of the caller's that is pending permanent deletion or already
 * archived. Called with no argument so the function answers for `auth.uid()`.
 */
export async function fetchLifecycleNotice(): Promise<LifecycleNotice> {
  const { data, error } = await supabase
    .schema("platform")
    .rpc("lifecycle_user_notice");
  if (error) throw operationFailed("check what's scheduled for deletion", error);
  return lifecycleNoticeSchema.parse(data);
}

/**
 * Take the caller's rows of one entity back out of every lifecycle window by
 * clearing `deleted_at`. Passing no ids keeps ALL of that entity's pending rows.
 *
 * 🚨 This is the BULK action only — "keep everything of this kind". A single
 * item is restored with `entity_undelete` (see `service.ts`), which is the
 * generic per-item path db-rules §8 already defines. Two functions, two
 * scopes; never wire both to the same button.
 */
export async function keepPendingEntity(
  entityToken: string,
): Promise<LifecycleKeepResult> {
  const { data, error } = await supabase
    .schema("platform")
    .rpc("lifecycle_user_keep", { p_entity_token: entityToken });
  if (error) throw operationFailed("keep that data", error);
  return lifecycleKeepResultSchema.parse(data);
}
