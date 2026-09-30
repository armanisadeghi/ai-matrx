import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Tables" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/data", {
  titlePrefix: "New Table",
  title: "Tables",
  letter: "NT",
});

export default function DataCreateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
