import { join } from "path";
import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/tests", {
  titlePrefix: "Slack",
  title: "Tests",
  description: "Slack integration and webhook tests",
  letter: "Sl",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RouteHeaderData
      directory={join(process.cwd(), "app", "(dev)", "demos", "tests", "slack")}
      moduleHome="/demos/tests/slack"
      moduleName="Slack"
    >
      {children}
    </RouteHeaderData>
  );
}
