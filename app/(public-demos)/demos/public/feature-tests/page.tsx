import { join } from "path";
import { FlaskConical } from "lucide-react";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/feature-tests", {
  title: "Feature Tests",
  description: "Interactive demo: Feature Tests. AI Matrx demo route.",
});

export default async function FeatureTestsPage() {
  return (
    <RouteIndexPage
      directory={join(process.cwd(), "app", "(public)", "demos", "feature-tests")}
      basePath="/demos/feature-tests"
      title="Feature Tests"
      icon={FlaskConical}
      shallow
    />
  );
}
