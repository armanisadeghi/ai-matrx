import { join } from "path";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  title: "Demo",
  description: "Interactive demo: Demo. AI Matrx demo route.",
});

export default async function DemoPage() {
  return (
    <RouteIndexPage
      directory={join(process.cwd(), "app", "(dev)", "demos", "general")}
      basePath="/demo"
      title="Demo"
    />
  );
}
