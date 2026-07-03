import { join } from "path";
import { Layers } from "lucide-react";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/scopes", {
  title: "Scope demos",
  description: "Interactive scope and context assignment experiments.",
});

export default async function ScopesDemosIndexPage() {
  return (
    <RouteIndexPage
      directory={join(process.cwd(), "app", "(dev)", "demos", "scopes")}
      basePath="/demos/scopes"
      title="Scope demos"
      description="Scope picker and context assignment labs."
      icon={Layers}
    />
  );
}
