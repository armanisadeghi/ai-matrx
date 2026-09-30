import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Scopes & Context" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Organizations",
  title: "Scopes & Context",
  letter: "OR",
});

export default function AdministrationScopesContextOrganizationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
