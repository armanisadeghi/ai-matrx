import { join } from "path";
import { Lightbulb } from "lucide-react";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

export default async function AnimationTestsIndexPage() {
  return (
    <RouteIndexPage
      directory={join(
        process.cwd(),
        "app",
        "(dev)",
        "demos",
        "tests",
        "animation-tests",
      )}
      basePath="/legacy/tests/animation-tests"
      title="Animation tests"
      description="Motion experiments: menus, showcases, and scale demos."
      icon={Lightbulb}
    />
  );
}
