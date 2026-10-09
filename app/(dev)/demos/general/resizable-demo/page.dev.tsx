import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

import { createRouteMetadata } from "@/utils/route-metadata";
import { appDir } from "@/utils/route-discovery/app-tree";

export const metadata = createRouteMetadata("/demo/resizable-demo", {
  title: "Resizable Demo",
  description: "Interactive demo: Resizable Demo. AI Matrx demo route.",
});

export default async function ResizableDemoPage() {
  return (
    <RouteIndexPage
      directory={appDir("(dev)", "demos", "general", "resizable-demo")}
      basePath="/legacy/demo/resizable-demo"
      title="Resizable Demo"
    />
  );
}
