import { join } from "path";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/general", {
  title: "General demos",
  description: "General-purpose demo routes and playgrounds.",
});

export default async function DemoPage() {
  return (
    <RouteIndexPage
      directory={join(process.cwd(), "app", "(dev)", "demos", "general")}
      basePath="/demos/general"
      title="General demos"
    />
  );
}
