import { join } from "path";
import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Color converter",
  title: "Tests",
  description: "Tailwind color conversion utilities",
  letter: "CC",
});

export default function ColorConverterLayout({
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
        "tailwind-test",
        "color-converter",
      )}
      moduleHome="/demos/tests/tailwind-test/color-converter"
      moduleName="Color converter"
    >
      {children}
    </RouteHeaderData>
  );
}
