import { join } from "path";
import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Animations",
  title: "Tests",
  description: "Animation and transition tests",
  letter: "An",
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
        "animation-tests",
      )}
      moduleHome="/demos/tests/animation-tests"
      moduleName="Animation tests"
    >
      {children}
    </RouteHeaderData>
  );
}
