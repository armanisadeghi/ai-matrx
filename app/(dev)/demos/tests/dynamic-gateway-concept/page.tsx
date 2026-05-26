import { join } from "path";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

export default async function DynamicGatewayConceptPage() {
  return (
    <RouteIndexPage
      directory={join(process.cwd(), "app", "(dev)", "demos", "tests", "dynamic-gateway-concept")}
      basePath="/legacy/tests/dynamic-gateway-concept"
      title="Dynamic Gateway Concept"
    />
  );
}
