import { FlaskConical } from "lucide-react";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";
import { appDir } from "@/utils/route-discovery/app-tree";

export default async function TestsPage() {
  return (
    <RouteIndexPage
      directory={appDir("(dev)", "demos", "tests")}
basePath="/demos/tests"
      title="Tests"
      icon={FlaskConical}
    />
  );
}
