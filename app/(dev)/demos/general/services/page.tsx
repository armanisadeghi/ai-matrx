import { join } from "path";
import { Boxes } from "lucide-react";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo/services", {
  title: "Services",
  description: "Interactive demo: Services. AI Matrx demo route.",
});

export default async function DemoServicesIndexPage() {
  return (
    <RouteIndexPage
      directory={join(
        process.cwd(),
        "app",
        "(dev)",
        "demos",
        "general",
        "services",
      )}
      basePath="/legacy/demo/services"
      title="Service demos"
      description="Callback and reference manager experiments."
      icon={Boxes}
    />
  );
}
