/**
 * Pure validation + merge logic for the `matrx-user/marketing-brand` write
 * targets. Lives outside the React component so the part that can silently
 * destroy a client's brand profile — the sub-key merge — is unit-testable.
 *
 * The rule these functions exist to enforce: `web.brand.profile` is ONE jsonb
 * column holding a nested object, and `updateBrand` replaces that column
 * wholesale. A patch that carried only the sub-keys an agent named would erase
 * every field it did not mention. So each target builds a NARROW patch of just
 * its own sub-keys, and `mergeBrandProfile` lays that over the brand's current
 * profile before anything is written.
 *
 * Validation THROWS on a bad shape rather than coercing — the writeback seam
 * turns a throw into an error envelope the agent reads and can correct.
 */

import type { BrandProfile } from "@/features/marketing/types";

export function asRecord(
  value: unknown,
  target: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${target} expects an object value.`);
  }
  return value as Record<string, unknown>;
}

function optionalString(
  obj: Record<string, unknown>,
  key: string,
  target: string,
): string | undefined {
  const raw = obj[key];
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") {
    throw new Error(`${target}: ${key} must be a string when provided.`);
  }
  const trimmed = raw.trim();
  return trimmed || undefined;
}

function requiredString(
  obj: Record<string, unknown>,
  key: string,
  target: string,
): string {
  const value = optionalString(obj, key, target);
  if (!value) {
    throw new Error(`${target}: ${key} is required and must be non-empty.`);
  }
  return value;
}

/**
 * A replace-the-full-set list field. Throws on anything that is not an array
 * of strings — a wrong shape is the agent's error to hear about, not something
 * to quietly coerce. Blank entries are dropped (matching `parseBrandProfile`);
 * an empty resulting list clears the field.
 */
function requiredStringList(
  obj: Record<string, unknown>,
  key: string,
  target: string,
): string[] {
  const raw = obj[key];
  if (!Array.isArray(raw)) {
    throw new Error(
      `${target}: ${key} must be an array of strings (it replaces the full set).`,
    );
  }
  const items: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") {
      throw new Error(`${target}: every ${key} entry must be a string.`);
    }
    const trimmed = entry.trim();
    if (trimmed) items.push(trimmed);
  }
  return items;
}

/** `brand_profile_voice` — the editorial triad, drafted as one act. */
export function buildVoicePatch(value: unknown): Partial<BrandProfile> {
  const target = "brand_profile_voice";
  const obj = asRecord(value, target);
  const audience = optionalString(obj, "audience", target);
  const voiceTone = optionalString(obj, "voice_tone", target);
  const positioning = optionalString(obj, "positioning", target);
  if (
    audience === undefined &&
    voiceTone === undefined &&
    positioning === undefined
  ) {
    throw new Error(
      `${target}: provide at least one of audience, voice_tone, positioning.`,
    );
  }
  // Only the fields actually supplied enter the patch — an omitted field keeps
  // its current text rather than being cleared.
  return {
    ...(audience !== undefined ? { audience } : {}),
    ...(voiceTone !== undefined ? { voice_tone: voiceTone } : {}),
    ...(positioning !== undefined ? { positioning } : {}),
  };
}

/** `brand_profile_offerings` — replaces the full list. */
export function buildOfferingsPatch(value: unknown): Partial<BrandProfile> {
  const target = "brand_profile_offerings";
  const obj = asRecord(value, target);
  return { offerings: requiredStringList(obj, "offerings", target) };
}

/** `brand_profile_competitors` — replaces the full list. */
export function buildCompetitorsPatch(value: unknown): Partial<BrandProfile> {
  const target = "brand_profile_competitors";
  const obj = asRecord(value, target);
  return { competitors: requiredStringList(obj, "competitors", target) };
}

/** `brand_profile_content_guidelines` — replaces the full text. */
export function buildContentGuidelinesPatch(
  value: unknown,
): Partial<BrandProfile> {
  const target = "brand_profile_content_guidelines";
  const obj = asRecord(value, target);
  return {
    content_guidelines: requiredString(obj, "content_guidelines", target),
  };
}

/**
 * Lay a target's narrow patch over the brand's CURRENT profile. This is the
 * step that keeps a voice rewrite from deleting the offerings list.
 */
export function mergeBrandProfile(
  current: BrandProfile,
  patch: Partial<BrandProfile>,
): BrandProfile {
  return { ...current, ...patch };
}
