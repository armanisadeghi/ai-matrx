import { join } from "path";
import { FolderOpen } from "lucide-react";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos", {
  title: "Demos",
  description: "Interactive demo: Demos. AI Matrx demo route.",
});

export default async function DemosPage() {
  return (
    <RouteIndexPage
      directory={join(process.cwd(), "app", "(public)", "demos")}
      basePath="/demos"
      title="Demos"
      icon={FolderOpen}
    />
  );
}
