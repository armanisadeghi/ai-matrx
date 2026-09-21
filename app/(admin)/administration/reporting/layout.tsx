import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  title: "Reporting",
  description:
    "Review platform reports, quality findings, events, and system inventories.",
  letter: "RP",
  canonicalPath: "/administration/reporting",
});

export default function ReportingAdministrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
