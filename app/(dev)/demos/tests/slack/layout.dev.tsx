import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { createRouteMetadata } from "@/utils/route-metadata";
import { appDir } from "@/utils/route-discovery/app-tree";

export const metadata = createRouteMetadata("/demos/tests", {
  titlePrefix: "Slack",
  title: "Tests",
  description: "Slack integration and webhook tests",
  letter: "SK",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RouteHeaderData
      directory={appDir("(dev)", "demos", "tests", "slack")}
      moduleHome="/demos/tests/slack"
      moduleName="Slack"
    >
      {children}
    </RouteHeaderData>
  );
}
