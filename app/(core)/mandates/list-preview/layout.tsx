import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Mandates" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/mandates", {
  titlePrefix: "List Preview",
  title: "Mandates",
  letter: "LP",
});

export default function MandatesListPreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
