import { join } from "path";
import { LayoutGrid } from "lucide-react";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos", {
  title: "Demos",
  description:
    "Unified index of every demo, test, and experimental route in the app.",
});

export default async function DemosLandingPage() {
  return (
    <RouteIndexPage
      directory={join(process.cwd(), "app", "(dev)", "demos")}
      basePath="/demos"
      title="Demos & tests"
      description="Internal demos, test pages, and experimental surfaces. Add a route under app/(dev)/demos and it appears here automatically."
      icon={LayoutGrid}
    />
  );
}
