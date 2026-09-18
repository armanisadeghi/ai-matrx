import { join } from "path";
import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/tests", {
  titlePrefix: "Markdown",
  title: "Tests",
  description: "Markdown rendering and editor tests",
  letter: "MDT",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RouteHeaderData
      directory={join(
        process.cwd(),
        "app",
        "(dev)",
        "demos",
        "tests",
        "markdown-tests",
      )}
      moduleHome="/demos/tests/markdown-tests"
      moduleName="Markdown Tests"
    >
      {children}
    </RouteHeaderData>
  );
}
