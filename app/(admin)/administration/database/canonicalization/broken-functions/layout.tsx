import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Canonicalization" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Broken Functions",
  title: "Canonicalization",
  letter: "BF",
});

export default function AdministrationDatabaseCanonicalizationBrokenFunctionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
