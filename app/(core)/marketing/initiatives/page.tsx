// Reserved Marketing route. Body, copy, and status come from the shared
// placeholder — see features/marketing/components/MarketingComingSoon.tsx.
// The promise is tracked as `marketing.initiatives` in lib/coming-soon/registry.ts.
//
// Named "initiative", not "campaign": `crm.campaign` is a worked outreach list
// (members with status + next attempt), a different thing entirely, and a table
// name may repeat across schemas only when it means the same role —
// common-docs/systems/db-rules/FEATURE.md §1a. /marketing/campaigns 308s here.

import { MarketingComingSoon } from "@/features/marketing/components/MarketingComingSoon";

export default function Page() {
  return <MarketingComingSoon comingSoonId="marketing.initiatives" />;
}
