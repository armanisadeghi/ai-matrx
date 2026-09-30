import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "CRM" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/crm", {
  titlePrefix: "Admin",
  title: "CRM",
  letter: "AM",
});

export default function CrmAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
