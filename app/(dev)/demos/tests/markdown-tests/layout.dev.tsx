import { join } from "path";
import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Markdown",
  title: "Tests",
  description: "Markdown rendering and editor tests",
  letter: "Mk",
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
      moduleHome="/legacy/tests/markdown-tests"
      moduleName="Markdown Tests"
    >
      {children}
    </RouteHeaderData>
  );
}
