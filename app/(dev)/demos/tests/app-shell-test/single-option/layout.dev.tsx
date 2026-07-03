import { join } from "path";
import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Single option",
  title: "Tests",
  description: "App shell single-option layout tests",
  letter: "SO",
});

export default function SingleOptionLayout({
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
      )}
      moduleHome="/demos/tests/app-shell-test/single-option"
      moduleName="Single option"
    >
      {children}
    </RouteHeaderData>
  );
}
