import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "PDF Extractor" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/tools/pdf-extractor", {
  titlePrefix: "Admin",
  title: "PDF Extractor",
  letter: "AD",
});

export default function ToolsPdfExtractorAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
