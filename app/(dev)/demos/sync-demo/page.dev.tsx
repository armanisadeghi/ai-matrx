import { join } from "path";
import { RefreshCw } from "lucide-react";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/sync-demo", {
  title: "Sync demos",
  description: "Theme and preference sync experiments.",
});

export default async function SyncDemoIndexPage() {
  return (
    <RouteIndexPage
      directory={join(process.cwd(), "app", "(dev)", "demos", "sync-demo")}
      basePath="/demos/sync-demo"
      title="Sync demos"
      description="Cross-surface theme and preference synchronization."
      icon={RefreshCw}
    />
  );
}
