import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Database" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Data Integrity",
  title: "Database",
  letter: "DI",
});

export default function AdministrationDatabaseDataIntegrityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
