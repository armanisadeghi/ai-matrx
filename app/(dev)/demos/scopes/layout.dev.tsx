import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { createRouteMetadata } from "@/utils/route-metadata";
import { appDir } from "@/utils/route-discovery/app-tree";

export const metadata = createRouteMetadata("/demos/scopes", {
  titlePrefix: "Scopes",
  title: "Demos",
  description: "Scope and context assignment demos",
  letter: "SO",
});

export default function ScopesDemosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RouteHeaderData
      directory={appDir("(dev)", "demos", "scopes")}
      moduleHome="/demos/scopes"
      moduleName="Scope demos"
    >
      {children}
    </RouteHeaderData>
  );
}
