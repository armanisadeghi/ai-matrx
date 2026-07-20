import { join } from "path";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

export default async function ModalsPage() {
    return (
        <RouteIndexPage
            directory={join(process.cwd(), "app", "(dev)", "demos", "tests", "modals")}
basePath="/demos/tests/modals"
            title="Modals"
        />
    );
}
