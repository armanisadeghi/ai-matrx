import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

import { createRouteMetadata } from "@/utils/route-metadata";
import { appDir } from "@/utils/route-discovery/app-tree";

export const metadata = createRouteMetadata("/demos/general", {
  title: "General demos",
  description: "General-purpose demo routes and playgrounds.",
});

export default async function DemoPage() {
  return (
    <RouteIndexPage
      directory={appDir("(dev)", "demos", "general")}
      basePath="/demos/general"
      title="General demos"
    />
  );
}
