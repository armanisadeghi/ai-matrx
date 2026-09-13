import type { HrPlatformLawRule } from "../types";

/**
 * A rule can only "apply" when it reaches this employer. The all-rules disclosure
 * deliberately shows the rest of the library, so calling those rows "applies" is
 * false even when their status is active.
 */
export function ruleClassSummary(
  rules: HrPlatformLawRule[],
  reachesOrganization: boolean,
): string {
  if (!reachesOrganization) return `${rules.length} tracked`;
  return `${rules.filter((rule) => !rule.opted_out).length} applies`;
}
