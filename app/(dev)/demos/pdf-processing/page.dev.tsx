import { FileText } from "lucide-react";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

import { createRouteMetadata } from "@/utils/route-metadata";
import { appDir } from "@/utils/route-discovery/app-tree";

export const metadata = createRouteMetadata("/demos/pdf-processing", {
  title: "PDF Processing",
  description: "Interactive demo: PDF Processing. AI Matrx demo route.",
});

export default async function Page() {
  return (
    <RouteIndexPage
      directory={appDir("(dev)", "demos", "pdf-processing")}
      basePath="/demos/pdf-processing"
      title="PDF Processing"
      description="Interactive demo: PDF Processing. AI Matrx demo route."
      icon={FileText}
    />
  );
}
