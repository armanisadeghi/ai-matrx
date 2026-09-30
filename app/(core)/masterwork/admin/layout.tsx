import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Masterwork" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/masterwork", {
  titlePrefix: "Admin",
  title: "Masterwork",
  letter: "AD",
});

export default function MasterworkAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
