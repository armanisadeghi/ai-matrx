import { join } from "path";
import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Tailwind",
  title: "Tests",
  description: "Tailwind CSS styling and utility tests",
  letter: "Tw",
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
        "tailwind-test",
      )}
      moduleHome="/legacy/tests/tailwind-test"
      moduleName="Tailwind Tests"
    >
      {children}
    </RouteHeaderData>
  );
}
