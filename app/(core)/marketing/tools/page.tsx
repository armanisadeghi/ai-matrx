// app/(core)/marketing/tools/page.tsx
//
// In-app index of the public SEO utilities. The tools themselves stay on
// `/seo/*` in the (public) route group — they are anonymous lead-gen surfaces
// and must render without a session. This page just makes them findable from
// inside the product instead of only from the public marketing site.

import PageHeader from "@/features/shell/components/header/PageHeader";
import { MarketingHub } from "@/features/marketing/components/MarketingHub";
import { MARKETING_PUBLIC_TOOLS } from "@/features/marketing/lib/marketing-nav";

export default function MarketingToolsPage() {
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center">
          <h1 className="truncate text-sm font-medium text-foreground">
            SEO Tools
          </h1>
        </div>
      </PageHeader>
      <div className="h-full overflow-hidden">
        <MarketingHub
          pillars={[
            {
              key: "public-tools",
              label: "Analyzers",
              description:
                "Run against any public URL — no brand or site setup required. Each opens in a new tab.",
              iconName: "Wrench",
              entries: MARKETING_PUBLIC_TOOLS,
            },
          ]}
        />
      </div>
    </>
  );
}
