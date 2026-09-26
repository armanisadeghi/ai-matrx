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
import { tryWriteOne } from "@/utils/supabase/writeOne";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";

export type TrashItem =
  Database["public"]["Functions"]["trash_list"]["Returns"][number];
export type TrashCount =
  Database["public"]["Functions"]["trash_counts"]["Returns"][number];

type VaultRecoveryUnsupportedReason =
  | "recovery_tracking_unavailable"
  | "recovery_manifest_unsupported"
  | "protected_component_requires_native_recovery"
  | "linked_component_requires_native_recovery"
  | "native_recovery_unavailable"
  | "native_components_missing"
  | "native_components_conflict"
  | "native_manifest_invalid";

export type VaultRecoveryPreview =
  | {
      supported: true;
      deletion_id: string;
      fields_count: number;
      attachments_count: number;
      native_passkeys_count: 0 | 1;
      prior_was_disabled: boolean;
      reason: null;
    }
  | {
      supported: false;
      deletion_id: string | null;
      fields_count: null;
      attachments_count: null;
      native_passkeys_count: 0 | null;
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

// ── ORGANIZATION TRASH (lane TRASH-2) ─────────────────────────────────────────────────────────
// Personal Trash (above) is what YOU archived plus what was shared with you by name. An
// organization's owners and admins see members' archived items in THAT organization here —
// the Google Workspace admin-console restore — never mixed into anyone's personal Trash.

export type OrgTrashItem =
  Database["public"]["Functions"]["org_trash_list"]["Returns"][number];

/**
 * One merged page, newest first. Unlike `listTrash`, `limit`/`offset` apply to the MERGED list
 * across the chosen kinds, so a page is exactly `limit` rows.
 */
export async function listOrgTrash(opts: {
  organizationId: string;
  kinds?: string[];
  memberId?: string | null;
  limit?: number;
  offset?: number;
}): Promise<OrgTrashItem[]> {
  const { data, error } = await supabase.rpc("org_trash_list", {
    p_organization_id: opts.organizationId,
    p_kinds: opts.kinds,
    p_member: opts.memberId ?? undefined,
    p_limit: opts.limit ?? 50,
    p_offset: opts.offset ?? 0,
  });
  if (error) throw new Error(`Failed to load the organization's trash: ${error.message}`);
  return data ?? [];
}

export async function getOrgTrashCounts(
  organizationId: string,
  memberId?: string | null,
): Promise<TrashCount[]> {
  const { data, error } = await supabase.rpc("org_trash_counts", {
    p_organization_id: organizationId,
    p_member: memberId ?? undefined,
  });
  if (error) throw new Error(`Failed to load the organization's trash counts: ${error.message}`);
  return data ?? [];
}

export interface OrgTrashRestoreResult {
  restored: boolean;
  message: string;
}

/** Audited on the server (organization audit log) and the item's owner is told in-app. */
export async function restoreFromOrgTrash(
  organizationId: string,
  entityToken: string,
  id: string,
): Promise<OrgTrashRestoreResult> {
  const { data, error } = await supabase.rpc("org_trash_restore", {
    p_organization_id: organizationId,
    p_token: entityToken,
    p_id: id,
  });
  if (error) throw new Error(`Failed to restore: ${error.message}`);
  const raw = (data ?? {}) as { restored?: unknown; message?: unknown };
  return {
    restored: raw.restored === true,
    message:
      typeof raw.message === "string" && raw.message.trim()
        ? raw.message
        : raw.restored === true
          ? "Restored."
          : "It is no longer in this organization's Trash.",
  };
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
    value === "linked_component_requires_native_recovery" ||
    value === "native_recovery_unavailable" ||
    value === "native_components_missing" ||
    value === "native_components_conflict" ||
    value === "native_manifest_invalid"
  );
}

function isNativePasskeysCount(value: unknown): value is 0 | 1 {
  return value === 0 || value === 1;
}

export function parseVaultRecoveryPreview(raw: unknown): VaultRecoveryPreview {
  if (!raw || typeof raw !== "object") {
    throw new Error(
      "Recovery details were unavailable. Reload Trash and try again.",
    );
  }
  const fieldsCount = "fields_count" in raw ? raw.fields_count : null;
  const attachmentsCount =
    "attachments_count" in raw ? raw.attachments_count : null;
  const nativePasskeysCount =
    "native_passkeys_count" in raw ? raw.native_passkeys_count : undefined;
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
    // Version 1 did not include this count. Its absence remains ordinary-only
    // compatibility, never evidence that a native component is present.
    const nativePasskeys =
      nativePasskeysCount === undefined ? 0 : nativePasskeysCount;
    if (
      typeof fieldsCount !== "number" ||
      !Number.isInteger(fieldsCount) ||
      fieldsCount < 0 ||
      typeof attachmentsCount !== "number" ||
      !Number.isInteger(attachmentsCount) ||
      attachmentsCount < 0 ||
      !isNativePasskeysCount(nativePasskeys) ||
      (nativePasskeys === 1 && fieldsCount < 1) ||
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
      native_passkeys_count: nativePasskeys,
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
    (nativePasskeysCount !== undefined &&
      nativePasskeysCount !== null &&
      nativePasskeysCount !== 0) ||
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
    native_passkeys_count: nativePasskeysCount === 0 ? 0 : null,
    prior_was_disabled: priorWasDisabled,
    reason,
  };
}

/**
 * THE ONE ARCHIVE for any registered record Trash lists: the person's own write of `deleted_at`
 * on the record's table (RLS decides), the mirror of `restoreFromTrash`. Surfaces never write a
 * record-specific soft delete of their own for a kind this can reach — they mount
 * `<ArchiveRecordButton token id />` (verify RC-B11 round 2: a studio document had no way out).
 * Throws a plain sentence; "not found" means it is already archived or not yours to archive.
 */
export async function archiveRecord(token: string, id: string, noun = "this"): Promise<void> {
  const info = tryGetEntityInfo(token);
  if (!info) throw new Error(`This kind of record (${token}) can't be archived from here yet.`);
  const table = (supabase.schema(info.schema as never) as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => {
        eq: (c: string, v: string) => { is: (c: string, v: null) => { select: (c: string) => PromiseLike<{ data: { id: string }[] | null; error: unknown }> } };
      };
    };
  }).from(info.table);
  const { error } = await tryWriteOne(
    table.update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null).select("id"),
    { action: "archive", noun },
  );
  if (error) throw error;
}

