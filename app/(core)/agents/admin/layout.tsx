import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Agents" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/agents", {
  titlePrefix: "Admin",
  title: "Agents",
  letter: "AD",
});

export default function AgentsAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
