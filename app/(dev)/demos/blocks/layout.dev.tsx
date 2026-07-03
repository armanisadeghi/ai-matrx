import { join } from "path";
import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { createRouteMetadata } from "@/utils/route-metadata";

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
      directory={join(process.cwd(), "app", "(dev)", "demos", "blocks")}
      moduleHome="/demos/blocks"
      moduleName="Render blocks"
    >
      {children}
    </RouteHeaderData>
  );
}
