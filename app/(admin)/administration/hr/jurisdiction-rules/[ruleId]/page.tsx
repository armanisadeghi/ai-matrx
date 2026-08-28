// HR & Employment Law › Jurisdiction rule detail (SPEC-UI-IA §3.12 route 85a).
//
// The rule's full record and THE PROMOTE/DEMOTE CONTROL (D25). Read-only for
// rule content; status is the only thing this surface changes, and only through
// hr_jurisdiction_rule_set_status.

import { JurisdictionRuleDetailClient } from "@/features/admin/hr/jurisdiction-rules/components/JurisdictionRuleDetailClient";

export default async function JurisdictionRuleDetailPage({
  params,
}: {
  params: Promise<{ ruleId: string }>;
}) {
  const { ruleId } = await params;
  return <JurisdictionRuleDetailClient ruleId={ruleId} />;
}
