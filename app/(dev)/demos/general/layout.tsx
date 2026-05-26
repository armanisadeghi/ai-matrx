import { join } from "path";
import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { createRouteMetadata } from "@/utils/route-metadata";

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
      directory={join(process.cwd(), "app", "(dev)", "demos", "general")}
      moduleHome="/demo"
      moduleName="Demo"
    >
      {children}
    </RouteHeaderData>
  );
}
