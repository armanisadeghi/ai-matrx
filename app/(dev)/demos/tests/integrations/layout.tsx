import { join } from "path";
import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Integrations",
  title: "Tests",
  description: "Third-party integrations test harness",
  letter: "In",
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
        "integrations",
      )}
      moduleHome="/legacy/tests/integrations"
      moduleName="Integrations"
    >
      {children}
    </RouteHeaderData>
  );
}
