// Reserved brand-workspace route. Body, copy, and status come from the shared
// placeholder — see features/marketing/components/MarketingComingSoon.tsx.
// The promise is tracked as `marketing.analytics` in lib/coming-soon/registry.ts
// and the section is declared in features/marketing/lib/brand-sections.ts.

import { MarketingComingSoon } from "@/features/marketing/components/MarketingComingSoon";

export default function BrandAnalyticsPage() {
  return <MarketingComingSoon comingSoonId="marketing.analytics" />;
}
