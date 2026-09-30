import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Product Capture" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/tools/product-capture", {
  titlePrefix: "Answer",
  title: "Product Capture",
  letter: "AW",
});

export default function ToolsProductCaptureAnswerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
