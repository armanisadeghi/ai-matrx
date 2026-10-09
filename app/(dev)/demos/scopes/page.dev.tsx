import { Layers } from "lucide-react";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";
import { createRouteMetadata } from "@/utils/route-metadata";
import { appDir } from "@/utils/route-discovery/app-tree";

export const metadata = createRouteMetadata("/demos/scopes", {
  title: "Scope demos",
  description: "Interactive scope and context assignment experiments.",
});

export default async function ScopesDemosIndexPage() {
  return (
    <RouteIndexPage
      directory={appDir("(dev)", "demos", "scopes")}
      basePath="/demos/scopes"
      title="Scope demos"
      description="Scope picker and context assignment labs."
      icon={Layers}
    />
  );
}
