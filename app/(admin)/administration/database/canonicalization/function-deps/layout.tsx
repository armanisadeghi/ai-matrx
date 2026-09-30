import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Canonicalization" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Function Deps",
  title: "Canonicalization",
  letter: "FU",
});

export default function AdministrationDatabaseCanonicalizationFunctionDepsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
