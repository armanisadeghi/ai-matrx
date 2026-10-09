import { LayoutTemplate } from "lucide-react";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";
import { appDir } from "@/utils/route-discovery/app-tree";

export default async function LayoutTestsPage() {
  return (
    <RouteIndexPage
      directory={appDir("(dev)", "demos", "layout-tests")}
      basePath="/layout-tests"
      title="Mobile layout tests"
      description="Viewport, scroll, and fixed-input experiments for responsive layouts."
      icon={LayoutTemplate}
    />
  );
}
