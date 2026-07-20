import { join } from "path";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

export default async function IntegrationsPage() {
    return (
        <RouteIndexPage
            directory={join(process.cwd(), "app", "(dev)", "demos", "tests", "integrations")}
basePath="/demos/tests/integrations"
            title="Integrations"
        />
    );
}
