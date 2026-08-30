// Reserved brand-workspace route. Body, copy, and status come from the shared
// placeholder — see features/marketing/components/MarketingComingSoon.tsx.
// The promise is tracked as `marketing.calendar` in lib/coming-soon/registry.ts.

import { MarketingComingSoon } from "@/features/marketing/components/MarketingComingSoon";

export default function BrandCalendarPage() {
  return <MarketingComingSoon comingSoonId="marketing.calendar" />;
}
