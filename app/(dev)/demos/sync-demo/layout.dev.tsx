import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { createRouteMetadata } from "@/utils/route-metadata";
import { appDir } from "@/utils/route-discovery/app-tree";

export const metadata = createRouteMetadata("/demos/sync-demo", {
  titlePrefix: "Sync",
  title: "Demos",
  description: "Theme and preference sync demos",
  letter: "Sy",
});

export default function SyncDemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RouteHeaderData
      directory={appDir("(dev)", "demos", "sync-demo")}
      moduleHome="/demos/sync-demo"
      moduleName="Sync demos"
    >
      {children}
    </RouteHeaderData>
  );
}
