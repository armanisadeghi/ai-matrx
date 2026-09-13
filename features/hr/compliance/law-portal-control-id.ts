/**
 * DOM identity belongs to a rendered rule row. Decision identity remains the
 * class × jurisdiction pair handled separately by `decisionKey`.
 */
export function platformRuleAppliesControlId(rule: {
  id: string;
  rule_class: string;
  jurisdiction_key: string;
}): string {
  return `applies-${rule.rule_class}-${rule.jurisdiction_key}-${rule.id}`;
}
