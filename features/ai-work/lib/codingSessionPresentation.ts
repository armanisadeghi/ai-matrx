import type { Json } from "@/types/database.types";

function record(value: Json | null): Record<string, Json> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : null;
}

function nonEmptyString(value: Json | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const FINGERPRINT_KEYS = [
  "provider_account_key",
  "provider_account_fingerprint",
  "account_fingerprint",
] as const;

/** Why a reported account has no recoverable label. See {@link ACCOUNT_NOT_IDENTIFIED}. */
const LABEL_NOTE_KEYS = ["provider_account_label_note"] as const;

export const NO_ACCOUNT_IDENTITY = "No account identity reported";

/**
 * What a row says when an account identity WAS reported but its label can
 * never be recovered — distinct from {@link NO_ACCOUNT_IDENTITY}, which means
 * nothing identity-shaped was reported at all.
 *
 * CS-23: five `chat.coding_session` rows were written before 2026-09-07 with a
 * masked label (`a***6@g***.com`). Arman ruled that an account name is not a
 * secret, so nothing masks any more — but a mask already in a row is a lie the
 * screen repeats. Their account key is a one-way digest over a Claude
 * organization UUID we do not record and no sibling row holds the real label,
 * so migration 0854 set both label locations to null and wrote
 * `provider_account_label_note` saying why. This constant is what that note
 * renders as. The DB and the UI must agree here: nulling the label alone sent
 * the reader down to the opaque 64-hex `provider_account_key` below, which put
 * a hex digest where a person expects an account name.
 */
export const ACCOUNT_NOT_IDENTIFIED = "Account not identified";

export interface ProviderAccountIdentity {
  /** Display-safe label the provider exposed through a supported seam. */
  label: string | null;
  /** Opaque non-secret account fingerprint/key for grouping and equality. */
  fingerprint: string | null;
  /** Why the label is absent, when it was reported once and cannot be recovered. */
  labelNote: string | null;
  /**
   * What a UI should render: the label, else the unrecoverable-label sentence,
   * else the fingerprint, else the honest absence. Never a mask, and never a
   * raw account key when the row explains why its label is gone.
   */
  display: string;
  /** True when any identity fact was reported by the binding. */
  reported: boolean;
}

function firstIdentityValue(
  scope: Record<string, Json> | null,
  keys: readonly string[],
): string | null {
  if (!scope) return null;
  for (const key of keys) {
    const value = nonEmptyString(scope[key]);
    if (value) return value;
  }
  return null;
}

/**
 * Tolerant reader for the provider account identity metadata contract.
 * Prefers `provider_account_label` — the account as the person knows it, the
 * full signed-in email or org id (Arman's ruling 2026-09-07: an account name
 * is not a secret, so nothing masks it) — and falls back to the opaque
 * fingerprint keys (canonical `provider_account_key`, then the historical
 * `provider_account_fingerprint` / `account_fingerprint`) only for rows that
 * were delivered before the label existed. A row whose label was an
 * unrecoverable pre-2026-09-07 mask carries `provider_account_label_note`
 * instead, and that outranks the fingerprint — see {@link
 * ACCOUNT_NOT_IDENTIFIED}. Tokens and arbitrary metadata are never rendered.
 * Both the metadata root and the nested `source_metadata` record are honored.
 */
export function providerAccountIdentity(
  metadata: Json | null,
): ProviderAccountIdentity {
  const root = record(metadata);
  const nested = root ? record(root.source_metadata ?? null) : null;
  const label =
    firstIdentityValue(root, ["provider_account_label"]) ??
    firstIdentityValue(nested, ["provider_account_label"]);
  const fingerprint =
    firstIdentityValue(root, FINGERPRINT_KEYS) ??
    firstIdentityValue(nested, FINGERPRINT_KEYS);
  const labelNote =
    firstIdentityValue(root, LABEL_NOTE_KEYS) ??
    firstIdentityValue(nested, LABEL_NOTE_KEYS);
  return {
    label,
    fingerprint,
    labelNote,
    // The note outranks the fingerprint but never a real label: a row that
    // still knows its account name says the name, even if a stale note rode
    // along.
    display:
      label ??
      (labelNote !== null ? ACCOUNT_NOT_IDENTIFIED : null) ??
      fingerprint ??
      NO_ACCOUNT_IDENTITY,
    reported: label !== null || labelNote !== null || fingerprint !== null,
  };
}

/**
 * The opaque account fingerprint only — used for grouping sessions by
 * account. Prefer `providerAccountIdentity(...)` for anything rendered.
 */
export function accountFingerprint(metadata: Json | null): string | null {
  return providerAccountIdentity(metadata).fingerprint;
}

/**
 * The provider workspace/project name (e.g. the last path segment of the
 * Claude Code working directory, stamped by the bridge as `workspace_name`).
 * Tolerant: metadata root first, then nested `source_metadata`; null when
 * the session predates the contract or the provider reported nothing.
 */
export function workspaceName(metadata: Json | null): string | null {
  const root = record(metadata);
  const nested = root ? record(root.source_metadata ?? null) : null;
  return (
    firstIdentityValue(root, ["workspace_name"]) ??
    firstIdentityValue(nested, ["workspace_name"])
  );
}

export function recordedCapabilityLabels(capabilities: Json): string[] {
  const root = record(capabilities);
  if (!root) return [];
  const labels: string[] = [];
  if (root.append_native === true) labels.push("Append native ledger");
  if (root.native_resume === true) labels.push("Native resume recorded");
  if (root.native_fork === true) labels.push("Native fork recorded");
  return labels;
}
