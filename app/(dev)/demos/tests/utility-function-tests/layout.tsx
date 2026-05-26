import { join } from "path";
import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Utilities",
  title: "Tests",
  description: "Shared utility function tests",
  letter: "Ut",
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
        "utility-function-tests",
      )}
      moduleHome="/legacy/tests/utility-function-tests"
      moduleName="Utility Function Tests"
    >
      {children}
    </RouteHeaderData>
  );
}
