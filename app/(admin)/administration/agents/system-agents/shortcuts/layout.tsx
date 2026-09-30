import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "System Agents" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Shortcuts",
  title: "System Agents",
  letter: "SH",
});

export default function AdministrationAgentsSystemAgentsShortcutsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
