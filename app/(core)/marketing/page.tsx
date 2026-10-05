// app/(core)/marketing/page.tsx
//
// The Marketing hub. This used to `redirect("/marketing/brands")`, which made
// websites look like the whole feature and hid content planning, keyword
// research, and the tool suite. `/marketing` is now a real list view of every
// pillar — per the "feature entry pages are LIST views" rule in CLAUDE.md.

import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { MarketingHub } from "@/features/marketing/components/MarketingHub";
import { MARKETING_PILLARS } from "@/features/marketing/lib/marketing-nav";
import { MandateDoorLink } from "@/features/mandates/components/MandateDoorLink";

export default function MarketingPage() {
  return (
    <>
      <RecordPageHeader record={{ name: "Marketing" }} />
      <MandateDoorLink feature="seo" label="Marketing & SEO agents" className="ml-auto" />
      <div className="h-full overflow-hidden">
        <MarketingHub pillars={MARKETING_PILLARS} />
      </div>
    </>
  );
}
