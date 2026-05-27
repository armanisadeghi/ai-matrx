import { join } from "path";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

export default async function TailwindTestsPage() {
    return (
        <RouteIndexPage
            directory={join(process.cwd(), "app", "(dev)", "demos", "tests", "tailwind-test")}
            basePath="/legacy/tests/tailwind-test"
            title="Tailwind Tests"
        />
    );
}
