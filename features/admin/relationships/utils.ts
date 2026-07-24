// features/admin/relationships/utils.ts
//
// Pure data helpers for the Relationship Manager — no React, no Supabase.
// buildOrbitGraph derives the "what does this entity type touch" view from
// the same admin_relationship_rules() rows the registry table already has,
// so the entity explorer needs no extra RPC. The shape here is deliberately
// generic (token + rule, not x/y positions) so a future React Flow canvas
// (agents/sets-style thin shell + `dynamic({ ssr: false })` Impl) can consume
// it directly without a rewrite.

import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import type { RelationshipProblem, RelationshipRule } from "./types";

/** Stable identity for a rule row — the (source, target, label) natural key. */
export function ruleKey(rule: RelationshipRule): string {
  return `${rule.source_type}:${rule.target_type}:${rule.label ?? ""}`;
}

export function label(token: string): string {
  return tryGetEntityInfo(token)?.label ?? token;
}

export function plural(text: string): string {
  return text.endsWith("s") ? text : `${text}s`;
}

/** Plain-language sentence for a rule — shown on demand, never as a table cell. */
export function ruleSentence(rule: {
  source_type: string;
  target_type: string;
  label: string | null;
  container_side: string;
  conveys_max: string;
  is_active: boolean;
}): string {
  const src = label(rule.source_type);
  const tgt = label(rule.target_type);
  const lbl = rule.label ? ` (label "${rule.label}")` : "";
  const inactive = rule.is_active ? "" : " [inactive]";
  if (rule.container_side === "target") {
    return `${tgt} contains ${src}${lbl} — sharing a ${tgt} grants up to ${rule.conveys_max} on its ${plural(src)}.${inactive}`;
  }
  if (rule.container_side === "source") {
    return `${src} contains ${tgt}${lbl} — sharing a ${src} grants up to ${rule.conveys_max} on its ${plural(tgt)}.${inactive}`;
  }
  return `${src} ↔ ${tgt}${lbl} — known relationship, conveys no access.${inactive}`;
}

export const RELATIONSHIPS_LOCATION =
  "AI Matrx Admin — Relationship Manager (/administration/database/relationships)";

export const PROBLEM_TITLES: Record<string, string> = {
  unregistered_pair: "Unregistered pair",
  wrong_way_edges: "Wrong-way edges",
  conveying_container_not_shareable: "Container not shareable",
  conveying_rule_no_edges: "Conveying rule, no edges",
  inactive_rule_with_edges: "Inactive rule, live edges",
};

export function problemHuman(p: RelationshipProblem): string {
  const title = PROBLEM_TITLES[p.kind] ?? p.kind;
  return [
    `[${p.severity}] ${title}`,
    `${p.source_type} → ${p.target_type}${p.label ? ` (label "${p.label}")` : ""}`,
    p.detail,
    p.edge_count > 0 ? `edges=${p.edge_count}` : null,
    p.container_side ? `container_side=${p.container_side}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

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
