// The Outreach front door for one client — link and PR prospecting doors with
// live counts into the CRM (which owns contact machinery) and the sites'
// backlink prospecting.
//
// Re-doored 2026-08-30: the agency-model restructure retired the flat
// `/marketing/outreach` route to a shim but never re-mounted its canonical
// `OutreachFrontDoor` component (adversarial audit finding). It lives here in
// the Press & PR section, per the ratified design's pr/{press-room,
// media-lists, outreach} shape.
//
// Brand-scoped 2026-08-30: `BrandScopedOutreach` binds the canonical door to
// `useMarketingBrand()`, so prospecting sees only this client's websites and
// the mailbox count only this client's organization. The CRM doors that carry
// no brand link in the data model stay org-wide and say so on the page — a
// filter we cannot apply is never faked.

import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { BrandScopedOutreach } from "@/features/marketing/front-doors/BrandScopedOutreach";

export const metadata: Metadata = {
  title: "Outreach",
  description:
    "Link and PR prospecting, sequenced contact, and earned-placement tracking.",
};

export default function BrandOutreachPage() {
  return (
    <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]">
      <Suspense fallback={<LoadingSurface label="Loading outreach…" />}>
        <BrandScopedOutreach />
      </Suspense>
    </div>
  );
}
