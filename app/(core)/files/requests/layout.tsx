import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Files" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/files", {
  titlePrefix: "Requests",
  title: "Files",
  letter: "RQ",
});

export default function FilesRequestsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
