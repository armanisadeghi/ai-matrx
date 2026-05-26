import { join } from "path";
import { Code2 } from "lucide-react";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo/code-generator", {
  title: "Code Generator",
  description: "Interactive demo: Code Generator. AI Matrx demo route.",
});

export default async function CodeGeneratorIndexPage() {
  return (
    <RouteIndexPage
      directory={join(
        process.cwd(),
        "app",
        "(dev)",
        "demos",
        "general",
        "code-generator",
      )}
      basePath="/legacy/demo/code-generator"
      title="Code generator demos"
      description="React live playground variants."
      icon={Code2}
    />
  );
}
