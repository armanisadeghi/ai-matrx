/**
 * Pure validation + merge core for the `matrx-user/marketing-brand` write
 * targets (`brand_profile`, `brand_identity`). Kept free of React/services so
 * the destructive failure mode — a profile write that silently drops the rest
 * of the client's brand profile jsonb — is provable in unit tests
 * (`brand-write-targets.test.ts`).
 *
 * Contract (mirrors the manifest target descriptions exactly):
 * - `brand_profile` value is a PARTIAL BrandProfile. Omitted fields keep
 *   their current value. An empty string / empty array CLEARS the field.
 *   List fields replace the FULL list. Unknown keys throw — an agent's typo
 *   must be heard, never coerced away.
 * - `brand_identity` value is `{ industry?, description? }`. Omitted keeps,
 *   empty string clears (→ null). The brand NAME is human-owned: not a key.
 *
 * The component seam (`MarketingBrandWriteTargets.tsx`) feeds the results to
 * the canonical `updateBrand` under the version guard.
 */

import type { BrandProfile } from "@/features/marketing/types";

export const BRAND_PROFILE_WRITE_STRING_KEYS = [
  "audience",
  "voice_tone",
  "positioning",
  "service_area",
  "content_guidelines",
  "notes",
] as const;

export const BRAND_PROFILE_WRITE_LIST_KEYS = [
  "value_props",
  "offerings",
  "competitors",
  "target_keywords",
] as const;

function asRecord(value: unknown, target: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${target} expects an object value.`);
  }
  return value as Record<string, unknown>;
}

/**
 * Validate a `brand_profile` write value and merge it over the CURRENT
 * parsed profile. Returns the merged BrandProfile ready for
 * `brandProfileToJson`. Throws on any contract break.
 */
export function mergeBrandProfileWrite(
  current: BrandProfile,
  value: unknown,
): BrandProfile {
  const obj = asRecord(value, "brand_profile");
  const allowed = new Set<string>([
    ...BRAND_PROFILE_WRITE_STRING_KEYS,
    ...BRAND_PROFILE_WRITE_LIST_KEYS,
  ]);
  const unknown = Object.keys(obj).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new Error(
      `brand_profile: unknown field(s) ${unknown.join(", ")}. Allowed: ${[...allowed].join(", ")}.`,
    );
  }
  if (Object.keys(obj).length === 0) {
    throw new Error("brand_profile: provide at least one profile field.");
  }
  const merged: BrandProfile = { ...current };
  for (const key of BRAND_PROFILE_WRITE_STRING_KEYS) {
    const raw = obj[key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== "string") {
      throw new Error(`brand_profile: ${key} must be a string.`);
    }
    const trimmed = raw.trim();
    if (trimmed) merged[key] = trimmed;
    else delete merged[key];
  }
  for (const key of BRAND_PROFILE_WRITE_LIST_KEYS) {
    const raw = obj[key];
    if (raw === undefined || raw === null) continue;
    if (!Array.isArray(raw) || raw.some((entry) => typeof entry !== "string")) {
      throw new Error(`brand_profile: ${key} must be a string array.`);
    }
    const items = raw.map((entry) => entry.trim()).filter(Boolean);
    if (items.length) merged[key] = items;
    else delete merged[key];
  }
  return merged;
}

export interface BrandIdentityPatch {
  industry?: string | null;
  description?: string | null;
}

/**
 * Validate a `brand_identity` write value into an `updateBrand` patch.
 * Throws on any contract break — including the human-owned brand name.
 */
export function validateBrandIdentityWrite(value: unknown): BrandIdentityPatch {
  const obj = asRecord(value, "brand_identity");
  const unknown = Object.keys(obj).filter(
    (key) => key !== "industry" && key !== "description",
  );
  if (unknown.length > 0) {
    throw new Error(
      `brand_identity: unknown field(s) ${unknown.join(", ")}. Allowed: industry, description. The brand name is human-owned.`,
    );
  }
  const patch: BrandIdentityPatch = {};
  for (const key of ["industry", "description"] as const) {
    const raw = obj[key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== "string") {
      throw new Error(`brand_identity: ${key} must be a string.`);
    }
    // Empty string is the documented "clear this field" signal → null.
    patch[key] = raw.trim() || null;
  }
  if (Object.keys(patch).length === 0) {
    throw new Error("brand_identity: provide industry and/or description.");
  }
  return patch;
}
