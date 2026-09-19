/**
 * Trash — the platform-wide list of the current user's soft-deleted artifacts.
 *
 * There is deliberately no per-feature trash. The two RPCs iterate
 * `platform.entity_types.user_artifact_kind` (aidream migration 0459), so a newly
 * registered user-facing entity shows up here with no change to this file.
 *
 * Restore goes through the generic `entity_undelete(token, id)` from db-rules §8.
 * There is no purge: permanent destruction belongs to the retention engine
 * (common-docs/projects/data-lifecycle-platform), not to a button.
 */
import { supabase } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";

export type TrashItem =
  Database["public"]["Functions"]["trash_list"]["Returns"][number];
export type TrashCount =
  Database["public"]["Functions"]["trash_counts"]["Returns"][number];

type VaultRecoveryUnsupportedReason =
  | "recovery_tracking_unavailable"
  | "recovery_manifest_unsupported"
  | "protected_component_requires_native_recovery"
  | "linked_component_requires_native_recovery";

export type VaultRecoveryPreview =
  | {
      supported: true;
      deletion_id: string;
      fields_count: number;
      attachments_count: number;
      prior_was_disabled: boolean;
      reason: null;
    }
  | {
      supported: false;
      deletion_id: string | null;
      fields_count: null;
      attachments_count: null;
      prior_was_disabled: boolean | null;
      reason: VaultRecoveryUnsupportedReason;
    };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const vaultOwnedTokens = new Set([
  "credential_item",
  "user_secret",
  "credential_attachment",
]);

export function isVaultOwnedTrashToken(entityToken: string): boolean {
  return vaultOwnedTokens.has(entityToken);
}

export function isVaultCredentialTrashItem(item: TrashItem): boolean {
  return item.entity_token === "credential_item";
}

/**
 * NOTE: `limit`/`offset` apply PER KIND, not to the merged result — that is the
 * shape of the underlying loop. Page one kind at a time by passing a single
 * `kinds` entry; the unfiltered call is a recent-items overview, not a full list.
 */
export async function listTrash(opts?: {
  kinds?: string[];
  limit?: number;
  offset?: number;
}): Promise<TrashItem[]> {
  const { data, error } = await supabase.rpc("trash_list", {
    p_kinds: opts?.kinds,
    p_limit: opts?.limit ?? 200,
    p_offset: opts?.offset ?? 0,
  });
  if (error) throw new Error(`Failed to load trash: ${error.message}`);
  return data ?? [];
}

/** True per-kind totals — counted against the tables, not against a page. */
export async function getTrashCounts(): Promise<TrashCount[]> {
  const { data, error } = await supabase.rpc("trash_counts");
  if (error) throw new Error(`Failed to load trash counts: ${error.message}`);
  return data ?? [];
}

export async function restoreFromTrash(
  entityToken: string,
  id: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("entity_undelete", {
    p_token: entityToken,
    p_id: id,
  });
  if (error) throw new Error(`Failed to restore: ${error.message}`);
  if (data === false) {
    throw new Error(
      "Restore was refused — you may no longer have edit access.",
    );
  }
}

/** Metadata only. The RPC never returns lifecycle JSON or credential values. */
export async function previewVaultRecovery(
  itemId: string,
): Promise<VaultRecoveryPreview> {
  const { data, error } = await supabase.rpc("vault_recovery_preview", {
    p_id: itemId,
  });
  if (error) throw new Error(`Could not review recovery: ${error.message}`);
  return parseVaultRecoveryPreview(data);
}

function isUnsupportedReason(
  value: unknown,
): value is VaultRecoveryUnsupportedReason {
  return (
    value === "recovery_tracking_unavailable" ||
    value === "recovery_manifest_unsupported" ||
    value === "protected_component_requires_native_recovery" ||
    value === "linked_component_requires_native_recovery"
  );
}

function parseVaultRecoveryPreview(raw: unknown): VaultRecoveryPreview {
  if (!raw || typeof raw !== "object") {
    throw new Error(
      "Recovery details were unavailable. Reload Trash and try again.",
    );
  }
  const fieldsCount = "fields_count" in raw ? raw.fields_count : null;
  const attachmentsCount =
    "attachments_count" in raw ? raw.attachments_count : null;
  const priorWasDisabled =
    "prior_was_disabled" in raw ? raw.prior_was_disabled : null;
  const supported = "supported" in raw ? raw.supported : null;
  const deletionId = "deletion_id" in raw ? raw.deletion_id : null;
  const reason = "reason" in raw ? raw.reason : null;
  if (typeof supported !== "boolean") {
    throw new Error(
      "Recovery details were incomplete. Reload Trash and try again.",
    );
  }
  if (supported) {
    if (
      typeof fieldsCount !== "number" ||
      !Number.isInteger(fieldsCount) ||
      fieldsCount < 0 ||
      typeof attachmentsCount !== "number" ||
      !Number.isInteger(attachmentsCount) ||
      attachmentsCount < 0 ||
      typeof priorWasDisabled !== "boolean" ||
      typeof deletionId !== "string" ||
      !UUID.test(deletionId) ||
      reason !== null
    ) {
      throw new Error(
        "Recovery details were incomplete. Reload Trash and try again.",
      );
    }
    return {
      supported: true,
      deletion_id: deletionId,
      fields_count: fieldsCount,
      attachments_count: attachmentsCount,
      prior_was_disabled: priorWasDisabled,
      reason: null,
    };
  }
  if (
    (deletionId !== null &&
      (typeof deletionId !== "string" || !UUID.test(deletionId))) ||
    (priorWasDisabled !== null && typeof priorWasDisabled !== "boolean") ||
    fieldsCount !== null ||
    attachmentsCount !== null ||
    !isUnsupportedReason(reason)
  ) {
    throw new Error(
      "Recovery details were incomplete. Reload Trash and try again.",
    );
  }
  return {
    supported: false,
    deletion_id: deletionId,
    fields_count: null,
    attachments_count: null,
    prior_was_disabled: priorWasDisabled,
    reason,
  };
}
