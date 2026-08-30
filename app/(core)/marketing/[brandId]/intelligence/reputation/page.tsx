// app/(core)/marketing/[brandId]/intelligence/reputation/page.tsx
//
// Reputation is answered per WEBSITE, so the brand-level route is a chooser
// over this brand's sites — never a second copy of the workspace.

import type { Metadata } from "next";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { BrandReputationSites } from "@/features/marketing/components/reputation/BrandReputationSites";

export const metadata: Metadata = {
  title: "Reputation",
  description:
    "Evidence-backed publication opportunities and reputation handling decisions, per website.",
};

export default function BrandReputationPage() {
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center">
          <h1 className="truncate text-sm font-medium text-foreground">
            Reputation
          </h1>
        </div>
      </PageHeader>
      <BrandReputationSites />
    </>
  );
}
