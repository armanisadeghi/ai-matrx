import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "AI Models" tab shell — it names itself (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Translations",
  title: "AI Models",
  letter: "TR",
});

export default function AdministrationAiAiModelsTranslationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
