import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  title: "Automation",
  description:
    "Inspect schedules, runs, leases, tasks, templates, and automation health.",
  letter: "AU",
  canonicalPath: "/administration/automation",
});

export default function AutomationAdministrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
