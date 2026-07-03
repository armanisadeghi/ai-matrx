import { join } from "path";
import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Sample nested",
  title: "Tests",
  description: "Nested app shell layout samples",
  letter: "SN",
});

export default function SampleNestedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RouteHeaderData
      directory={join(
        process.cwd(),
        "app",
        "(dev)",
        "demos",
        "tests",
        "app-shell-test",
        "single-option",
        "sample-nested",
      )}
      moduleHome="/demos/tests/app-shell-test/single-option/sample-nested"
      moduleName="Sample nested"
    >
      {children}
    </RouteHeaderData>
  );
}
