import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Components" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Alchemy",
  title: "Components",
  letter: "AL",
});

export default function AdministrationUiOfficialComponentsAlchemyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
