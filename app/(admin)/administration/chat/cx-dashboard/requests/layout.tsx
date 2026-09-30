import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "CX Dashboard" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Requests",
  title: "CX Dashboard",
  letter: "RE",
});

export default function AdministrationChatCxDashboardRequestsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
