import { join } from "path";
import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Animated menu",
  title: "Tests",
  description: "Animated menu motion experiments",
  letter: "AM",
});

export default function AnimatedMenuLayout({
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
        "animation-tests",
        "animated-menu",
      )}
      moduleHome="/demos/tests/animation-tests/animated-menu"
      moduleName="Animated menu"
    >
      {children}
    </RouteHeaderData>
  );
}
