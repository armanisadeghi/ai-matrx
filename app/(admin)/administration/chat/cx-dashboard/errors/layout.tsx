import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "CX Dashboard" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Errors",
  title: "CX Dashboard",
  letter: "EO",
});

export default function AdministrationChatCxDashboardErrorsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
