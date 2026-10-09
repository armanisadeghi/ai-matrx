import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Applets" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Executions",
  title: "Applets",
  letter: "EX",
});

export default function AdministrationAgentsAppletsExecutionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
