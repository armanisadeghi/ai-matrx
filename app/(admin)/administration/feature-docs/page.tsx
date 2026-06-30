import { redirect } from "next/navigation";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration/feature-docs", {
  title: "Feature Docs",
  description: "Internal markdown synced to admin.feature_docs",
  letter: "Fd",
});

export default function FeatureDocsHubPage() {
  redirect("/administration/feature-docs/codebase");
}
