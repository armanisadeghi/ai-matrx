import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";
import { appDir } from "@/utils/route-discovery/app-tree";

export default async function TailwindTestsPage() {
    return (
        <RouteIndexPage
            directory={appDir("(dev)", "demos", "tests", "tailwind-test")}
basePath="/demos/tests/tailwind-test"
            title="Tailwind Tests"
        />
    );
}
