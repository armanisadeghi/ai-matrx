import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "AI Models" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Deprecated Audit",
  title: "AI Models",
  letter: "DE",
});

export default function AdministrationAiAiModelsDeprecatedAuditLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
