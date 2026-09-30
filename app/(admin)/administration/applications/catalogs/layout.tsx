import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Applications" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Catalogs",
  title: "Applications",
  letter: "CL",
});

export default function AdministrationApplicationsCatalogsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
