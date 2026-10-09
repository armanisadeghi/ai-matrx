import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";
import { appDir } from "@/utils/route-discovery/app-tree";

export default async function ModalsPage() {
    return (
        <RouteIndexPage
            directory={appDir("(dev)", "demos", "tests", "modals")}
basePath="/demos/tests/modals"
            title="Modals"
        />
    );
}
