/**
 * Instance TITLE derivation — pure, importable from server and client code
 * (no supabase import; `instance-service.ts` consumes it on the write path).
 *
 * CROSS-REPO MIRROR: aidream `kind_instance.py` (`_TITLE_KEYS` +
 * `derive_title` + `kind_shared.kind_title_key`) implements the SAME
 * derivation order — explicit title → the kind's `metadata.title_key` field
 * (per-kind override, non-empty scalar) → the shared key list → null.
 * Change BOTH sides together.
 */

/** Mirrors aidream `kind_instance._TITLE_KEYS` — keep the two in lockstep. */
export const INSTANCE_TITLE_KEYS = [
  "title",
  "name",
  "label",
  "heading",
  "subject",
  "customer",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The kind's per-kind instance-title override —
 * `kind_definition.metadata.title_key` (a single data key naming the title
 * field, e.g. `wine_name`). Set by the creator agent via `kind_create`;
 * null when absent/blank/non-string. Server parity: `kind_shared.kind_title_key`.
 */
export function kindTitleKeyFromMetadata(metadata: unknown): string | null {
  if (!isRecord(metadata)) return null;
  const value = metadata["title_key"];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * A non-empty scalar rendered as a title string; null for anything else.
 * Mirrors the server `_scalar_title` exactly (booleans → "true"/"false").
 */
function scalarTitle(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  return null;
}

/**
 * Explicit title wins; else the kind's `metadata.title_key` field when it
 * holds a non-empty scalar; else the first non-empty string under a shared
 * title/name-ish key. The ORDER is a cross-repo contract — mirrored verbatim
 * by aidream `kind_instance.derive_title`.
 */
export function deriveInstanceTitle(
  data: Record<string, unknown>,
  explicit?: string | null,
  titleKey?: string | null,
): string | null {
  if (explicit && explicit.trim()) return explicit.trim();
  if (titleKey) {
    const override = scalarTitle(data[titleKey]);
    if (override) return override;
  }
  for (const key of INSTANCE_TITLE_KEYS) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
