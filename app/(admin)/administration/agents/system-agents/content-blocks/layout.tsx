import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "System Agents" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Content Blocks",
  title: "System Agents",
  letter: "CO",
});

export default function AdministrationAgentsSystemAgentsContentBlocksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
