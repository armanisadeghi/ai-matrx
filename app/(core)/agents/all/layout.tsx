import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Agents" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/agents", {
  titlePrefix: "All",
  title: "Agents",
  letter: "AA",
});

export default function AgentsAllLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
