import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Scopes & Context" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Context Inspector",
  title: "Scopes & Context",
  letter: "CI",
});

export default function AdministrationScopesContextContextInspectorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
