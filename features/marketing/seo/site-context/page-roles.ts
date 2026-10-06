// features/marketing/seo/site-context/page-roles.ts — what a stored page role
// MEANS against the organization's vocabulary, for the context page.
//
// The client twin of aidream `services/seo/page_roles.py` (`vocabulary_from_knobs`,
// `read_page_role`): the allowed list is knob `seo.site.page_roles`, older words map
// through knob `seo.site.page_role_aliases`, and a word outside both is KEPT as
// recorded and offered a replacement — validation offers, never blocks. Same rules,
// same order, so the screen and the agent read a role identically.
//
// Also the one place that builds the keyword_plan patch for a role change: it
// keeps every other key of the stored slice (agent-written fields included),
// because `updatePageDesiredValues` merges at the top level only.

import type { PageKeywordPlan } from "@/features/marketing/types";

export interface PageRoleVocabulary {
  allowed: string[];
  aliases: Record<string, string>;
}

export type PageRoleReading =
  | { kind: "none"; stored: ""; role: null }
  | { kind: "allowed"; stored: string; role: string }
  /** An older word the alias knob maps onto an allowed role. */
  | { kind: "alias"; stored: string; role: string }
  /** Neither allowed nor an alias: kept exactly as recorded, never rewritten. */
  | { kind: "outside"; stored: string; role: string };

function clean(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function vocabularyFromKnobs(roles: unknown, aliases: unknown): PageRoleVocabulary {
  const allowed = Array.from(
    new Set((Array.isArray(roles) ? roles : []).map(clean).filter(Boolean)),
  );
  const aliasMap: Record<string, string> = {};
  if (aliases && typeof aliases === "object" && !Array.isArray(aliases)) {
    for (const [k, v] of Object.entries(aliases as Record<string, unknown>)) {
      if (clean(k) && clean(v)) aliasMap[clean(k)] = clean(v);
    }
  }
  return { allowed, aliases: aliasMap };
}

export function readPageRole(stored: unknown, vocab: PageRoleVocabulary): PageRoleReading {
  const raw = String(stored ?? "").trim();
  const word = raw.toLowerCase();
  if (!word) return { kind: "none", stored: "", role: null };
  if (vocab.allowed.includes(word)) return { kind: "allowed", stored: raw, role: word };
  const target = vocab.aliases[word];
  if (target && vocab.allowed.includes(target)) return { kind: "alias", stored: raw, role: target };
  return { kind: "outside", stored: raw, role: raw };
}

/** The stored keyword_plan slice of one page's desired_values, or `{}`. */
export function keywordPlanOf(desiredValues: unknown): Record<string, unknown> {
  if (!desiredValues || typeof desiredValues !== "object" || Array.isArray(desiredValues)) return {};
  const plan = (desiredValues as Record<string, unknown>).keyword_plan;
  return plan && typeof plan === "object" && !Array.isArray(plan)
    ? { ...(plan as Record<string, unknown>) }
    : {};
}

/**
 * The `keyword_plan` value to write so the page's role becomes `role` (`null`
 * clears it). Every other key of the slice is kept; a slice left empty is
 * removed (`undefined`), matching `seoPlanToSlice`.
 */
export function keywordPlanWithRole(
  current: Record<string, unknown>,
  role: string | null,
): PageKeywordPlan | undefined {
  const next: Record<string, unknown> = { ...current };
  const word = role?.trim() ?? "";
  if (word) next.page_role = word;
  else delete next.page_role;
  return Object.keys(next).length ? (next as PageKeywordPlan) : undefined;
}
