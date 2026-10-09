import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";
import { appDir } from "@/utils/route-discovery/app-tree";

export default async function QrLabelsPage() {
  return (
    <RouteIndexPage
      directory={appDir("(dev)", "demos", "tests", "qr-labels")}
basePath="/demos/tests/qr-labels"
      title="QR Labels"
    />
  );
}
