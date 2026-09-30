import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Canonicalization" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "By Schema",
  title: "Canonicalization",
  letter: "BS",
});

export default function AdministrationDatabaseCanonicalizationBySchemaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
