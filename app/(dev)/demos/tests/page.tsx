import { join } from "path";
import { FlaskConical } from "lucide-react";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

export default async function TestsPage() {
  return (
    <RouteIndexPage
      directory={join(process.cwd(), "app", "(dev)", "demos", "tests")}
      basePath="/tests"
      title="Tests"
      icon={FlaskConical}
    />
  );
}
