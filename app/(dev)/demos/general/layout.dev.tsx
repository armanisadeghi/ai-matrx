import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { createRouteMetadata } from "@/utils/route-metadata";
import { appDir } from "@/utils/route-discovery/app-tree";

export const dynamic = "force-dynamic";

export const metadata = createRouteMetadata("/demo", {
  title: "Demo",
  description:
    "Hub for interactive demos — voice, code generation, UI experiments, and tools",
  letter: "Dm",
});

// /demo lives back in (authenticated) — only the entity-using subfolders
// (component-demo, many-to-many-ui) live under (legacy)/legacy/demo.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RouteHeaderData
      directory={appDir("(dev)", "demos", "general")}
      moduleHome="/demo"
      moduleName="Demo"
    >
      {children}
    </RouteHeaderData>
  );
}
