import { join } from "path";
import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "App Shell",
  title: "Tests",
  description: "App shell layout and chrome tests",
  letter: "AS",
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
        "app-shell-test",
      )}
      moduleHome="/legacy/tests/app-shell-test"
      moduleName="App Shell Test"
    >
      {children}
    </RouteHeaderData>
  );
}
