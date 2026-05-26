import { join } from "path";
import { RouteHeaderData } from "@/components/ssr/RouteHeaderData";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Modals",
  title: "Tests",
  description: "Modal, dialog, and overlay tests",
  letter: "Mo",
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
        "modals",
      )}
      moduleHome="/legacy/tests/modals"
      moduleName="Modals"
    >
      {children}
    </RouteHeaderData>
  );
}
