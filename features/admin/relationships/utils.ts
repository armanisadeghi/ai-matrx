// features/admin/relationships/utils.ts
//
// Pure data helpers for the Relationship Manager — no React, no Supabase.
// buildOrbitGraph derives the "what does this entity type touch" view from
// the same admin_relationship_rules() rows the registry table already has,
// so the entity explorer needs no extra RPC. The shape here is deliberately
// generic (token + rule, not x/y positions) so a future React Flow canvas
// (agents/sets-style thin shell + `dynamic({ ssr: false })` Impl) can consume
// it directly without a rewrite.

import type { RelationshipRule } from "./types";

export interface OrbitNeighbor {
  /** The neighboring entity-type token (not the center). */
  token: string;
  /** The full rule row connecting neighbor ↔ center. */
  rule: RelationshipRule;
  /**
   * From the center's point of view: "incoming" = this rule's target is the
   * center (the neighbor is content that lives in / targets the center);
   * "outgoing" = this rule's source is the center (the center targets the
   * neighbor).
   */
  direction: "incoming" | "outgoing";
}

export interface OrbitGraph {
  center: string;
  /** Rules where target_type === center — things that target this entity. */
  sources: OrbitNeighbor[];
  /** Rules where source_type === center — things this entity targets. */
  targets: OrbitNeighbor[];
}

/**
 * Sources (left) → focus (center) → targets (right), per the Relationship
 * Manager's canonical SMALL → LARGE / source → target convention.
 */
export function buildOrbitGraph(
  token: string,
  rules: RelationshipRule[],
): OrbitGraph {
  const sources: OrbitNeighbor[] = rules
    .filter((r) => r.target_type === token)
    .map((r) => ({ token: r.source_type, rule: r, direction: "incoming" }));

  const targets: OrbitNeighbor[] = rules
    .filter((r) => r.source_type === token)
    .map((r) => ({ token: r.target_type, rule: r, direction: "outgoing" }));

  return { center: token, sources, targets };
}

/** Every distinct entity-type token that appears as a source or target in the
 *  current rule set — the candidate list for the explorer's entity dropdown. */
export function tokensInRules(rules: RelationshipRule[]): string[] {
  const set = new Set<string>();
  for (const r of rules) {
    set.add(r.source_type);
    set.add(r.target_type);
  }
  return Array.from(set).sort();
}
