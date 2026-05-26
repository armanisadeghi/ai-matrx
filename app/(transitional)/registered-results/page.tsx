import { join } from "path";
import { LayoutList } from "lucide-react";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

export default async function RegisteredResultsIndexPage() {
  return (
    <RouteIndexPage
      directory={join(
        process.cwd(),
        "app",
        "(transitional)",
        "registered-results",
      )}
      basePath="/registered-results"
      title="Registered results"
      description="Internal viewers for workflow-registered outputs."
      icon={LayoutList}
    />
  );
}
