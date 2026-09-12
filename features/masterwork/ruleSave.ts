/**
 * Landing an agent-staged rule into a Rulebook.
 *
 * THE ONE path a rule staged through the `rule_draft` surface write target
 * takes when the Expert presses Save on a lane route (`/masterwork/[id]/…`),
 * where the page holds no rules list of its own to save whole. It is the same
 * canonical CAS upsert the Improve verb's landing already uses
 * (`upsertRuleWithRetry`) — never a second write path — and it applies the same
 * review-verb merge as the detail page's editor save: SAVING AN EDIT IS NOT
 * APPROVING (Arman, 2026-08-17). A draft stays a draft until the Expert's own
 * Approve click.
 */

import { upsertRuleWithRetry } from "./service";
import { applyManualRuleEdit, type Rulebook, type RulebookRule } from "./types";

export async function saveEditedRule(opts: {
  rulebook: Rulebook;
  rule: RulebookRule;
  isNew: boolean;
}): Promise<Rulebook> {
  const previous = opts.isNew
    ? undefined
    : opts.rulebook.rules.find((rule) => rule.id === opts.rule.id);
  const merged = previous ? applyManualRuleEdit(previous, opts.rule) : opts.rule;
  return upsertRuleWithRetry({
    rulebookId: opts.rulebook.id,
    rule: merged,
  });
}
