import { join } from "path";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

export default async function FieldTestsPage() {
    return (
        <RouteIndexPage
            directory={join(process.cwd(), "app", "(dev)", "demos", "tests", "field-tests")}
            basePath="/legacy/tests/field-tests"
            title="Field Tests"
        />
    );
}
