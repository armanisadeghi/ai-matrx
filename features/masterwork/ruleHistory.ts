// features/masterwork/ruleHistory.ts
//
// 🚨 THE PRIOR POSITION — the client half of the server's
// `rulebook_writes.push_rule_history`.
//
// Arman's expertise mandate (2026-09-12): divergent approaches and dissent are
// RETAINED and navigable, never collapsed. A machine-authored rewrite that
// lands on a rule takes the Expert's earlier position with it unless the words
// it replaces are kept on the rule itself.
//
// This is for MACHINE-AUTHORED rewrites the Expert accepts (a Final Checkup
// suggestion, a lane's correction) — not for the Expert typing their own edit
// in the rule editor: the Rulebook row's version history already holds those,
// and the words are theirs either way.

import type { RulebookRule } from "./types";

/** Mirrors the server's `RULE_HISTORY_MAX`. */
export const RULE_HISTORY_MAX = 20;

/**
 * Append the words `rule` currently states to its history, in place, BEFORE
 * the new statement is applied. No-op (returns false) on a rule with no
 * statement. Bounded like the server's.
 */
export function pushRuleHistory(
  rule: RulebookRule,
  opts: { reason: string; changedBy: string; at?: string },
): boolean {
  const statement = (rule.statement ?? "").trim();
  if (!statement) return false;
  const entry = {
    statement,
    ...(rule.rationale?.trim() ? { rationale: rule.rationale.trim() } : {}),
    changed_at: opts.at ?? new Date().toISOString(),
    changed_by: opts.changedBy,
    reason: opts.reason,
  };
  rule.history = [...(rule.history ?? []), entry].slice(-RULE_HISTORY_MAX);
  return true;
}
