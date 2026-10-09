import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";
import { appDir } from "@/utils/route-discovery/app-tree";

export default async function DynamicGatewayConceptPage() {
  return (
    <RouteIndexPage
      directory={appDir("(dev)", "demos", "tests", "dynamic-gateway-concept")}
basePath="/demos/tests/dynamic-gateway-concept"
      title="Dynamic Gateway Concept"
    />
  );
}
