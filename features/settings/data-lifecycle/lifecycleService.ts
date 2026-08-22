"use client";

// features/settings/data-lifecycle/lifecycleService.ts
//
// The client half of the data-lifecycle warning stage — thin, typed wrappers
// over `platform.lifecycle_user_notice` / `platform.lifecycle_user_keep`.
// Both are SECURITY DEFINER, granted to `authenticated`, and resolve identity
// from `auth.uid()`, so these are plain direct-to-Supabase RPCs (no server hop).
//
// The notice function is the SAME source of truth the weekly digest email reads
// (aidream/aidream/services/data_lifecycle/digest.py), so the page can never
// contradict the email. Cross-repo authority:
// common-docs/projects/data-lifecycle-platform/{VISION,PLAN}.md.

import { supabase } from "@/utils/supabase/client";
import { operationFailed } from "@/utils/errors";

/** One entity's worth of the caller's rows scheduled for permanent deletion. */
export interface LifecyclePending {
  entity_token: string;
  /** Policy-supplied human label; may be null when the policy names none. */
  label: string | null;
  mode: string;
  rows: number;
  /** ISO timestamp of the soonest wipe across those rows. */
  wipe_on: string | null;
  days_left: number | null;
  /** True when these rows are inside the window the digest emails about. */
  in_warning_window: boolean;
}

/** One batch of the caller's rows already moved to cold storage. */
export interface LifecycleArchived {
  entity_token: string;
  rows: number;
  archived_on: string;
  restorable: boolean;
}

export interface LifecycleNotice {
  user_id: string;
  as_of: string;
  pending_rows: number;
  rows_in_warning_window: number;
  should_notify: boolean;
  pending: LifecyclePending[];
  archived: LifecycleArchived[];
}

export interface LifecycleKeepResult {
  entity_token: string;
  rows_kept: number;
  user_id: string;
}

/**
 * Everything of the caller's that is pending permanent deletion or already
 * archived. Called with no argument so the function answers for `auth.uid()`.
 */
export async function fetchLifecycleNotice(): Promise<LifecycleNotice> {
  const { data, error } = await supabase
    .schema("platform")
    .rpc("lifecycle_user_notice");
  if (error) throw operationFailed("check what's scheduled for deletion", error);
  return data as unknown as LifecycleNotice;
}

/**
 * Take the caller's rows of one entity back out of every lifecycle window by
 * clearing `deleted_at`. Passing no ids keeps ALL of that entity's pending
 * rows — which is exactly what the page's per-group "Keep" button means.
 */
export async function keepPendingEntity(
  entityToken: string,
): Promise<LifecycleKeepResult> {
  const { data, error } = await supabase
    .schema("platform")
    .rpc("lifecycle_user_keep", { p_entity_token: entityToken });
  if (error) throw operationFailed("keep that data", error);
  return data as unknown as LifecycleKeepResult;
}
