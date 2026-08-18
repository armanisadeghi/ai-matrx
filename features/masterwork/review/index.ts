// features/masterwork/review/ — THE shared rule-decision primitive.
//
// Any surface that presents an AI-proposed rule for a human decision consumes
// BOTH of these: `RuleDecisionActions` (the four verbs — Approve / Improve /
// Reject / Edit, all four required) and `useRuleImproveRun` (the ONE
// `masterwork.rule_improver` runner; there is no second improve path).
//
// Consumers today: the Rulebook rule rows, the one-by-one review wizard, the
// Improve dialog's own before/after, the Add-rule window's "With AI" tab, the
// Rule Editor's "Clean up with AI", and the Final Checkup.

export {
  RuleDecisionActions,
  type RuleDecisionActionsProps,
  type RuleDecisionVerb,
} from "./RuleDecisionActions";
export {
  useRuleImproveRun,
  type RuleImproveFields,
  type RuleImproveRunRequest,
  type UseRuleImproveRun,
  type UseRuleImproveRunConfig,
} from "./useRuleImproveRun";
