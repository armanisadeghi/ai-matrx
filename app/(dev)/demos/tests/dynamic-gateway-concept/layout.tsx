import { join } from "path";
import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Dynamic Gateway",
  title: "Tests",
  description: "Dynamic gateway routing concept tests",
  letter: "DG",
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
        "dynamic-gateway-concept",
      )}
      moduleHome="/legacy/tests/dynamic-gateway-concept"
      moduleName="Dynamic Gateway Concept"
    >
      {children}
    </RouteHeaderData>
  );
}
