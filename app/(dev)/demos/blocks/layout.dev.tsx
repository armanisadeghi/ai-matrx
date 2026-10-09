import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { createRouteMetadata } from "@/utils/route-metadata";
import { appDir } from "@/utils/route-discovery/app-tree";

export const metadata = createRouteMetadata("/demos/blocks", {
  titlePrefix: "Blocks",
  title: "Demos",
  description: "Render block playgrounds",
  letter: "Bk",
});

export default function BlocksDemosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RouteHeaderData
      directory={appDir("(dev)", "demos", "blocks")}
      moduleHome="/demos/blocks"
      moduleName="Render blocks"
    >
      {children}
    </RouteHeaderData>
  );
}
