import { RefreshCw } from "lucide-react";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";
import { createRouteMetadata } from "@/utils/route-metadata";
import { appDir } from "@/utils/route-discovery/app-tree";

export const metadata = createRouteMetadata("/demos/sync-demo", {
  title: "Sync demos",
  description: "Theme and preference sync experiments.",
});

export default async function SyncDemoIndexPage() {
  return (
    <RouteIndexPage
      directory={appDir("(dev)", "demos", "sync-demo")}
      basePath="/demos/sync-demo"
      title="Sync demos"
      description="Cross-surface theme and preference synchronization."
      icon={RefreshCw}
    />
  );
}
