import { join } from "path";
import { Columns3 } from "lucide-react";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/resizables", {
  title: "Resizable panel demos",
  description:
    "react-resizable-panels v4 — incremental demos covering SSR cookie persistence, programmatic show/hide, conditional panels, and nested layouts.",
});

export default async function ResizableDemosIndexPage() {
  return (
    <RouteIndexPage
      directory={join(process.cwd(), "app", "(dev)", "demos", "resizables")}
      basePath="/demos/resizables"
      title="Resizable panel demos"
      description="Each route is the simplest possible example of one new concept on top of the previous one. Read in order. The full pattern reference is in .claude/skills/react-resizable-panels-v4/SKILL.md."
      icon={Columns3}
    />
  );
}
