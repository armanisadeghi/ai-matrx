import { join } from "path";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

export default async function UtilityFunctionTestsPage() {
    return (
        <RouteIndexPage
            directory={join(process.cwd(), "app", "(dev)", "demos", "tests", "utility-function-tests")}
            basePath="/legacy/tests/utility-function-tests"
            title="Utility Function Tests"
        />
    );
}
