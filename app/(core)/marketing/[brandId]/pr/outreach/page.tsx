// The Outreach front door for one client — link and PR prospecting doors with
// live counts into the CRM (which owns contact machinery) and the sites'
// backlink prospecting.
//
// Re-doored 2026-08-30: the agency-model restructure retired the flat
// `/marketing/outreach` route to a shim but never re-mounted its canonical
// `OutreachFrontDoor` component (adversarial audit finding). It lives here in
// the Press & PR section, per the ratified design's pr/{press-room,
// media-lists, outreach} shape. Still org-wide inside; brand-scoping it is a
// component change tracked in the restructure handoff.

import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { OutreachFrontDoor } from "@/features/marketing/front-doors/OutreachFrontDoor";

export const metadata: Metadata = {
  title: "Outreach",
  description:
    "Link and PR prospecting, sequenced contact, and earned-placement tracking.",
};

export default function BrandOutreachPage() {
  return (
    <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]">
      <Suspense fallback={<LoadingSurface label="Loading outreach…" />}>
        <OutreachFrontDoor />
      </Suspense>
    </div>
  );
}
