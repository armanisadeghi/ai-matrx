import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  title: "Billing",
  description:
    "Where the platform's money goes: AI and provider spend, and what customers paid us.",
  letter: "BI",
  canonicalPath: "/administration/billing",
});

export default function BillingAdministrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
