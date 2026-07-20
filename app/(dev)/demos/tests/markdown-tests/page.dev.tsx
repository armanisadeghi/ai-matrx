import { join } from "path";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

export default async function MarkdownTestsPage() {
  return (
    <RouteIndexPage
      directory={join(process.cwd(), "app", "(dev)", "demos", "tests", "markdown-tests")}
basePath="/demos/tests/markdown-tests"
      title="Markdown Tests"
    />
  );
}
