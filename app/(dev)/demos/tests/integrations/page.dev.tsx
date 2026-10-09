import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";
import { appDir } from "@/utils/route-discovery/app-tree";

export default async function IntegrationsPage() {
    return (
        <RouteIndexPage
            directory={appDir("(dev)", "demos", "tests", "integrations")}
basePath="/demos/tests/integrations"
            title="Integrations"
        />
    );
}
