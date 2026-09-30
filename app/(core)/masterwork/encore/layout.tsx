import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Masterwork" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/masterwork", {
  titlePrefix: "Encore",
  title: "Masterwork",
  letter: "EN",
});

export default function MasterworkEncoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
