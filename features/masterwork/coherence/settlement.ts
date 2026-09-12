// features/masterwork/coherence/settlement.ts
//
// 🚨 WHAT A RULING LEAVES ON THE RULES — the client half, byte-for-byte the
// server's `rulebook_writes.link_disagreement` / `stamp_settled`.
//
// Arman's expertise mandate (2026-09-12): "Surface, retain, and make navigable
// divergent approaches, dissent, and controversy. Allow for multiple 'schools
// of thought'… without collapsing them into consensus."
//
// Before this, settling a contradiction as "both are right" wrote the Expert's
// words into `metadata.coherence.tensions[].answer` — a string in a metadata
// blob. The two rules were not linked, so a reader who opened either one alone
// saw no sign the other existed, and nothing on the rules said a human had
// ruled at all.
//
// What these functions do, and the three things they never do:
//   - `accepted` ("both are right") links every rule the question named to
//     every other one with `disagrees_with`, ON BOTH SIDES, carrying the
//     condition the Expert gave, and stamps `settled_by` / `settled_at`.
//   - `answered` stamps the ruling only.
//   - They never edit a word of a rule, never remove one, and never touch
//     `draft`. Both positions stand — that is the entire point.

import type { RulebookRule } from "../types";

/** Cap mirrors the server's `_RELATION_CONDITION_CAP`. */
const CONDITION_CAP = 400;

export const DISAGREEMENT_KIND = "disagrees_with" as const;

export interface SettlementStamp {
  /** The Expert's plain words for what separates the positions. May be empty:
   * "they both hold" is a real, final answer. */
  condition?: string;
  /** The `auth.users` id of the person ruling. */
  settledBy?: string;
  /** ISO timestamp; injected so a test and a write agree. */
  at: string;
}

/**
 * Keep BOTH positions and link them. Returns a NEW rules array (the rows it
 * touches are copied — never mutated in place, so a caller's state is safe).
 */
export function linkDisagreement(
  rules: readonly RulebookRule[],
  ruleIds: readonly string[],
  stamp: SettlementStamp,
): RulebookRule[] {
  const wanted = ruleIds.filter((id) => id.length > 0);
  const present = new Set(
    rules.filter((r) => wanted.includes(r.id)).map((r) => r.id),
  );
  if (present.size < 2) return stampSettled(rules, ruleIds, stamp);
  const condition = (stamp.condition ?? "").trim().slice(0, CONDITION_CAP);

  return rules.map((rule) => {
    if (!present.has(rule.id)) return rule;
    const relations = [...(rule.relates_to ?? [])];
    for (const other of wanted) {
      if (other === rule.id || !present.has(other)) continue;
      const at = relations.findIndex(
        (r) => r.rule_id === other && r.kind === DISAGREEMENT_KIND,
      );
      const entry = {
        ...(at >= 0 ? relations[at] : { rule_id: other, kind: DISAGREEMENT_KIND }),
        ...(condition ? { condition } : {}),
      };
      if (at >= 0) relations[at] = entry;
      else relations.push(entry);
    }
    return {
      ...rule,
      relates_to: relations,
      settled_at: stamp.at,
      ...(stamp.settledBy ? { settled_by: stamp.settledBy } : {}),
    };
  });
}

/** Stamp WHO ruled and WHEN, with no link — the `answered` outcome. */
export function stampSettled(
  rules: readonly RulebookRule[],
  ruleIds: readonly string[],
  stamp: SettlementStamp,
): RulebookRule[] {
  const wanted = new Set(ruleIds.filter((id) => id.length > 0));
  return rules.map((rule) =>
    wanted.has(rule.id)
      ? {
          ...rule,
          settled_at: stamp.at,
          ...(stamp.settledBy ? { settled_by: stamp.settledBy } : {}),
        }
      : rule,
  );
}

/**
 * THE ONE mapping from an outcome to what it writes on the rules.
 * `dismissed` writes nothing — the Expert said there was nothing here.
 */
export function applySettlement(
  rules: readonly RulebookRule[],
  ruleIds: readonly string[],
  outcome: "answered" | "accepted" | "dismissed",
  stamp: SettlementStamp,
): RulebookRule[] | null {
  if (outcome === "dismissed" || ruleIds.length === 0) return null;
  return outcome === "accepted"
    ? linkDisagreement(rules, ruleIds, stamp)
    : stampSettled(rules, ruleIds, stamp);
}
