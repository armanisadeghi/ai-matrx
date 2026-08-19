// app/(core)/marketing/email/page.tsx
//
// The Marketing pillar's front door to email. Today email IS Lane B — outreach
// sent from the customer's own verified mailbox — so this route opens the
// mailbox, the templates and the campaigns. Lane A (opt-in list marketing)
// stays a registered promise printed on the page; see the component header.

import type { Metadata } from "next";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { EmailFrontDoor } from "@/features/marketing/front-doors/EmailFrontDoor";

export const metadata: Metadata = {
  title: "Email",
  description:
    "The mailbox you send from, the templates you send, and the sequences that send them — outreach email, end to end.",
};

export default function MarketingEmailPage() {
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center pr-14">
          <h1 className="truncate text-sm font-medium text-foreground">
            Email
          </h1>
        </div>
      </PageHeader>
      <EmailFrontDoor />
    </>
  );
}
