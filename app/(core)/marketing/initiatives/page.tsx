// Reserved Marketing route. Body, copy, and status come from the shared
// placeholder — see features/marketing/components/MarketingComingSoon.tsx.
// The promise is tracked as `marketing.initiatives` in lib/coming-soon/registry.ts.
//
// Named "initiative", not "campaign": a table name may repeat across schemas
// only when it means the same role (common-docs/systems/db-rules/FEATURE.md
// §1a), and CRM's claimant on the word was never a marketing campaign — it was
// a worked outreach list (members with status + next attempt), now honestly
// named `crm.outreach_list`. The word is retired platform-wide; both old paths
// 308 (`/marketing/campaigns` here, `/crm/campaigns` → `/crm/outreach-lists`).

import { MarketingComingSoon } from "@/features/marketing/components/MarketingComingSoon";

export default function Page() {
  return <MarketingComingSoon comingSoonId="marketing.initiatives" />;
}
