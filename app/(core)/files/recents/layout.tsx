import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Files" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/files", {
  titlePrefix: "Recents",
  title: "Files",
  letter: "RE",
});

export default function FilesRecentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
