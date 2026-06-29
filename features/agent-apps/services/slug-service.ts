/**
 * Agent App Slug Service
 *
 * Utilities for generating, validating, and managing agent-app slugs.
 * Reuses the `validate_slugs` RPC, which checks slug format and availability
 * against `app.definition`.
 */

import { createClient } from "@/utils/supabase/client";
import type { DbRpcRow } from "@/types/supabase-rpc";

const supabase = createClient();

export function generateSlugCandidates(appName: string): string[] {
  const cleanName = appName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);

  const candidates: string[] = [];

  candidates.push(cleanName);

  const withAppSuffix = `${cleanName.substring(0, 46)}-app`;
  if (withAppSuffix !== cleanName) {
    candidates.push(withAppSuffix);
  }

  const withMyPrefix = `my-${cleanName.substring(0, 47)}`;
  if (withMyPrefix !== cleanName) {
    candidates.push(withMyPrefix);
  }

  const withAgentPrefix = `agent-${cleanName.substring(0, 43)}`;
  if (withAgentPrefix !== cleanName && withAgentPrefix !== withMyPrefix) {
    candidates.push(withAgentPrefix);
  }

  const randomCode = Math.floor(100 + Math.random() * 900);
  candidates.push(`${cleanName.substring(0, 46)}-${randomCode}`);

  return candidates;
}

/** @deprecated Prefer generateSlugCandidates + validateSlugsInBatch. */
export function generateAppSlug(appName: string): string {
  const candidates = generateSlugCandidates(appName);
  return candidates[candidates.length - 1];
}

interface SlugValidationResult {
  slug: string;
  is_available: boolean;
  is_format_valid: boolean;
  error: string | null;
}
type _CheckSlugValidationResult = SlugValidationResult extends DbRpcRow<"validate_slugs">
  ? true
  : false;
declare const _slugValidationResult: _CheckSlugValidationResult;
true satisfies typeof _slugValidationResult;

interface BatchSlugValidationResult {
  valid: SlugValidationResult[];
  invalid: SlugValidationResult[];
  available: string[];
}

export async function isSlugAvailable(slug: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("validate_slugs", {
      slug_array: [slug],
    });

    if (error) throw error;
    if (!data || data.length === 0) return false;

    const result = (data as unknown as SlugValidationResult[])[0];
    return result.is_format_valid && result.is_available;
  } catch (error) {
    console.error("Error checking slug availability:", error);
    throw error;
  }
}

export async function validateSlugsInBatch(
  slugs: string[],
): Promise<BatchSlugValidationResult> {
  if (!Array.isArray(slugs) || slugs.length === 0 || slugs.length > 5) {
    throw new Error("Provide between 1 and 5 slugs");
  }

  try {
    const { data, error } = await supabase.rpc("validate_slugs", {
      slug_array: slugs,
    });

    if (error) throw error;

    const results = (data as unknown as SlugValidationResult[]) || [];

    const valid = results.filter((r) => r.is_format_valid);
    const invalid = results.filter((r) => !r.is_format_valid);
    const available = valid.filter((r) => r.is_available).map((r) => r.slug);

    return { valid, invalid, available };
  } catch (error) {
    console.error("Error validating slugs:", error);
    throw error;
  }
}
