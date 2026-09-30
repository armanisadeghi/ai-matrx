import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Files" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/files", {
  titlePrefix: "Folders",
  title: "Files",
  letter: "FO",
});

export default function FilesFoldersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
