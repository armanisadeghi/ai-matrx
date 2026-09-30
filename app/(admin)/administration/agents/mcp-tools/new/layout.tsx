import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "MCP Tools" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "New Tool",
  title: "MCP Tools",
  letter: "NT",
});

export default function AdministrationAgentsMcpToolsNewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
