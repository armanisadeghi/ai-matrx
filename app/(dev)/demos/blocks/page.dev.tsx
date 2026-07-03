import { join } from "path";
import { Blocks } from "lucide-react";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/blocks", {
  title: "Render blocks",
  description:
    "Playgrounds for map, stats, diff, and item presentation blocks.",
});

export default async function BlocksDemosIndexPage() {
  return (
    <RouteIndexPage
      directory={join(process.cwd(), "app", "(dev)", "demos", "blocks")}
      basePath="/demos/blocks"
      title="Render block demos"
      description="Visual block playgrounds — maps, KPI stats, diffs, and item presentation."
      icon={Blocks}
    />
  );
}
