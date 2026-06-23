import { join } from "path";
import { Wrench } from "lucide-react";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/tool-viz", {
  title: "Tool Visualization Demos",
  description:
    "Interactive demo: the tool-call visualization gallery and the live agent-turn simulator. AI Matrx demo route.",
});

export default async function ToolVizDemosIndexPage() {
  return (
    <RouteIndexPage
      directory={join(process.cwd(), "app", "(dev)", "demos", "tool-viz")}
      basePath="/demos/tool-viz"
      title="Tool visualization demos"
      description="The result-field gallery (press-Play streaming sections, DB renderers, diffs) and the live agent-turn simulator. Open one to run its variations."
      icon={Wrench}
    />
  );
}
