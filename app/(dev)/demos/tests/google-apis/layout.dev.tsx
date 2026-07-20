import { join } from "path";
import GoogleApisLayoutClient from "./GoogleApisLayoutClient";
import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/tests", {
  titlePrefix: "Google APIs",
  title: "Tests",
  description: "Google APIs integration tests",
  letter: "GA",
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
        "google-apis",
      )}
      moduleHome="/demos/tests/google-apis"
      moduleName="Google APIs"
    >
      <GoogleApisLayoutClient>{children}</GoogleApisLayoutClient>
    </RouteHeaderData>
  );
}
