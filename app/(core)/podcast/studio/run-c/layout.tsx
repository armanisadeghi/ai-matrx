import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Studio" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/podcast", {
  titlePrefix: "Run C",
  title: "Studio",
  letter: "RC",
});

export default function PodcastStudioRunCLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
