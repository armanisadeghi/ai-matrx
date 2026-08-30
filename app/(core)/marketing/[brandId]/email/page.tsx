// app/(core)/marketing/[brandId]/email/page.tsx
//
// One client's Email section. Today email IS Lane B — outreach sent from the
// customer's own verified mailbox — so this route opens the mailbox, the
// templates and the campaigns. Lane A (opt-in list marketing) stays a
// registered promise printed on the page; see the component header.
//
// NOTE (agency restructure, 2026-08-29): `EmailFrontDoor` is the canonical
// component the flat `/marketing/email` route used and is mounted here
// unchanged. It reads its own scope from the URL rather than from the brand in
// the path; binding it to `useMarketingBrand()` is a component change, tracked
// in the restructure handoff.

import type { Metadata } from "next";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { BrandScopedEmail } from "@/features/marketing/front-doors/BrandScopedEmail";

export const metadata: Metadata = {
  title: "Email",
  description:
    "The mailbox you send from, the templates you send, and the sequences that send them — outreach email, end to end.",
};

export default function BrandEmailPage() {
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center">
          <h1 className="truncate text-sm font-medium text-foreground">
            Email
          </h1>
        </div>
      </PageHeader>
      <BrandScopedEmail />
    </>
  );
}
