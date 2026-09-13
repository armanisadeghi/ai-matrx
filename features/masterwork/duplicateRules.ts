/**
 * THE RULEBOOK NEVER HOLDS THE SAME RULE TWICE.
 *
 * ── THE DEFECT THIS CLOSES (Expert Book Challenge wall W50, 2026-09-12) ────
 * The Conductor staged a rule into the Add-rule dialog, the Expert pressed
 * "Add rule", the rule landed (116 rules, v13) — and the dialog was still on
 * screen, still prefilled, with the button still live. A second press would
 * have added the identical rule a second time, and nothing on screen said the
 * first press had worked.
 *
 * A confirmation is UI. The rule that makes the duplicate impossible has to
 * live on the WRITE PATH, because every add lane (the editor dialog, the
 * Add-rule window's two tabs, an agent-staged draft landing through
 * `saveEditedRule`) reaches the same rules column, and a dialog that closes
 * politely fixes exactly one of them.
 *
 * WHAT COUNTS AS THE SAME RULE: the same name AND the same statement, compared
 * with whitespace collapsed, case ignored, and typographic quotes folded —
 * because a rule re-staged by an agent comes back character-identical apart
 * from exactly those. Nothing looser: two rules that share a name but say
 * different things are two real rules, and the Expert is allowed both.
 */

import type { RulebookRule } from "./types";

/** Whitespace collapsed, case folded, curly quotes and dashes normalised. */
export function normalizeRuleText(value: string | undefined | null): string {
  return (value ?? "")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export interface RuleIdentity {
  name: string;
  statement: string;
}

/**
 * The rule already in `rules` that is word-for-word this one, or null.
 *
 * `exceptId` is the rule being EDITED — a rule is never a duplicate of
 * itself, and saving an edit that changes nothing must still be allowed.
 */
export function findIdenticalRule(
  rules: readonly RulebookRule[],
  candidate: RuleIdentity,
  exceptId?: string,
): RulebookRule | null {
  const name = normalizeRuleText(candidate.name);
  const statement = normalizeRuleText(candidate.statement);
  if (!name || !statement) return null;
  return (
    rules.find(
      (rule) =>
        rule.id !== exceptId &&
        normalizeRuleText(rule.name) === name &&
        normalizeRuleText(rule.statement) === statement,
    ) ?? null
  );
}

/**
 * The sentence a person reads when their add is refused. Plain, specific, and
 * it says what actually happened — not "duplicate key" and not a silent no-op.
 */
export function duplicateRuleMessage(existing: RulebookRule): string {
  return `"${existing.name}" is already in this Rulebook, word for word — nothing was added. Open that rule to change it instead.`;
}

/** Thrown by the write path; carries the rule that already says this. */
export class DuplicateRuleError extends Error {
  readonly existing: RulebookRule;
  constructor(existing: RulebookRule) {
    super(duplicateRuleMessage(existing));
    this.name = "DuplicateRuleError";
    this.existing = existing;
  }
}
