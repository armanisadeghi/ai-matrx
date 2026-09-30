import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Agent Skills" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Ingest",
  title: "Agent Skills",
  letter: "IG",
});

export default function AdministrationAgentsSkillsIngestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
