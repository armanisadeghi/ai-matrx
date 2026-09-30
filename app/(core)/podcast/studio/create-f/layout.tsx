import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Studio" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/podcast", {
  titlePrefix: "Create F",
  title: "Studio",
  letter: "CF",
});

export default function PodcastStudioCreateFLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
