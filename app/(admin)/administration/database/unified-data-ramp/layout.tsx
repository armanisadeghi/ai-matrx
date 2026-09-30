import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Database" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Unified Data Ramp",
  title: "Database",
  letter: "UD",
});

export default function AdministrationDatabaseUnifiedDataRampLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
