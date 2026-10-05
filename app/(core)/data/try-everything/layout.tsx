import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Data" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/data-v2", {
  titlePrefix: "Try Everything",
  title: "Data",
  letter: "TE",
});

export default function DataV2TryEverythingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
