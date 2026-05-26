import { join } from "path";
import { LayoutTemplate } from "lucide-react";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

export default async function LayoutTestsPage() {
  return (
    <RouteIndexPage
      directory={join(process.cwd(), "app", "(dev)", "demos", "layout-tests")}
      basePath="/layout-tests"
      title="Mobile layout tests"
      description="Viewport, scroll, and fixed-input experiments for responsive layouts."
      icon={LayoutTemplate}
    />
  );
}
