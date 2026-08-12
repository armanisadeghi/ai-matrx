import type { Json } from "@/types/database.types";

function record(value: Json | null): Record<string, Json> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : null;
}

function nonEmptyString(value: Json | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * The provider account identifier is deliberately an opaque fingerprint, not
 * an email, access token, OAuth credential, or a dump of arbitrary metadata.
 */
export function accountFingerprint(metadata: Json | null): string | null {
  const root = record(metadata);
  if (!root) return null;
  const nested = record(root.source_metadata ?? null);
  return (
    nonEmptyString(root.provider_account_fingerprint) ??
    nonEmptyString(root.account_fingerprint) ??
    nonEmptyString(nested?.provider_account_fingerprint) ??
    nonEmptyString(nested?.account_fingerprint)
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
