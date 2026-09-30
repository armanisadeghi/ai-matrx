import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Scopes & Context" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "System Context",
  title: "Scopes & Context",
  letter: "SY",
});

export default function AdministrationScopesContextSystemContextLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
