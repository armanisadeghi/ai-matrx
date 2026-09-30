import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Masterwork" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/masterwork", {
  titlePrefix: "Approaches",
  title: "Masterwork",
  letter: "AP",
});

export default function MasterworkApproachesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
