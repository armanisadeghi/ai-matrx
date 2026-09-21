import type { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/crm/sending-identities", {
  titlePrefix: "Sending Mailboxes",
  title: "CRM",
  description:
    "Connect the mailboxes your outreach is sent from, prove you own their domains, and watch their delivery health.",
  letter: "SI",
});

export default function SendingIdentitiesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
