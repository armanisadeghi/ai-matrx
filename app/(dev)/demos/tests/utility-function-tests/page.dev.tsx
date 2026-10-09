import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";
import { appDir } from "@/utils/route-discovery/app-tree";

export default async function UtilityFunctionTestsPage() {
    return (
        <RouteIndexPage
            directory={appDir("(dev)", "demos", "tests", "utility-function-tests")}
basePath="/demos/tests/utility-function-tests"
            title="Utility Function Tests"
        />
    );
}
