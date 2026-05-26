import { join } from "path";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

export default async function AppShellTestPage() {
  return (
    <RouteIndexPage
      directory={join(process.cwd(), "app", "(dev)", "demos", "tests", "app-shell-test")}
      basePath="/legacy/tests/app-shell-test"
      title="App Shell Test"
    />
  );
}
