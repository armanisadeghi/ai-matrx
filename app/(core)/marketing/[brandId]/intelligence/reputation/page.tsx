// app/(core)/marketing/[brandId]/intelligence/reputation/page.tsx
//
// Reputation is answered per WEBSITE, so the brand-level route is a chooser
// over this brand's sites — never a second copy of the workspace.


import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { BrandReputationSites } from "@/features/marketing/components/reputation/BrandReputationSites";

export default function BrandReputationPage() {
  return (
    <>
      <RecordPageHeader record={{ name: "Reputation" }} />
      <BrandReputationSites />
    </>
  );
}
