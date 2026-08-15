import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { SeoCapabilitiesWorkspace } from "@/features/marketing/seo/capabilities/SeoCapabilitiesWorkspace";
import PageHeader from "@/features/shell/components/header/PageHeader";

export const metadata: Metadata = {
  title: "SEO Capabilities",
  description:
    "Browse the shared Marketing measurement catalogue and open evidence for any managed website.",
};

export default function MarketingCapabilitiesPage() {
  return (
    <>
      <PageHeader>
        <h1 className="truncate text-sm font-medium text-foreground">
          SEO Capabilities
        </h1>
      </PageHeader>
      <Suspense fallback={<LoadingSurface label="Loading SEO capabilities…" />}>
        <SeoCapabilitiesWorkspace />
      </Suspense>
    </>
  );
}
