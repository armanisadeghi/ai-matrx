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

export const NO_ACCOUNT_IDENTITY = "No account identity reported";

export interface ProviderAccountIdentity {
  /** Display-safe label the provider exposed through a supported seam. */
  label: string | null;
  /** Opaque non-secret account fingerprint/key for grouping and equality. */
  fingerprint: string | null;
  /** What a UI should render: label, else fingerprint, else the honest absence. */
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
 * Prefers the display-safe `provider_account_label` when present, falls back
 * to the opaque fingerprint keys (canonical `provider_account_key`, then the
 * historical `provider_account_fingerprint` / `account_fingerprint`), and
 * never renders emails, tokens, or arbitrary metadata. Both the metadata root
 * and the nested `source_metadata` record are honored.
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
  return {
    label,
    fingerprint,
    display: label ?? fingerprint ?? NO_ACCOUNT_IDENTITY,
    reported: label !== null || fingerprint !== null,
  };
}

/**
 * The opaque account fingerprint only — used for grouping sessions by
 * account. Prefer `providerAccountIdentity(...)` for anything rendered.
 */
export function accountFingerprint(metadata: Json | null): string | null {
  return providerAccountIdentity(metadata).fingerprint;
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
