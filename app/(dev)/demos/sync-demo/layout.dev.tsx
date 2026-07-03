import { join } from "path";
import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { createRouteMetadata } from "@/utils/route-metadata";

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
      directory={join(process.cwd(), "app", "(dev)", "demos", "sync-demo")}
      moduleHome="/demos/sync-demo"
      moduleName="Sync demos"
    >
      {children}
    </RouteHeaderData>
  );
}
