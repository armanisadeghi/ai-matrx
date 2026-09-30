import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Product Capture" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/tools/product-capture", {
  titlePrefix: "All",
  title: "Product Capture",
  letter: "AL",
});

export default function ToolsProductCaptureAllLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
