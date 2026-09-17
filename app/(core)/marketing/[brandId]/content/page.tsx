// app/(core)/marketing/[brandId]/content/page.tsx
//
// The Content section's HOME — this brand's topical maps (placement decision
// 2026-09-16). It was a `permanentRedirect` into the content plan until this
// screen shipped; the plan keeps every address it had and is linked from here.
//
// ⚠️ That redirect was an HTTP 308, which browsers cache indefinitely. Anyone
// who opened this URL before today will keep landing on the content plan until
// they clear site data. Every in-app link therefore points at
// `/content/map` (`marketingRoutes.brandTopicalMapHome`), which no browser has
// ever cached a redirect for; `map/page.tsx` beside this file renders the same
// screen.

import PageHeader from "@/features/shell/components/header/PageHeader";
import { TopicalMapHome } from "@/features/marketing/seo/topical-map/components/TopicalMapHome";
import { TopicalMapHomeHeader } from "@/features/marketing/seo/topical-map/components/TopicalMapHomeHeader";

export default function BrandContentPage() {
  return (
    <>
      <PageHeader>
        <TopicalMapHomeHeader />
      </PageHeader>
      <TopicalMapHome />
    </>
  );
}
