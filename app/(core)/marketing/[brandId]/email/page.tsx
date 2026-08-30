// app/(core)/marketing/[brandId]/email/page.tsx
//
// One client's Email section. Today email IS Lane B — outreach sent from the
// customer's own verified mailbox — so this route opens the mailbox, the
// templates and the campaigns. Lane A (opt-in list marketing) stays a
// registered promise printed on the page; see the component header.
//
// Brand-scoped 2026-08-30: `BrandScopedEmail` binds the canonical
// `EmailFrontDoor` to `useMarketingBrand()`, so the mailbox count is this
// client's organization and this client's template library is named and comes
// first. Templates, campaigns and the other organizations' libraries have NO
// brand link in the data model — they stay, and the page says out loud that
// they reach past this client. A filter we cannot apply is never faked.

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
