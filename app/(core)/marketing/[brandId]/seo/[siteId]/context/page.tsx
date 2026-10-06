import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { SiteContextWorkspace } from "@/features/marketing/seo/site-context/SiteContextWorkspace";

/**
 * The site's context: every fact an agent is given about this site (goals, key
 * pages and their roles, competitors, voice, the person's SEO expertise), each
 * opening its own editor, and "What agents see". Brand and site come from the
 * SEO site layout's provider.
 */
export default function MarketingSeoContextPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading site context…" />}>
      <SiteContextWorkspace />
    </Suspense>
  );
}
