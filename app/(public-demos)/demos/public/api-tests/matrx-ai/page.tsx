import { join } from "path";
import { CircuitBoard } from "lucide-react";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/api-tests/matrx-ai", {
  title: "Api Tests Matrx Ai",
  description: "Interactive demo: Api Tests Matrx Ai. AI Matrx demo route.",
});

export default async function MatrxAiDemosIndexPage() {
  return (
    <RouteIndexPage
      directory={join(
        process.cwd(),
        "app",
        "(public)",
        "demos",
        "api-tests",
        "matrx-ai",
      )}
      basePath="/demos/api-tests/matrx-ai"
      title="Matrx AI demos"
      description="Agent, chat, conversation, dynamic API, and tools demos."
      icon={CircuitBoard}
    />
  );
}
