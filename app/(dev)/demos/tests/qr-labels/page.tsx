import { join } from "path";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

export default async function QrLabelsPage() {
  return (
    <RouteIndexPage
      directory={join(process.cwd(), "app", "(dev)", "demos", "tests", "qr-labels")}
      basePath="/legacy/tests/qr-labels"
      title="QR Labels"
    />
  );
}
