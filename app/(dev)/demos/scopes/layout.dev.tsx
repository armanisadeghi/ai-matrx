import { join } from "path";
import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/scopes", {
  titlePrefix: "Scopes",
  title: "Demos",
  description: "Scope and context assignment demos",
  letter: "Sc",
});

export default function ScopesDemosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RouteHeaderData
      directory={join(process.cwd(), "app", "(dev)", "demos", "scopes")}
      moduleHome="/demos/scopes"
      moduleName="Scope demos"
    >
      {children}
    </RouteHeaderData>
  );
}
