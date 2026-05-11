import { join } from "path";
import { FileText } from "lucide-react";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/ssr/demos/pdf-processing", {
  title: "PDF Processing",
  description: "Interactive demo: PDF Processing. AI Matrx demo route.",
});

export default async function Page() {
  return (
    <RouteIndexPage
      directory={join(
        process.cwd(),
        "app",
        "(ssr)",
        "ssr",
        "demos",
        "pdf-processing",
      )}
      basePath="/ssr/demos/pdf-processing"
      title="PDF Processing"
      description="Interactive demo: PDF Processing. AI Matrx demo route."
      icon={FileText}
    />
  );
}
