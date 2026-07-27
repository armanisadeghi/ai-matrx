import { join } from "path";
import { SlidersHorizontal } from "lucide-react";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/run-settings", {
  title: "Run settings demos",
  description:
    "Consumer run-settings panels and the advanced scoring algorithm demo — task intent, capabilities, and model-tier hints.",
});

export default async function RunSettingsDemosIndexPage() {
  return (
    <RouteIndexPage
      directory={join(process.cwd(), "app", "(dev)", "demos", "run-settings")}
      basePath="/demos/run-settings"
      title="Run settings demos"
      description="Simple capability-first runner settings, plus the full advanced panel with live algorithm trace (points, constraints, band)."
      icon={SlidersHorizontal}
    />
  );
}
