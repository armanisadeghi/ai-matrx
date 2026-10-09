import { FlaskConical } from "lucide-react";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

import { createRouteMetadata } from "@/utils/route-metadata";
import { appDir } from "@/utils/route-discovery/app-tree";

export const metadata = createRouteMetadata("/demos/feature-tests", {
  title: "Feature Tests",
  description: "Interactive demo: Feature Tests. AI Matrx demo route.",
});

export default async function FeatureTestsPage() {
  return (
    <RouteIndexPage
      directory={appDir("(public)", "demos", "feature-tests")}
      basePath="/demos/feature-tests"
      title="Feature Tests"
      icon={FlaskConical}
      shallow
    />
  );
}
