import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "CX Dashboard" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Conversations",
  title: "CX Dashboard",
  letter: "CV",
});

export default function AdministrationChatCxDashboardConversationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
