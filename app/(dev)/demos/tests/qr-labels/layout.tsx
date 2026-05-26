import { join } from "path";
import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "QR Labels",
  title: "Tests",
  description: "QR code and label generation tests",
  letter: "QR",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RouteHeaderData
      directory={join(
        process.cwd(),
        "app",
        "(dev)",
        "demos",
        "tests",
        "qr-labels",
      )}
      moduleHome="/legacy/tests/qr-labels"
      moduleName="QR Labels"
    >
      {children}
    </RouteHeaderData>
  );
}
