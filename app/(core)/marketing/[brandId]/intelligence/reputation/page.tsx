// app/(core)/marketing/[brandId]/intelligence/reputation/page.tsx
//
// Reputation is answered per WEBSITE, so the brand-level route is a chooser
// over this brand's sites — never a second copy of the workspace.

import type { Metadata } from "next";

import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { BrandReputationSites } from "@/features/marketing/components/reputation/BrandReputationSites";

export const metadata: Metadata = {
  title: "Reputation",
  description:
    "Evidence-backed publication opportunities and reputation handling decisions, per website.",
};

export default function BrandReputationPage() {
  return (
    <>
      <RecordPageHeader record={{ name: "Reputation" }} />
      <BrandReputationSites />
    </>
  );
}
