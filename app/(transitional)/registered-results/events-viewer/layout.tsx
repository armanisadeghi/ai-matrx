import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Registered results" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/registered-results", {
  titlePrefix: "Events Viewer",
  title: "Registered results",
  letter: "EV",
});

export default function RegisteredResultsEventsViewerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
