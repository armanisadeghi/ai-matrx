import { join } from "path";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

export default async function AppletTestsPage() {
    return (
        <RouteIndexPage
            directory={join(process.cwd(), "app", "(dev)", "demos", "tests", "applet-tests")}
basePath="/demos/tests/applet-tests"
            title="Applet Tests"
        />
    );
}
