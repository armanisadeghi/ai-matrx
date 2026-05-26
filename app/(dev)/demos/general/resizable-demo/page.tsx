import { join } from "path";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo/resizable-demo", {
  title: "Resizable Demo",
  description: "Interactive demo: Resizable Demo. AI Matrx demo route.",
});

export default async function ResizableDemoPage() {
  return (
    <RouteIndexPage
      directory={join(process.cwd(), "app", "(dev)", "demos", "general", "resizable-demo")}
      basePath="/legacy/demo/resizable-demo"
      title="Resizable Demo"
    />
  );
}
