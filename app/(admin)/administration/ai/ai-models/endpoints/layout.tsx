import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "AI Models" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Endpoints",
  title: "AI Models",
  letter: "EN",
});

export default function AdministrationAiAiModelsEndpointsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
