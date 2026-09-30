import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Files" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/files", {
  titlePrefix: "Shared with Me",
  title: "Files",
  letter: "SW",
});

export default function FilesSharedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
